// tests/categoria-store.unit.test.ts
//
// Testa `criarCategoriaStoreBrowser(clienteMock)` com um cliente Supabase
// SIMULADO e encadeável (nenhum banco real), no estilo de campeonato-store.

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { categoriaRowParaItem, criarCategoriaStoreBrowser } from "../src/store/categoriaStore";

type Op = "select" | "insert" | "update" | "delete";
interface Resposta {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}
interface Chamada {
  table: string;
  op: Op;
  args: unknown[];
  eq: [string, unknown][];
  selectOpts?: unknown;
}

const ok = (data: unknown = [], count: number | null = null): Resposta => ({ data, error: null, count });
const falha = (code?: string): Resposta => ({ data: null, error: { message: "boom", code }, count: null });

class MockSupabase {
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
        const b: Record<string, unknown> = {
          select: vi.fn((cols?: unknown, opts?: unknown) => {
            if (!mutou) {
              c.op = "select";
              c.args = [cols];
              c.selectOpts = opts;
            }
            return b;
          }),
          insert: vi.fn((rows: unknown) => {
            c.op = "insert";
            c.args = [rows];
            mutou = true;
            return b;
          }),
          delete: vi.fn(() => {
            c.op = "delete";
            mutou = true;
            return b;
          }),
          eq: vi.fn((col: string, val: unknown) => {
            c.eq.push([col, val]);
            return b;
          }),
          range: vi.fn(() => b),
          then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
            self.chamadas.push(c);
            return Promise.resolve(resolver()).then(res, rej);
          },
        };
        return b;
      },
    } as unknown as SupabaseClient;
  }
}

const CAT = "11111111-1111-4111-8111-111111111111";
const linha = (id: string, nome: string, duplas = 0) => ({ id, nome, duplas: [{ count: duplas }] });

describe("mapeamento", () => {
  it("a contagem de duplas vem como lista, objeto ou ausente (vira 0)", () => {
    expect(categoriaRowParaItem({ id: "a", nome: "Open", duplas: [{ count: 4 }] }).duplas).toBe(4);
    expect(categoriaRowParaItem({ id: "a", nome: "Open", duplas: { count: 2 } }).duplas).toBe(2);
    expect(categoriaRowParaItem({ id: "a", nome: "Open" }).duplas).toBe(0);
    expect(categoriaRowParaItem({ id: "a", nome: "Open", duplas: [] }).duplas).toBe(0);
  });
});

describe("listar", () => {
  it("lê as categorias do campeonato com a contagem de duplas, em ordem alfabética sem acento", async () => {
    const m = new MockSupabase().responder("categorias", "select", ok([linha("c", "Ótimo", 1), linha("a", "Amador", 3), linha("b", "Open")]));
    const r = await criarCategoriaStoreBrowser(m.cliente()).listar("copa-2026");
    expect(r).toEqual({
      ok: true,
      valor: [
        { id: "a", nome: "Amador", duplas: 3 },
        { id: "b", nome: "Open", duplas: 0 },
        { id: "c", nome: "Ótimo", duplas: 1 },
      ],
    });
    const c = m.de("categorias", "select")[0];
    expect(c.args[0]).toContain("duplas(count)");
    expect(c.eq).toEqual([["campeonato_id", "copa-2026"]]);
  });

  it("falha de leitura -> FALHA_LEITURA; id vazio nem consulta", async () => {
    const f = new MockSupabase().responder("categorias", "select", falha());
    expect(await criarCategoriaStoreBrowser(f.cliente()).listar("x")).toEqual({ ok: false, erro: { code: "FALHA_LEITURA" } });
    const m = new MockSupabase();
    expect(await criarCategoriaStoreBrowser(m.cliente()).listar("")).toEqual({ ok: false, erro: { code: "FALHA_LEITURA" } });
    expect(m.chamadas).toHaveLength(0);
  });
});

describe("criarVarias", () => {
  it("insere só o que não existe (uma escrita), devolve criadas e informa repetidas e inválidas", async () => {
    const m = new MockSupabase()
      .responder("categorias", "select", ok([linha("a", "Open")]))
      .responder("categorias", "insert", ok([{ id: "n1", nome: "Masculino Open" }, { id: "n2", nome: "Feminino Open" }]));
    const r = await criarCategoriaStoreBrowser(m.cliente()).criarVarias("copa-2026", ["  open", "Masculino Open", "Feminino Open", "###"]);
    expect(r).toEqual({
      ok: true,
      valor: {
        criadas: [
          { id: "n2", nome: "Feminino Open", duplas: 0 },
          { id: "n1", nome: "Masculino Open", duplas: 0 },
        ],
        repetidas: ["open"],
        invalidas: ["###"],
      },
    });
    const inserts = m.de("categorias", "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].args[0]).toEqual([
      { campeonato_id: "copa-2026", nome: "Masculino Open" },
      { campeonato_id: "copa-2026", nome: "Feminino Open" },
    ]);
  });

  it("nada novo: não escreve", async () => {
    const m = new MockSupabase().responder("categorias", "select", ok([linha("a", "Open")]));
    const r = await criarCategoriaStoreBrowser(m.cliente()).criarVarias("copa-2026", ["Open", "open"]);
    expect(r).toEqual({ ok: true, valor: { criadas: [], repetidas: ["Open", "open"], invalidas: [] } });
    expect(m.de("categorias", "insert")).toHaveLength(0);
  });

  it("erros: leitura prévia falha -> FALHA_LEITURA; RLS -> SEM_PERMISSAO; outro/duplicata em corrida -> FALHA_PERSISTENCIA", async () => {
    const leitura = new MockSupabase().responder("categorias", "select", falha());
    expect(await criarCategoriaStoreBrowser(leitura.cliente()).criarVarias("x", ["Open"])).toEqual({
      ok: false,
      erro: { code: "FALHA_LEITURA" },
    });
    for (const [codigo, esperado] of [["42501", "SEM_PERMISSAO"], ["23505", "FALHA_PERSISTENCIA"], ["XX000", "FALHA_PERSISTENCIA"]] as const) {
      const m = new MockSupabase().responder("categorias", "select", ok([])).responder("categorias", "insert", falha(codigo));
      expect(await criarCategoriaStoreBrowser(m.cliente()).criarVarias("x", ["Open"])).toEqual({
        ok: false,
        erro: { code: esperado },
      });
    }
  });
});

