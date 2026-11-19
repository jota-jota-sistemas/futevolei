// tests/progresso-store.unit.test.ts
//
// Testa `criarProgressoStoreBrowser(clienteMock)` (sem banco): leitura em lote,
// sem N+1, paginada e com contagem de duplas, chaveamentos e jogos.

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TAMANHO_LOTE, criarProgressoStoreBrowser } from "../src/store/progressoStore";

interface Chamada {
  tabela: string;
  colunas: unknown;
  in: [string, unknown[]][];
  order: unknown[];
  range: number[];
}

type Resposta = { data?: unknown; error?: unknown };

/** Cliente fake: respostas por tabela (fila; a última se repete). */
function mock(respostas: Record<string, Resposta[]>) {
  const chamadas: Chamada[] = [];
  const filas = Object.fromEntries(Object.entries(respostas).map(([k, v]) => [k, [...v]]));
  const client = {
    from(tabela: string) {
      const c: Chamada = { tabela, colunas: null, in: [], order: [], range: [] };
      const b: Record<string, unknown> = {
        select: vi.fn((cols: unknown) => ((c.colunas = cols), b)),
        in: vi.fn((col: string, ids: unknown[]) => (c.in.push([col, ids]), b)),
        order: vi.fn((...a: unknown[]) => ((c.order = a), b)),
        range: vi.fn((de: number, ate: number) => ((c.range = [de, ate]), b)),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
          chamadas.push(c);
          const fila = filas[tabela] ?? [{ data: [] }];
          const r = fila.length > 1 ? fila.shift()! : fila[0];
          return Promise.resolve({ data: r.data ?? null, error: r.error ?? null }).then(res, rej);
        },
      };
      return b;
    },
  } as unknown as SupabaseClient;
  return { client, chamadas };
}

const cat = (id: string, campeonato: string, nome: string, duplas: number, chaveamento?: string) => ({
  id,
  campeonato_id: campeonato,
  nome,
  duplas: [{ count: duplas }],
  chaveamentos: chaveamento ? { id: chaveamento } : null,
});

