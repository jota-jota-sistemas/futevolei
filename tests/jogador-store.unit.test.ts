// tests/jogador-store.unit.test.ts
//
// Testa `criarJogadorStoreBrowser(clienteMock)` com um cliente Supabase
// SIMULADO e encadeável: nenhum banco real é tocado. O mock registra cada
// chamada e devolve respostas configuráveis por (tabela, operação), no mesmo
// espírito de tests/bracket-store.unit.test.ts.

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  criarJogadorStoreBrowser,
  jogadorRowParaJogador,
  type JogadorRow,
} from "../src/store/jogadorStore";

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
  or: string[];
  order: string[];
  range: unknown[];
  selectOpts?: unknown;
}

const ok = (data: unknown = [], count: number | null = null): Resposta => ({ data, error: null, count });
const falha = (code?: string): Resposta => ({ data: null, error: { message: "boom", code }, count: null });

class MockSupabase {
  private respostas = new Map<string, Resposta>();
  readonly chamadas: Chamada[] = [];

  responder(table: string, op: Op, r: Resposta): this {
    this.respostas.set(`${table}:${op}`, r);
    return this;
  }

  /** Chamadas de uma tabela/operação. */
  de(table: string, op: Op): Chamada[] {
    return this.chamadas.filter((c) => c.table === table && c.op === op);
  }

  cliente(): SupabaseClient {
    const self = this;
    return {
      from(table: string) {
        const c: Chamada = { table, op: "select", args: [], eq: [], or: [], order: [], range: [] };
        let mutou = false;
        const resolver = (): Resposta => self.respostas.get(`${table}:${c.op}`) ?? ok([]);
        const b: Record<string, unknown> = {
          select: vi.fn((cols?: unknown, opts?: unknown) => {
            if (!mutou) { c.op = "select"; c.args = [cols]; c.selectOpts = opts; }
            return b;
          }),
          insert: vi.fn((row: unknown) => { c.op = "insert"; c.args = [row]; mutou = true; return b; }),
          update: vi.fn((patch: unknown) => { c.op = "update"; c.args = [patch]; mutou = true; return b; }),
          delete: vi.fn(() => { c.op = "delete"; mutou = true; return b; }),
          eq: vi.fn((col: string, val: unknown) => { c.eq.push([col, val]); return b; }),
          or: vi.fn((filtro: string) => { c.or.push(filtro); return b; }),
          order: vi.fn((col: string) => { c.order.push(col); return b; }),
          range: vi.fn((...a: unknown[]) => { c.range = a; return b; }),
          maybeSingle: vi.fn(() => {
            const r = resolver();
            const data = Array.isArray(r.data) ? (r.data[0] ?? null) : (r.data ?? null);
            return Promise.resolve({ data, error: r.error ?? null });
          }),
          then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
            self.chamadas.push(c);
            return Promise.resolve(resolver()).then(res, rej);
          },
        };
        // maybeSingle não passa por `then`: registra a chamada aqui.
        const original = b.maybeSingle as () => Promise<unknown>;
        b.maybeSingle = vi.fn(() => { self.chamadas.push(c); return original(); });
        return b;
      },
    } as unknown as SupabaseClient;
  }
}

const ID = "11111111-1111-4111-8111-111111111111";
const row = (p: Partial<JogadorRow> = {}): JogadorRow => ({
  id: ID, nome: "Ana Lima", apelido: null, genero: null, cidade: null, uf: null, instagram: null,
  ativo: true, criado_em: "2026-01-01T00:00:00.000Z", atualizado_em: "2026-01-01T00:00:00.000Z", ...p,
});

