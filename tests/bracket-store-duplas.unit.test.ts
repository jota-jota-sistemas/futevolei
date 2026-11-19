// tests/bracket-store-duplas.unit.test.ts
//
// Novas operações da Bracket_Store para a inscrição rápida: inserir várias
// duplas de uma vez, corrigir uma dupla e ler os vínculos com jogadores.
// Cliente Supabase simulado e encadeável (nenhum banco real).

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { criarBracketStoreBrowser, type CategoryRef } from "../src/store/bracketStore";

type Op = "select" | "insert" | "update" | "delete";
interface Resposta {
  data?: unknown;
  error?: unknown;
}
interface Chamada {
  table: string;
  op: Op;
  args: unknown[];
  eq: [string, unknown][];
}

const ok = (data: unknown = []): Resposta => ({ data, error: null });
const falha = (): Resposta => ({ data: null, error: { message: "boom" } });

class Mock {
  private respostas = new Map<string, Resposta[]>();
  readonly chamadas: Chamada[] = [];
  responder(table: string, op: Op, r: Resposta | Resposta[]): this {
    this.respostas.set(`${table}:${op}`, Array.isArray(r) ? [...r] : [r]);
    return this;
  }
  de(table: string, op: Op): Chamada[] {
    return this.chamadas.filter((c) => c.table === table && c.op === op);
  }
  cliente(): SupabaseClient {
    const self = this;
    return {
      from(table: string) {
        const c: Chamada = { table, op: "select", args: [], eq: [] };
        let mutou = false;
        const resolver = (): Resposta => {
          const fila = self.respostas.get(`${table}:${c.op}`);
          if (!fila) return ok([]);
          return fila.length > 1 ? fila.shift()! : fila[0];
        };
        const terminal = () => {
          self.chamadas.push(c);
          const r = resolver();
          return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
        };
        const b: Record<string, unknown> = {
          select: vi.fn((cols?: unknown) => {
            if (!mutou) {
              c.op = "select";
              c.args = [cols];
            }
            return b;
          }),
          insert: vi.fn((rows: unknown) => ((c.op = "insert"), (c.args = [rows]), (mutou = true), b)),
          update: vi.fn((patch: unknown) => ((c.op = "update"), (c.args = [patch]), (mutou = true), b)),
          eq: vi.fn((col: string, val: unknown) => (c.eq.push([col, val]), b)),
          maybeSingle: vi.fn(() => {
            const r = resolver();
            self.chamadas.push(c);
            const data = Array.isArray(r.data) ? (r.data[0] ?? null) : (r.data ?? null);
            return Promise.resolve({ data, error: r.error ?? null });
          }),
          then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => terminal().then(res, rej),
        };
        return b;
      },
    } as unknown as SupabaseClient;
  }
}

const REF: CategoryRef = { campeonatoId: "camp-1", categoriaId: "cat-1" };
const J1 = "11111111-1111-4111-8111-111111111111";
const J2 = "22222222-2222-4222-8222-222222222222";

const nova = (a: string, b: string, extra: Record<string, unknown> = {}) => ({
  nomeDupla: `${a} & ${b} t`,
  atletaA: a,
  atletaB: b,
  ...extra,
});