describe("progressoStore.carregar", () => {
  it("sem ids: nada a ler", async () => {
    const m = mock({});
    expect(await criarProgressoStoreBrowser(m.client).carregar([])).toEqual({ ok: true, valor: {} });
    expect(m.chamadas).toHaveLength(0);
  });

  it("junta categorias, duplas, chaveamentos e jogos por campeonato (byes não contam)", async () => {
    const m = mock({
      categorias: [
        {
          data: [
            cat("c1", "copa", "Open", 8, "h1"),
            cat("c2", "copa", "Master", 4),
            cat("c3", "rio", "Misto", 6, "h3"),
          ],
        },
      ],
      jogos: [
        {
          data: [
            { chaveamento_id: "h1", vencedor_id: "d1", a_bye: false, b_bye: false },
            { chaveamento_id: "h1", vencedor_id: null, a_bye: false, b_bye: false },
            { chaveamento_id: "h1", vencedor_id: "d9", a_bye: true, b_bye: false }, // bye: não conta
            { chaveamento_id: "h3", vencedor_id: "d2", a_bye: false, b_bye: false },
          ],
        },
      ],
    });
    const r = await criarProgressoStoreBrowser(m.client).carregar(["copa", "rio", "vazio"]);
    expect(r).toEqual({
      ok: true,
      valor: {
        copa: { categorias: 2, duplas: 12, chaveamentos: 1, jogos: 2, concluidos: 1, nomesCategorias: ["Master", "Open"] },
        rio: { categorias: 1, duplas: 6, chaveamentos: 1, jogos: 1, concluidos: 1, nomesCategorias: ["Misto"] },
        vazio: { categorias: 0, duplas: 0, chaveamentos: 0, jogos: 0, concluidos: 0, nomesCategorias: [] },
      },
    });
  });

  it("duas consultas no total (sem N+1), ambas em lote por .in()", async () => {
    const m = mock({ categorias: [{ data: [cat("c1", "a", "Open", 2, "h1")] }], jogos: [{ data: [] }] });
    await criarProgressoStoreBrowser(m.client).carregar(["a", "b", "c"]);
    expect(m.chamadas.map((c) => c.tabela)).toEqual(["categorias", "jogos"]);
    expect(m.chamadas[0].in).toEqual([["campeonato_id", ["a", "b", "c"]]]);
    expect(m.chamadas[1].in).toEqual([["chaveamento_id", ["h1"]]]);
    expect(String(m.chamadas[0].colunas)).toContain("duplas(count)");
  });

  it("sem chaveamento nenhum, nem consulta os jogos", async () => {
    const m = mock({ categorias: [{ data: [cat("c1", "a", "Open", 2)] }] });
    await criarProgressoStoreBrowser(m.client).carregar(["a"]);
    expect(m.chamadas.map((c) => c.tabela)).toEqual(["categorias"]);
  });

  it("ids repetidos e vazios são ignorados; passa de TAMANHO_LOTE: várias consultas em lote", async () => {
    const ids = Array.from({ length: TAMANHO_LOTE + 5 }, (_, i) => `e${i}`);
    const m = mock({ categorias: [{ data: [] }] });
    const r = await criarProgressoStoreBrowser(m.client).carregar([...ids, "e0", ""]);
    expect(r.ok && Object.keys(r.valor)).toHaveLength(TAMANHO_LOTE + 5);
    const categorias = m.chamadas.filter((c) => c.tabela === "categorias");
    expect(categorias).toHaveLength(2);
    expect(categorias[0].in[0][1]).toHaveLength(TAMANHO_LOTE);
    expect(categorias[1].in[0][1]).toHaveLength(5);
  });

  it("pagina quando a página vem cheia (até vir menos que o tamanho)", async () => {
    const m = mock({
      categorias: [
        { data: [cat("c1", "a", "A", 1), cat("c2", "a", "B", 1)] }, // cheia (pagina = 2)
        { data: [cat("c3", "a", "C", 1)] }, // última
      ],
    });
    const r = await criarProgressoStoreBrowser(m.client, { pagina: 2 }).carregar(["a"]);
    expect(r.ok && r.valor.a.categorias).toBe(3);
    expect(m.chamadas.map((c) => c.range)).toEqual([[0, 1], [2, 3]]);
    expect(m.chamadas[0].order[0]).toBe("id"); // ordem estável para paginar
  });

  it("contagem de duplas como objeto, vazia ou ausente vira número", async () => {
    const m = mock({
      categorias: [
        {
          data: [
            { id: "c1", campeonato_id: "a", nome: "X", duplas: { count: 3 }, chaveamentos: [] },
            { id: "c2", campeonato_id: "a", nome: "Y", duplas: [], chaveamentos: null },
            { id: "c3", campeonato_id: "a", nome: "Z" },
          ],
        },
      ],
    });
    const r = await criarProgressoStoreBrowser(m.client).carregar(["a"]);
    expect(r.ok && r.valor.a.duplas).toBe(3);
  });

  it("erro em qualquer consulta -> FALHA_LEITURA; exceção também", async () => {
    const erroCat = mock({ categorias: [{ error: { message: "x" } }] });
    expect(await criarProgressoStoreBrowser(erroCat.client).carregar(["a"])).toEqual({ ok: false, erro: { code: "FALHA_LEITURA" } });

    const erroJogos = mock({ categorias: [{ data: [cat("c1", "a", "O", 1, "h1")] }], jogos: [{ error: { message: "x" } }] });
    expect(await criarProgressoStoreBrowser(erroJogos.client).carregar(["a"])).toEqual({ ok: false, erro: { code: "FALHA_LEITURA" } });

    const quebrado = { from: () => { throw new Error("rede"); } } as unknown as SupabaseClient;
    expect(await criarProgressoStoreBrowser(quebrado).carregar(["a"])).toEqual({ ok: false, erro: { code: "FALHA_LEITURA" } });
  });
});
