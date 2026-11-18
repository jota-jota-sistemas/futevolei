import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  carregarEventos,
  eventosFuturos,
  hojeSaoPaulo,
  limparCacheEventos,
  linhaParaEvento,
  type LinhaEventoDb,
} from "../src/utils/eventos-db";

const linha = (extra: Partial<LinhaEventoDb> = {}): LinhaEventoDb => ({
  id: "261113_x",
  id_origem: "261113_x_longo",
  nome: "  Copa X ",
  data: "2026-11-13",
  data_fim: "2026-11-14",
  cidade: "OURINHOS",
  uf: "SP",
  endereco: "Arena Kbeça",
  preco: 70,
  preco_texto: "R$ 70,00",
  local: null,
  foto: null,
  descricao: null,
  instagram: "https://www.instagram.com/p/x/",
  inscricao: "https://exemplo.com/inscricao",
  fonte: "https://torneios-ftv.com",
  listado: true,
  categorias: [{ nome: "iniciante" }, { nome: "Amador C", chaveamentos: { id: "c1" } }],
  ...extra,
});

describe("linhaParaEvento", () => {
  it("converte para o modelo do site com cidade e categorias padronizadas", () => {
    const e = linhaParaEvento(linha());
    expect(e).toMatchObject({
      id: "261113_x",
      nome: "Copa X",
      data: "2026-11-13",
      dataFim: "2026-11-14",
      local: "Arena Kbeça, Ourinhos, SP",
      precoTexto: "R$ 70,00",
      inscricao: "https://exemplo.com/inscricao",
      listado: true,
      idOrigem: "261113_x_longo",
    });
    expect(e.categorias).toEqual(["Amador C", "Iniciante"]);
  });

  it("guarda os nomes de categoria exatamente como no banco (para organizar)", () => {
    expect(linhaParaEvento(linha()).categoriasBanco).toEqual(["Amador C", "iniciante"]);
  });

  it("temChaveamento aceita objeto, lista e ausência", () => {
    const com = (chaveamentos: unknown) =>
      linhaParaEvento(linha({ categorias: [{ nome: "A", chaveamentos: chaveamentos as never }] })).temChaveamento;
    expect(com({ id: "1" })).toBe(true);
    expect(com([{ id: "1" }])).toBe(true);
    expect(com([])).toBe(false);
    expect(com(null)).toBe(false);
    expect(linhaParaEvento(linha({ categorias: null })).temChaveamento).toBe(false);
  });

  it("linha antiga sem cidade usa o texto de local", () => {
    const e = linhaParaEvento(
      linha({ cidade: null, uf: null, endereco: null, local: "Morumbi, São Paulo", data_fim: null })
    );
    expect(e.local).toBe("Morumbi, São Paulo");
    expect(e.dataFim).toBeUndefined();
  });

  it("preço numérico em texto, data_fim igual a data e campos vazios", () => {
    const e = linhaParaEvento(linha({ preco: "70.00", data_fim: "2026-11-13", foto: "", descricao: null, inscricao: null }));
    expect(e.dataFim).toBeUndefined();
    expect(e.foto).toBe("");
    expect(e.inscricao).toBeUndefined();
  });

  it("listado ausente conta como listado", () => {
    expect(linhaParaEvento(linha({ listado: null })).listado).toBe(true);
    expect(linhaParaEvento(linha({ listado: false })).listado).toBe(false);
  });
});

describe("eventosFuturos e hoje", () => {
  const ev = (data: string, dataFim?: string) => ({ id: data, nome: "n", data, dataFim, local: "", foto: "", descricao: "" });
  it("considera dataFim: evento em andamento continua", () => {
    const r = eventosFuturos([ev("2026-11-01", "2026-11-10"), ev("2026-11-01"), ev("2026-11-20")], "2026-11-10");
    expect(r.map((e) => e.data + (e.dataFim ?? ""))).toEqual(["2026-11-012026-11-10", "2026-11-20"]);
  });

  it("hoje usa o fuso de São Paulo (00h UTC ainda é o dia anterior)", () => {
    expect(hojeSaoPaulo(new Date("2026-11-09T00:30:00Z"))).toBe("2026-11-08");
    expect(hojeSaoPaulo(new Date("2026-11-09T12:00:00Z"))).toBe("2026-11-09");
  });
});

/** Cliente falso: registra a cadeia de chamadas e devolve `resposta` ao aguardar. */
function clienteFalso(resposta: { data: unknown; error: { message: string } | null }) {
  const chamadas: string[] = [];
  const q: Record<string, unknown> = {};
  const registrar = (nome: string) => (...a: unknown[]) => (chamadas.push(`${nome}(${a.map((x) => JSON.stringify(x)).join(",")})`), q);
  for (const m of ["select", "eq", "order"]) q[m] = registrar(m);
  q.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(resposta).then(ok, ko);
  const from = vi.fn((tabela: string) => (chamadas.push(`from(${tabela})`), q));
  return { client: { from } as unknown as SupabaseClient, chamadas, from };
}

describe("carregarEventos", () => {
  beforeEach(limparCacheEventos);

  it("escopo público: só ativos e listados, e só os que não terminaram", async () => {
    const { client, chamadas } = clienteFalso({
      data: [linha({ id: "a", data: "2026-11-13" }), linha({ id: "b", data: "2026-01-01", data_fim: "2026-01-02" })],
      error: null,
    });
    const r = await carregarEventos({ client, hoje: "2026-11-01" });
    expect(r.map((e) => e.id)).toEqual(["a"]);
    expect(chamadas.join(" ")).toContain('eq("ativo",true)');
    expect(chamadas.join(" ")).toContain('eq("listado",true)');
  });

  it("escopo todos: inclui não listados e eventos passados", async () => {
    const { client, chamadas } = clienteFalso({
      data: [linha({ id: "a", data: "2020-01-01", data_fim: null, listado: false })],
      error: null,
    });
    const r = await carregarEventos({ client, escopo: "todos", hoje: "2026-11-01" });
    expect(r).toHaveLength(1);
    expect(chamadas.join(" ")).not.toContain('eq("listado"');
  });

  it("erro do banco lança com mensagem útil", async () => {
    const { client } = clienteFalso({ data: null, error: { message: "relation does not exist" } });
    await expect(carregarEventos({ client })).rejects.toThrow(/Não foi possível carregar os eventos.*relation does not exist.*seed-eventos/s);
  });

  it("sem dados devolve lista vazia", async () => {
    const { client } = clienteFalso({ data: null, error: null });
    expect(await carregarEventos({ client })).toEqual([]);
  });
});