describe("criar", () => {
  it("com dados inválidos NÃO escreve e devolve o erro de validação", async () => {
    const m = new MockSupabase();
    const store = criarJogadorStoreBrowser(m.cliente());
    const r = await store.criar({ nome: "   " });
    expect(r).toEqual({ ok: false, erro: { code: "NOME_JOGADOR_INVALIDO" } });
    expect(m.de("jogadores", "insert")).toHaveLength(0);
  });

  it("insere a linha normalizada com id e carimbos gerados na borda", async () => {
    const m = new MockSupabase().responder("jogadores", "insert", ok());
    const store = criarJogadorStoreBrowser(m.cliente());
    const r = await store.criar({ nome: "  Ana Lima ", apelido: "", genero: "FEMININO", uf: "sp", instagram: "@Ana.Lima" });
    expect(r.ok).toBe(true);
    const inserida = m.de("jogadores", "insert")[0].args[0] as JogadorRow;
    expect(inserida).toMatchObject({
      nome: "Ana Lima", apelido: null, genero: "feminino", cidade: null, uf: "SP",
      instagram: "ana.lima", ativo: true,
    });
    expect(inserida.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(inserida.criado_em).toBe(inserida.atualizado_em);
    expect(r.ok && r.valor).toMatchObject({ id: inserida.id, nome: "Ana Lima", genero: "feminino", ativo: true });
  });

  it("falha de escrita -> FALHA_PERSISTENCIA", async () => {
    const m = new MockSupabase().responder("jogadores", "insert", falha());
    const r = await criarJogadorStoreBrowser(m.cliente()).criar({ nome: "Ana" });
    expect(r).toEqual({ ok: false, erro: { code: "FALHA_PERSISTENCIA" } });
  });

  it("cliente indisponível (ex.: variáveis do Supabase ausentes) vira falha, não exceção", async () => {
    const quebrado = { from: () => { throw new Error("sem env"); } } as unknown as SupabaseClient;
    const store = criarJogadorStoreBrowser(quebrado);
    expect(await store.criar({ nome: "Ana" })).toEqual({ ok: false, erro: { code: "FALHA_PERSISTENCIA" } });
    expect(await store.listar()).toEqual({ ok: false, erro: { code: "FALHA_LEITURA" } });
  });
});

describe("listar", () => {
  it("por padrão só os ativos; com incluirArquivados não filtra", async () => {
    const m = new MockSupabase().responder("jogadores", "select", ok([]));
    const store = criarJogadorStoreBrowser(m.cliente());
    await store.listar();
    await store.listar({ incluirArquivados: true });
    const [padrao, todos] = m.de("jogadores", "select");
    expect(padrao.eq).toContainEqual(["ativo", true]);
    expect(todos.eq).toEqual([]);
    expect(padrao.range).toEqual([0, 999]); // teto da listagem
  });

  it("mapeia as linhas e ordena sem diferenciar acento/caixa (a ordem do banco não vale)", async () => {
    const m = new MockSupabase().responder("jogadores", "select", ok([
      row({ id: "c", nome: "Carla" }),
      row({ id: "b", nome: "Bruno" }),
      row({ id: "a", nome: "Álvaro", genero: "masculino" }),
      row({ id: "x", nome: "Dedé", genero: "invalido" }), // gênero fora do vocabulário vira null
    ]));
    const r = await criarJogadorStoreBrowser(m.cliente()).listar();
    expect(r.ok && r.valor.map((j) => j.nome)).toEqual(["Álvaro", "Bruno", "Carla", "Dedé"]);
    expect(r.ok && r.valor[0].criadoEm).toBe("2026-01-01T00:00:00.000Z");
    expect(r.ok && r.valor[3].genero).toBeNull();
  });

  it("erro de leitura -> FALHA_LEITURA", async () => {
    const m = new MockSupabase().responder("jogadores", "select", falha());
    expect(await criarJogadorStoreBrowser(m.cliente()).listar()).toEqual({ ok: false, erro: { code: "FALHA_LEITURA" } });
  });
});

describe("obter", () => {
  it("id que não é UUID -> não encontrado, sem consultar o banco", async () => {
    const m = new MockSupabase();
    const r = await criarJogadorStoreBrowser(m.cliente()).obter("abc'; drop table jogadores;--");
    expect(r).toEqual({ ok: false, erro: { code: "JOGADOR_NAO_ENCONTRADO" } });
    expect(m.chamadas).toHaveLength(0);
  });

  it("existente -> jogador; inexistente -> não encontrado; erro -> FALHA_LEITURA", async () => {
    const encontrado = new MockSupabase().responder("jogadores", "select", ok([row()]));
    const r1 = await criarJogadorStoreBrowser(encontrado.cliente()).obter(ID);
    expect(r1.ok && r1.valor.nome).toBe("Ana Lima");
    expect(encontrado.de("jogadores", "select")[0].eq).toContainEqual(["id", ID]);

    const vazio = new MockSupabase().responder("jogadores", "select", ok([]));
    expect(await criarJogadorStoreBrowser(vazio.cliente()).obter(ID)).toEqual({ ok: false, erro: { code: "JOGADOR_NAO_ENCONTRADO" } });

    const erro = new MockSupabase().responder("jogadores", "select", falha());
    expect(await criarJogadorStoreBrowser(erro.cliente()).obter(ID)).toEqual({ ok: false, erro: { code: "FALHA_LEITURA" } });
  });
});

describe("atualizar / definirAtivo", () => {
  it("dados inválidos não escrevem", async () => {
    const m = new MockSupabase();
    const r = await criarJogadorStoreBrowser(m.cliente()).atualizar(ID, { nome: "" });
    expect(r.ok).toBe(false);
    expect(m.de("jogadores", "update")).toHaveLength(0);
  });

  it("atualiza com atualizado_em novo e devolve a linha resultante", async () => {
    const m = new MockSupabase().responder("jogadores", "update", ok([row({ nome: "Ana Souza" })]));
    const r = await criarJogadorStoreBrowser(m.cliente()).atualizar(ID, { nome: "Ana Souza" });
    expect(r.ok && r.valor.nome).toBe("Ana Souza");
    const u = m.de("jogadores", "update")[0];
    expect(u.eq).toContainEqual(["id", ID]);
    expect((u.args[0] as Record<string, unknown>).nome).toBe("Ana Souza");
    expect(typeof (u.args[0] as Record<string, unknown>).atualizado_em).toBe("string");
  });

  it("nenhuma linha atingida -> não encontrado; erro -> FALHA_PERSISTENCIA; id inválido -> não encontrado", async () => {
    const vazio = new MockSupabase().responder("jogadores", "update", ok([]));
    expect(await criarJogadorStoreBrowser(vazio.cliente()).atualizar(ID, { nome: "Ana" }))
      .toEqual({ ok: false, erro: { code: "JOGADOR_NAO_ENCONTRADO" } });

    const erro = new MockSupabase().responder("jogadores", "update", falha());
    expect(await criarJogadorStoreBrowser(erro.cliente()).atualizar(ID, { nome: "Ana" }))
      .toEqual({ ok: false, erro: { code: "FALHA_PERSISTENCIA" } });

    const m = new MockSupabase();
    expect(await criarJogadorStoreBrowser(m.cliente()).atualizar("x", { nome: "Ana" }))
      .toEqual({ ok: false, erro: { code: "JOGADOR_NAO_ENCONTRADO" } });
    expect(m.chamadas).toHaveLength(0);
  });

  it("definirAtivo grava só ativo (+ carimbo)", async () => {
    const m = new MockSupabase().responder("jogadores", "update", ok([row({ ativo: false })]));
    const r = await criarJogadorStoreBrowser(m.cliente()).definirAtivo(ID, false);
    expect(r.ok && r.valor.ativo).toBe(false);
    const patch = m.de("jogadores", "update")[0].args[0] as Record<string, unknown>;
    expect(Object.keys(patch).sort()).toEqual(["ativo", "atualizado_em"]);
    expect(patch.ativo).toBe(false);
  });
});

describe("contarVinculos", () => {
  it("conta as duplas que usam o jogador em qualquer dos dois lugares", async () => {
    const m = new MockSupabase().responder("duplas", "select", ok(null, 3));
    const r = await criarJogadorStoreBrowser(m.cliente()).contarVinculos(ID);
    expect(r).toEqual({ ok: true, valor: 3 });
    const c = m.de("duplas", "select")[0];
    expect(c.or).toEqual([`jogador_a_id.eq.${ID},jogador_b_id.eq.${ID}`]);
    expect(c.selectOpts).toEqual({ count: "exact", head: true });
  });

  it("erro -> FALHA_LEITURA; id inválido não chega ao filtro (sem injeção)", async () => {
    const erro = new MockSupabase().responder("duplas", "select", falha());
    expect(await criarJogadorStoreBrowser(erro.cliente()).contarVinculos(ID)).toEqual({ ok: false, erro: { code: "FALHA_LEITURA" } });

    const m = new MockSupabase();
    const r = await criarJogadorStoreBrowser(m.cliente()).contarVinculos("x),jogador_b_id.neq.0");
    expect(r.ok).toBe(false);
    expect(m.chamadas).toHaveLength(0);
  });
});

describe("excluir", () => {
  it("sem vínculos: apaga de vez", async () => {
    const m = new MockSupabase().responder("duplas", "select", ok(null, 0)).responder("jogadores", "delete", ok());
    const r = await criarJogadorStoreBrowser(m.cliente()).excluir(ID);
    expect(r).toEqual({ ok: true, valor: "excluido" });
    expect(m.de("jogadores", "delete")[0].eq).toContainEqual(["id", ID]);
    expect(m.de("jogadores", "update")).toHaveLength(0);
  });

  it("com vínculos: ARQUIVA e NÃO apaga (o histórico é preservado)", async () => {
    const m = new MockSupabase().responder("duplas", "select", ok(null, 2)).responder("jogadores", "update", ok([row({ ativo: false })]));
    const r = await criarJogadorStoreBrowser(m.cliente()).excluir(ID);
    expect(r).toEqual({ ok: true, valor: "arquivado" });
    expect(m.de("jogadores", "delete")).toHaveLength(0);
    expect((m.de("jogadores", "update")[0].args[0] as Record<string, unknown>).ativo).toBe(false);
  });

  it("vínculo criado entre a contagem e o delete (FK 23503): cai para arquivar", async () => {
    const m = new MockSupabase()
      .responder("duplas", "select", ok(null, 0))
      .responder("jogadores", "delete", falha("23503"))
      .responder("jogadores", "update", ok([row({ ativo: false })]));
    const r = await criarJogadorStoreBrowser(m.cliente()).excluir(ID);
    expect(r).toEqual({ ok: true, valor: "arquivado" });
  });

  it("outro erro no delete -> FALHA_PERSISTENCIA; erro na contagem -> FALHA_LEITURA", async () => {
    const m1 = new MockSupabase().responder("duplas", "select", ok(null, 0)).responder("jogadores", "delete", falha("XX000"));
    expect(await criarJogadorStoreBrowser(m1.cliente()).excluir(ID)).toEqual({ ok: false, erro: { code: "FALHA_PERSISTENCIA" } });

    const m2 = new MockSupabase().responder("duplas", "select", falha());
    const r = await criarJogadorStoreBrowser(m2.cliente()).excluir(ID);
    expect(r).toEqual({ ok: false, erro: { code: "FALHA_LEITURA" } });
    expect(m2.de("jogadores", "delete")).toHaveLength(0);
  });
});

describe("jogadorRowParaJogador", () => {
  it("converte snake_case para o domínio e preserva os nulos", () => {
    expect(jogadorRowParaJogador(row({ apelido: "Pingo", genero: "feminino", uf: "SP" }))).toEqual({
      id: ID, nome: "Ana Lima", apelido: "Pingo", genero: "feminino", cidade: null, uf: "SP", instagram: null,
      ativo: true, criadoEm: "2026-01-01T00:00:00.000Z", atualizadoEm: "2026-01-01T00:00:00.000Z",
    });
  });
});