describe("adicionarDuplas (lote)", () => {
  it("lote vazio: sucesso sem tocar no banco", async () => {
    const m = new Mock();
    expect(await criarBracketStoreBrowser(m.cliente()).adicionarDuplas(REF, [])).toEqual({ ok: true, valor: [] });
    expect(m.chamadas).toHaveLength(0);
  });

  it("insere TODAS em uma escrita só, com horários distintos e vínculos opcionais", async () => {
    const m = new Mock().responder("duplas", "select", ok([{ nome_dupla: "Já & Existe t" }]));
    const r = await criarBracketStoreBrowser(m.cliente()).adicionarDuplas(REF, [
      nova("Ana", "Bia", { jogadorAId: J1 }),
      nova("Cris", "Duda", { jogadorAId: "nao-uuid", jogadorBId: J2 }),
    ]);
    expect(r.ok && r.valor.map((p) => p.atletaA)).toEqual(["Ana", "Cris"]);
    const inserts = m.de("duplas", "insert");
    expect(inserts).toHaveLength(1);
    const linhas = inserts[0].args[0] as Record<string, unknown>[];
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({ categoria_id: "cat-1", atleta_a: "Ana", atleta_b: "Bia", seed: null, jogador_a_id: J1 });
    expect(linhas[0]).not.toHaveProperty("jogador_b_id");
    // vínculo inválido é ignorado; o válido entra
    expect(linhas[1]).not.toHaveProperty("jogador_a_id");
    expect(linhas[1]).toMatchObject({ jogador_b_id: J2 });
    expect(new Set(linhas.map((l) => l.criado_em)).size).toBe(2);
    expect(new Set(linhas.map((l) => l.id)).size).toBe(2);
  });

  it("nome repetido DENTRO do lote ou contra as existentes cancela tudo (nada é gravado)", async () => {
    const m = new Mock().responder("duplas", "select", ok([{ nome_dupla: "Ana & Bia t" }]));
    const store = criarBracketStoreBrowser(m.cliente());
    expect(await store.adicionarDuplas(REF, [nova("Cris", "Duda"), nova("Ana", "Bia")])).toEqual({
      ok: false,
      erro: { code: "NOME_DUPLICADO" },
    });
    expect(await store.adicionarDuplas(REF, [nova("Eva", "Fia"), nova("Eva", "Fia")])).toEqual({
      ok: false,
      erro: { code: "NOME_DUPLICADO" },
    });
    expect(m.de("duplas", "insert")).toHaveLength(0);
  });

  it("atleta inválido cancela o lote; mesmo jogador nos dois lugares também", async () => {
    const m = new Mock().responder("duplas", "select", ok([]));
    const store = criarBracketStoreBrowser(m.cliente());
    expect(await store.adicionarDuplas(REF, [nova("Ana", "Bia"), nova("   ", "Duda")])).toEqual({
      ok: false,
      erro: { code: "NOME_ATLETA_INVALIDO", qual: "A" },
    });
    expect(await store.adicionarDuplas(REF, [nova("Ana", "Bia", { jogadorAId: J1, jogadorBId: J1 })])).toEqual({
      ok: false,
      erro: { code: "NOME_ATLETA_INVALIDO", qual: "B" },
    });
    expect(m.de("duplas", "insert")).toHaveLength(0);
  });

  it("falha de leitura -> FALHA_LEITURA; de escrita -> FALHA_PERSISTENCIA", async () => {
    const leitura = new Mock().responder("duplas", "select", falha());
    expect(await criarBracketStoreBrowser(leitura.cliente()).adicionarDuplas(REF, [nova("A", "B")])).toEqual({
      ok: false,
      erro: { code: "FALHA_LEITURA" },
    });
    const escrita = new Mock().responder("duplas", "select", ok([])).responder("duplas", "insert", falha());
    expect(await criarBracketStoreBrowser(escrita.cliente()).adicionarDuplas(REF, [nova("A", "B")])).toEqual({
      ok: false,
      erro: { code: "FALHA_PERSISTENCIA" },
    });
  });
});