describe("remover", () => {
  it("sem duplas: apaga só aquela categoria", async () => {
    const m = new MockSupabase()
      .responder("duplas", "select", ok([], 0))
      .responder("categorias", "delete", ok([{ id: CAT }]));
    expect(await criarCategoriaStoreBrowser(m.cliente()).remover(CAT)).toEqual({ ok: true, valor: undefined });
    const cont = m.de("duplas", "select")[0];
    expect(cont.eq).toEqual([["categoria_id", CAT]]);
    expect(cont.selectOpts).toEqual({ count: "exact", head: true });
    expect(m.de("categorias", "delete")[0].eq).toEqual([["id", CAT]]);
  });

  it("com duplas: NUNCA apaga (TEM_DUPLAS)", async () => {
    const m = new MockSupabase().responder("duplas", "select", ok([], 2));
    expect(await criarCategoriaStoreBrowser(m.cliente()).remover(CAT)).toEqual({ ok: false, erro: { code: "TEM_DUPLAS" } });
    expect(m.de("categorias", "delete")).toHaveLength(0);
  });

  it("o trigger do banco (23503) vira TEM_DUPLAS; RLS vira SEM_PERMISSAO; nada removido vira não encontrada", async () => {
    const fk = new MockSupabase().responder("duplas", "select", ok([], 0)).responder("categorias", "delete", falha("23503"));
    expect(await criarCategoriaStoreBrowser(fk.cliente()).remover(CAT)).toEqual({ ok: false, erro: { code: "TEM_DUPLAS" } });
    const rls = new MockSupabase().responder("duplas", "select", ok([], 0)).responder("categorias", "delete", falha("42501"));
    expect(await criarCategoriaStoreBrowser(rls.cliente()).remover(CAT)).toEqual({ ok: false, erro: { code: "SEM_PERMISSAO" } });
    const vazio = new MockSupabase().responder("duplas", "select", ok([], 0)).responder("categorias", "delete", ok([]));
    expect(await criarCategoriaStoreBrowser(vazio.cliente()).remover(CAT)).toEqual({
      ok: false,
      erro: { code: "CATEGORIA_NAO_ENCONTRADA" },
    });
  });

  it("id que não é uuid não consulta; erro na contagem -> FALHA_LEITURA", async () => {
    const m = new MockSupabase();
    expect(await criarCategoriaStoreBrowser(m.cliente()).remover("nao-uuid")).toEqual({
      ok: false,
      erro: { code: "CATEGORIA_NAO_ENCONTRADA" },
    });
    expect(m.chamadas).toHaveLength(0);
    const f = new MockSupabase().responder("duplas", "select", falha());
    expect(await criarCategoriaStoreBrowser(f.cliente()).remover(CAT)).toEqual({ ok: false, erro: { code: "FALHA_LEITURA" } });
  });
});

describe("copiarDe", () => {
  it("lê os nomes da origem e cria no destino só os que faltam", async () => {
    const m = new MockSupabase()
      .responder("categorias", "select", [ok([linha("o1", "Open"), linha("o2", "Master")]), ok([linha("d1", "Open")])])
      .responder("categorias", "insert", ok([{ id: "n", nome: "Master" }]));
    const r = await criarCategoriaStoreBrowser(m.cliente()).copiarDe("origem", "destino");
    expect(r).toEqual({ ok: true, valor: { criadas: [{ id: "n", nome: "Master", duplas: 0 }], repetidas: ["Open"], invalidas: [] } });
    const selects = m.de("categorias", "select");
    expect(selects[0].eq).toEqual([["campeonato_id", "origem"]]);
    expect(selects[1].eq).toEqual([["campeonato_id", "destino"]]);
    expect(m.de("categorias", "insert")[0].args[0]).toEqual([{ campeonato_id: "destino", nome: "Master" }]);
  });

  it("origem ilegível: devolve o erro sem escrever", async () => {
    const m = new MockSupabase().responder("categorias", "select", falha());
    expect(await criarCategoriaStoreBrowser(m.cliente()).copiarDe("o", "d")).toEqual({ ok: false, erro: { code: "FALHA_LEITURA" } });
    expect(m.de("categorias", "insert")).toHaveLength(0);
  });
});