describe("editarDupla", () => {
  const linha = (over: Record<string, unknown> = {}) => ({
    id: "d1",
    categoria_id: "cat-1",
    nome_dupla: "Ana & Bea t",
    atleta_a: "Ana",
    atleta_b: "Bea",
    seed: 3,
    criado_em: "2026-01-01T00:00:00.000Z",
    ...over,
  });

  it("atualiza atletas e regenera o nome interno, sem tocar nos vínculos quando não informados", async () => {
    const m = new Mock()
      .responder("chaveamentos", "select", ok(null))
      .responder("duplas", "select", ok([{ id: "d1", nome_dupla: "Ana & Bea t" }, { id: "d2", nome_dupla: "Outra & Dupla t" }]))
      .responder("duplas", "update", ok([linha({ atleta_b: "Bia", nome_dupla: "Ana & Bia novo" })]));
    const r = await criarBracketStoreBrowser(m.cliente()).editarDupla(REF, "d1", { atletaA: "Ana", atletaB: "Bia" });
    expect(r.ok && r.valor).toMatchObject({ id: "d1", atletaB: "Bia", seed: 3 });
    const u = m.de("duplas", "update")[0];
    const patch = u.args[0] as Record<string, unknown>;
    expect(patch).toMatchObject({ atleta_a: "Ana", atleta_b: "Bia" });
    expect(String(patch.nome_dupla)).toMatch(/^Ana & Bia \d{4}-/);
    expect(patch).not.toHaveProperty("jogador_a_id");
    expect(patch).not.toHaveProperty("jogador_b_id");
    expect(patch).not.toHaveProperty("seed");
    expect(u.eq).toEqual([["id", "d1"], ["categoria_id", "cat-1"]]);
  });

  it("vínculo: id válido vincula, null desfaz, inválido vira null", async () => {
    const m = new Mock()
      .responder("chaveamentos", "select", ok(null))
      .responder("duplas", "select", ok([]))
      .responder("duplas", "update", ok([linha()]));
    await criarBracketStoreBrowser(m.cliente()).editarDupla(REF, "d1", {
      atletaA: "Ana",
      atletaB: "Bea",
      jogadorAId: J1,
      jogadorBId: null,
    });
    expect(m.de("duplas", "update")[0].args[0]).toMatchObject({ jogador_a_id: J1, jogador_b_id: null });
    await criarBracketStoreBrowser(m.cliente()).editarDupla(REF, "d1", { atletaA: "A", atletaB: "B", jogadorAId: "x" });
    expect(m.de("duplas", "update")[1].args[0]).toMatchObject({ jogador_a_id: null });
  });

  it("com chaveamento gerado: EDICAO_BLOQUEADA e nada é gravado", async () => {
    const m = new Mock().responder("chaveamentos", "select", ok({ id: "ch1" }));
    const r = await criarBracketStoreBrowser(m.cliente()).editarDupla(REF, "d1", { atletaA: "Ana", atletaB: "Bia" });
    expect(r).toEqual({ ok: false, erro: { code: "EDICAO_BLOQUEADA" } });
    expect(m.de("duplas", "update")).toHaveLength(0);
  });

  it("atleta inválido nem consulta o banco; mesmo jogador nos dois lados é recusado", async () => {
    const m = new Mock();
    const store = criarBracketStoreBrowser(m.cliente());
    expect(await store.editarDupla(REF, "d1", { atletaA: " ", atletaB: "Bia" })).toEqual({
      ok: false,
      erro: { code: "NOME_ATLETA_INVALIDO", qual: "A" },
    });
    expect(m.chamadas).toHaveLength(0);

    const m2 = new Mock().responder("chaveamentos", "select", ok(null)).responder("duplas", "select", ok([]));
    expect(
      await criarBracketStoreBrowser(m2.cliente()).editarDupla(REF, "d1", { atletaA: "A", atletaB: "B", jogadorAId: J1, jogadorBId: J1 })
    ).toEqual({ ok: false, erro: { code: "NOME_ATLETA_INVALIDO", qual: "B" } });
    expect(m2.de("duplas", "update")).toHaveLength(0);
  });

  it("dupla inexistente (nenhuma linha) ou erro de escrita -> FALHA_PERSISTENCIA; leitura -> FALHA_LEITURA", async () => {
    const vazio = new Mock().responder("chaveamentos", "select", ok(null)).responder("duplas", "select", ok([])).responder("duplas", "update", ok([]));
    expect(await criarBracketStoreBrowser(vazio.cliente()).editarDupla(REF, "d1", { atletaA: "A", atletaB: "B" })).toEqual({
      ok: false,
      erro: { code: "FALHA_PERSISTENCIA" },
    });
    const erroEscrita = new Mock().responder("chaveamentos", "select", ok(null)).responder("duplas", "select", ok([])).responder("duplas", "update", falha());
    expect(await criarBracketStoreBrowser(erroEscrita.cliente()).editarDupla(REF, "d1", { atletaA: "A", atletaB: "B" })).toEqual({
      ok: false,
      erro: { code: "FALHA_PERSISTENCIA" },
    });
    const erroLeitura = new Mock().responder("chaveamentos", "select", falha());
    expect(await criarBracketStoreBrowser(erroLeitura.cliente()).editarDupla(REF, "d1", { atletaA: "A", atletaB: "B" })).toEqual({
      ok: false,
      erro: { code: "FALHA_LEITURA" },
    });
  });
});

describe("listarVinculos", () => {
  it("mapeia id da dupla -> ids dos jogadores (null quando não há)", async () => {
    const m = new Mock().responder("duplas", "select", ok([
      { id: "d1", jogador_a_id: J1, jogador_b_id: null },
      { id: "d2", jogador_a_id: null, jogador_b_id: J2 },
      { id: "d3" },
    ]));
    const r = await criarBracketStoreBrowser(m.cliente()).listarVinculos(REF);
    expect(r).toEqual({
      ok: true,
      valor: {
        d1: { jogadorAId: J1, jogadorBId: null },
        d2: { jogadorAId: null, jogadorBId: J2 },
        d3: { jogadorAId: null, jogadorBId: null },
      },
    });
    expect(m.de("duplas", "select")[0].eq).toEqual([["categoria_id", "cat-1"]]);
  });

  it("falha de leitura -> FALHA_LEITURA", async () => {
    const m = new Mock().responder("duplas", "select", falha());
    expect(await criarBracketStoreBrowser(m.cliente()).listarVinculos(REF)).toEqual({ ok: false, erro: { code: "FALHA_LEITURA" } });
  });
});
