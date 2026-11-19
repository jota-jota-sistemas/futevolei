// tests/campeonato-store.unit.test.ts
//
// Testa `criarCampeonatoStoreBrowser(clienteMock)` com um cliente Supabase
// SIMULADO e encadeável: nenhum banco real é tocado (mesmo estilo de
// tests/jogador-store.unit.test.ts).

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  campeonatoRowParaDetalhe,
  campeonatoRowParaRegistro,
  criarCampeonatoStoreBrowser,
  type CampeonatoDetalheRow,
  type CampeonatoRow,
} from "../src/store/campeonatoStore";

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
  like: [string, unknown][];
  order: unknown[][];
  range: unknown[];
  selectOpts?: unknown;
}

const ok = (data: unknown = [], count: number | null = null): Resposta => ({ data, error: null, count });
const falha = (code?: string): Resposta => ({ data: null, error: { message: "boom", code }, count: null });

class MockSupabase {
  private respostas = new Map<string, Resposta[]>();
  readonly chamadas: Chamada[] = [];
  /** Chamadas de rpc (nome e argumentos) e a resposta configurável por nome. */
  readonly rpcs: { nome: string; args: unknown }[] = [];
  private respostasRpc = new Map<string, Resposta>();

  responderRpc(nome: string, r: Resposta): this {
    this.respostasRpc.set(nome, r);
    return this;
  }

  /** Uma resposta fixa, ou uma fila (a última se repete). */
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
      rpc: vi.fn(async (nome: string, args: unknown) => {
        self.rpcs.push({ nome, args });
        const r = self.respostasRpc.get(nome) ?? { data: false, error: null };
        return { data: r.data ?? null, error: r.error ?? null };
      }),
      from(table: string) {
        const c: Chamada = { table, op: "select", args: [], eq: [], like: [], order: [], range: [] };
        let mutou = false;
        const resolver = (): Resposta => {
          const fila = self.respostas.get(`${table}:${c.op}`);
          if (!fila) return ok([]);
          return fila.length > 1 ? fila.shift()! : fila[0];
        };
        const b: Record<string, unknown> = {
          select: vi.fn((cols?: unknown, opts?: unknown) => {
            if (!mutou) { c.op = "select"; c.args = [cols]; c.selectOpts = opts; }
            return b;
          }),
          insert: vi.fn((row: unknown) => { c.op = "insert"; c.args = [row]; mutou = true; return b; }),
          update: vi.fn((patch: unknown) => { c.op = "update"; c.args = [patch]; mutou = true; return b; }),
          delete: vi.fn(() => { c.op = "delete"; mutou = true; return b; }),
          eq: vi.fn((col: string, val: unknown) => { c.eq.push([col, val]); return b; }),
          like: vi.fn((col: string, val: unknown) => { c.like.push([col, val]); return b; }),
          order: vi.fn((...a: unknown[]) => { c.order.push(a); return b; }),
          range: vi.fn((...a: unknown[]) => { c.range = a; return b; }),
          maybeSingle: vi.fn(() => {
            self.chamadas.push(c);
            const r = resolver();
            const data = Array.isArray(r.data) ? (r.data[0] ?? null) : (r.data ?? null);
            return Promise.resolve({ data, error: r.error ?? null });
          }),
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

const row = (p: Partial<CampeonatoRow> = {}): CampeonatoRow => ({
  id: "copa-2026",
  nome: "Copa",
  data: "2026-12-05",
  data_fim: null,
  cidade: null,
  uf: null,
  endereco: null,
  preco: null,
  preco_texto: null,
  inscricao: null,
  instagram: null,
  descricao: null,
  listado: true,
  ativo: true,
  fonte: "manual",
  criado_em: "2026-01-01T00:00:00.000Z",
  atualizado_em: "2026-01-01T00:00:00.000Z",
  ...p,
});

describe("mapeamento", () => {
  it("linha -> registro: preço em texto vira número; listado/ativo ausentes valem true; UF sem espaços", () => {
    const r = campeonatoRowParaRegistro(row({ preco: "160.50", uf: "SP", listado: null, ativo: null }));
    expect(r).toMatchObject({ preco: 160.5, uf: "SP", listado: true, ativo: true, dataFim: null });
    expect(campeonatoRowParaRegistro(row({ preco: "abc" })).preco).toBeNull();
  });

  it("detalhe: categorias embutidas (objeto, array ou ausente) viram nomes ordenados e sem vazios", () => {
    const d = (categorias: CampeonatoDetalheRow["categorias"]) =>
      campeonatoRowParaDetalhe({ ...row(), categorias }).categorias;
    expect(d([{ nome: "Open" }, { nome: " " }, { nome: "Amador" }])).toEqual(["Amador", "Open"]);
    expect(d({ nome: "Open" })).toEqual(["Open"]);
    expect(d(null)).toEqual([]);
    expect(d(undefined)).toEqual([]);
  });
});

describe("listar", () => {
  it("por padrão só ativos; ordena por data desc e nome (ordem do domínio)", async () => {
    const m = new MockSupabase().responder("campeonatos", "select", ok([
      row({ id: "a", nome: "Alfa", data: "2026-01-01" }),
      row({ id: "b", nome: "Beta", data: "2026-12-01" }),
    ]));
    const r = await criarCampeonatoStoreBrowser(m.cliente()).listar();
    expect(r.ok && r.valor.map((c) => c.id)).toEqual(["b", "a"]);
    const c = m.de("campeonatos", "select")[0];
    expect(c.eq).toContainEqual(["ativo", true]);
    expect(c.range).toEqual([0, 999]);
  });

  it("incluirArquivados não filtra por ativo", async () => {
    const m = new MockSupabase().responder("campeonatos", "select", ok([row({ ativo: false })]));
    const r = await criarCampeonatoStoreBrowser(m.cliente()).listar({ incluirArquivados: true });
    expect(r.ok && r.valor[0].ativo).toBe(false);
    expect(m.de("campeonatos", "select")[0].eq).toEqual([]);
  });

  it("falha de leitura -> FALHA_LEITURA", async () => {
    const m = new MockSupabase().responder("campeonatos", "select", falha());
    expect(await criarCampeonatoStoreBrowser(m.cliente()).listar()).toEqual({ ok: false, erro: { code: "FALHA_LEITURA" } });
  });
});

describe("obter", () => {
  it("devolve o campeonato com as categorias", async () => {
    const m = new MockSupabase().responder("campeonatos", "select", ok([{ ...row(), categorias: [{ nome: "Open" }] }]));
    const r = await criarCampeonatoStoreBrowser(m.cliente()).obter("copa-2026");
    expect(r.ok && r.valor.categorias).toEqual(["Open"]);
    expect(m.de("campeonatos", "select")[0].args[0]).toContain("categorias(nome)");
    expect(m.de("campeonatos", "select")[0].eq).toEqual([["id", "copa-2026"]]);
  });

  it("id vazio não consulta; id inexistente -> CAMPEONATO_NAO_ENCONTRADO; falha -> FALHA_LEITURA", async () => {
    const m = new MockSupabase().responder("campeonatos", "select", ok([]));
    const store = criarCampeonatoStoreBrowser(m.cliente());
    expect(await store.obter("")).toEqual({ ok: false, erro: { code: "CAMPEONATO_NAO_ENCONTRADO" } });
    expect(m.chamadas).toHaveLength(0);
    expect(await store.obter("nao-existe")).toEqual({ ok: false, erro: { code: "CAMPEONATO_NAO_ENCONTRADO" } });
    const f = new MockSupabase().responder("campeonatos", "select", falha());
    expect(await criarCampeonatoStoreBrowser(f.cliente()).obter("x")).toEqual({ ok: false, erro: { code: "FALHA_LEITURA" } });
  });
});

describe("criar", () => {
  it("com dados inválidos NÃO consulta nem escreve", async () => {
    const m = new MockSupabase();
    const r = await criarCampeonatoStoreBrowser(m.cliente()).criar({ nome: "  ", data: "2026-12-05" });
    expect(r).toEqual({ ok: false, erro: { code: "NOME_INVALIDO" } });
    expect(m.chamadas).toHaveLength(0);
  });

  it("insere a linha normalizada: id slug+ano, fonte manual, ativo, sem foto/local/id_origem", async () => {
    const m = new MockSupabase()
      .responder("campeonatos", "select", ok([]))
      .responder("campeonatos", "insert", ok());
    const r = await criarCampeonatoStoreBrowser(m.cliente()).criar({
      nome: "  Copa Cabeça ",
      data: "2026-12-05",
      uf: "sp",
      preco: "R$ 160,00",
      listado: false,
    });
    expect(r.ok).toBe(true);
    const inserida = m.de("campeonatos", "insert")[0].args[0] as CampeonatoRow;
    expect(inserida).toMatchObject({
      id: "copa-cabeca-2026",
      nome: "Copa Cabeça",
      uf: "SP",
      preco: 160,
      listado: false,
      ativo: true,
      fonte: "manual",
    });
    expect(inserida.criado_em).toBe(inserida.atualizado_em);
    for (const chave of ["foto", "local", "id_origem"]) expect(inserida).not.toHaveProperty(chave);
    expect(m.de("campeonatos", "select")[0].like).toEqual([["id", "copa-cabeca-2026%"]]);
    expect(r.ok && r.valor).toMatchObject({ id: "copa-cabeca-2026", fonte: "manual", ativo: true });
  });

  it("id em uso (inclusive arquivado) ganha sufixo numérico", async () => {
    const m = new MockSupabase()
      .responder("campeonatos", "select", ok([{ id: "copa-2026" }, { id: "copa-2026-2" }]))
      .responder("campeonatos", "insert", ok());
    const r = await criarCampeonatoStoreBrowser(m.cliente()).criar({ nome: "Copa", data: "2026-12-05" });
    expect(r.ok && r.valor.id).toBe("copa-2026-3");
  });

  it("id tomado entre a consulta e a escrita (23505): tenta o próximo", async () => {
    const m = new MockSupabase()
      .responder("campeonatos", "select", ok([]))
      .responder("campeonatos", "insert", [falha("23505"), ok()]);
    const r = await criarCampeonatoStoreBrowser(m.cliente()).criar({ nome: "Copa", data: "2026-12-05" });
    expect(r.ok && r.valor.id).toBe("copa-2026-2");
    expect(m.de("campeonatos", "insert")).toHaveLength(2);
  });

  it("colisão persistente esgota as tentativas -> FALHA_PERSISTENCIA", async () => {
    const m = new MockSupabase()
      .responder("campeonatos", "select", ok([]))
      .responder("campeonatos", "insert", falha("23505"));
    const r = await criarCampeonatoStoreBrowser(m.cliente()).criar({ nome: "Copa", data: "2026-12-05" });
    expect(r).toEqual({ ok: false, erro: { code: "FALHA_PERSISTENCIA" } });
    expect(m.de("campeonatos", "insert")).toHaveLength(3);
  });

  it("falha de escrita -> FALHA_PERSISTENCIA; falha na consulta de ids -> FALHA_LEITURA", async () => {
    const a = new MockSupabase().responder("campeonatos", "insert", falha("XX000"));
    expect(await criarCampeonatoStoreBrowser(a.cliente()).criar({ nome: "Copa", data: "2026-12-05" })).toEqual({
      ok: false,
      erro: { code: "FALHA_PERSISTENCIA" },
    });
    expect(a.de("campeonatos", "insert")).toHaveLength(1); // erro comum não repete
    const b = new MockSupabase().responder("campeonatos", "select", falha());
    expect(await criarCampeonatoStoreBrowser(b.cliente()).criar({ nome: "Copa", data: "2026-12-05" })).toEqual({
      ok: false,
      erro: { code: "FALHA_LEITURA" },
    });
    expect(b.de("campeonatos", "insert")).toHaveLength(0);
  });
});

describe("atualizar", () => {
  it("valida antes e só envia as colunas editáveis (nunca id, fonte, id_origem, foto)", async () => {
    const m = new MockSupabase().responder("campeonatos", "update", ok([row({ nome: "Novo" })]));
    const store = criarCampeonatoStoreBrowser(m.cliente());

    expect(await store.atualizar("copa-2026", { nome: "", data: "2026-12-05" })).toEqual({
      ok: false,
      erro: { code: "NOME_INVALIDO" },
    });
    expect(m.de("campeonatos", "update")).toHaveLength(0);

    const r = await store.atualizar("copa-2026", { nome: " Novo ", data: "2026-12-05", cidade: " Santos " });
    expect(r.ok && r.valor.nome).toBe("Novo");
    const chamada = m.de("campeonatos", "update")[0];
    const patch = chamada.args[0] as Record<string, unknown>;
    expect(patch).toMatchObject({ nome: "Novo", cidade: "Santos", listado: true });
    for (const chave of ["id", "fonte", "id_origem", "foto", "ativo", "criado_em"]) expect(patch).not.toHaveProperty(chave);
    expect(patch.atualizado_em).toEqual(expect.any(String));
    expect(chamada.eq).toEqual([["id", "copa-2026"]]);
  });

  it("nenhuma linha atualizada -> CAMPEONATO_NAO_ENCONTRADO; erro -> FALHA_PERSISTENCIA", async () => {
    const a = new MockSupabase().responder("campeonatos", "update", ok([]));
    expect(await criarCampeonatoStoreBrowser(a.cliente()).atualizar("x", { nome: "A", data: "2026-12-05" })).toEqual({
      ok: false,
      erro: { code: "CAMPEONATO_NAO_ENCONTRADO" },
    });
    const b = new MockSupabase().responder("campeonatos", "update", falha());
    expect(await criarCampeonatoStoreBrowser(b.cliente()).atualizar("x", { nome: "A", data: "2026-12-05" })).toEqual({
      ok: false,
      erro: { code: "FALHA_PERSISTENCIA" },
    });
  });
});

describe("definirAtivo", () => {
  it("grava só `ativo` (e o carimbo) e devolve a linha", async () => {
    const m = new MockSupabase().responder("campeonatos", "update", ok([row({ ativo: false })]));
    const r = await criarCampeonatoStoreBrowser(m.cliente()).definirAtivo("copa-2026", false);
    expect(r.ok && r.valor.ativo).toBe(false);
    expect(Object.keys(m.de("campeonatos", "update")[0].args[0] as object).sort()).toEqual(["ativo", "atualizado_em"]);
  });
});

describe("contarCategorias", () => {
  it("conta pelas categorias do campeonato (head + count exact)", async () => {
    const m = new MockSupabase().responder("categorias", "select", ok([], 3));
    const r = await criarCampeonatoStoreBrowser(m.cliente()).contarCategorias("copa-2026");
    expect(r).toEqual({ ok: true, valor: 3 });
    const c = m.de("categorias", "select")[0];
    expect(c.eq).toEqual([["campeonato_id", "copa-2026"]]);
    expect(c.selectOpts).toEqual({ count: "exact", head: true });
  });

  it("falha -> FALHA_LEITURA", async () => {
    const m = new MockSupabase().responder("categorias", "select", falha());
    expect(await criarCampeonatoStoreBrowser(m.cliente()).contarCategorias("x")).toEqual({
      ok: false,
      erro: { code: "FALHA_LEITURA" },
    });
  });
});

describe("excluir", () => {
  it("sem categorias: apaga de vez", async () => {
    const m = new MockSupabase()
      .responder("categorias", "select", ok([], 0))
      .responder("campeonatos", "delete", ok([{ id: "copa-2026" }]));
    const r = await criarCampeonatoStoreBrowser(m.cliente()).excluir("copa-2026");
    expect(r).toEqual({ ok: true, valor: "excluido" });
    expect(m.de("campeonatos", "delete")[0].eq).toEqual([["id", "copa-2026"]]);
  });

  it("com categorias: NUNCA apaga; arquiva", async () => {
    const m = new MockSupabase()
      .responder("categorias", "select", ok([], 2))
      .responder("campeonatos", "update", ok([row({ ativo: false })]));
    const r = await criarCampeonatoStoreBrowser(m.cliente()).excluir("copa-2026");
    expect(r).toEqual({ ok: true, valor: "arquivado" });
    expect(m.de("campeonatos", "delete")).toHaveLength(0);
    expect(m.de("campeonatos", "update")[0].args[0]).toMatchObject({ ativo: false });
  });

  it("violação de FK no delete: arquiva", async () => {
    const m = new MockSupabase()
      .responder("categorias", "select", ok([], 0))
      .responder("campeonatos", "delete", falha("23503"))
      .responder("campeonatos", "update", ok([row({ ativo: false })]));
    expect(await criarCampeonatoStoreBrowser(m.cliente()).excluir("copa-2026")).toEqual({ ok: true, valor: "arquivado" });
  });

  it("erro na contagem não apaga; erro no delete -> FALHA_PERSISTENCIA; nada removido -> não encontrado", async () => {
    const a = new MockSupabase().responder("categorias", "select", falha());
    expect(await criarCampeonatoStoreBrowser(a.cliente()).excluir("x")).toEqual({ ok: false, erro: { code: "FALHA_LEITURA" } });
    expect(a.de("campeonatos", "delete")).toHaveLength(0);

    const b = new MockSupabase().responder("categorias", "select", ok([], 0)).responder("campeonatos", "delete", falha("XX000"));
    expect(await criarCampeonatoStoreBrowser(b.cliente()).excluir("x")).toEqual({ ok: false, erro: { code: "FALHA_PERSISTENCIA" } });

    const c = new MockSupabase().responder("categorias", "select", ok([], 0)).responder("campeonatos", "delete", ok([]));
    expect(await criarCampeonatoStoreBrowser(c.cliente()).excluir("x")).toEqual({
      ok: false,
      erro: { code: "CAMPEONATO_NAO_ENCONTRADO" },
    });
  });
});

describe("listarMeus", () => {
  it("faz join interno com os donos (só o que a conta gerencia), só ativos por padrão", async () => {
    const m = new MockSupabase().responder("campeonatos", "select", ok([
      { ...row({ id: "a", nome: "Alfa", data: "2026-01-01" }), campeonato_organizadores: [{ email: "x@y.z" }] },
      { ...row({ id: "b", nome: "Beta", data: "2026-12-01" }), campeonato_organizadores: [{ email: "x@y.z" }] },
    ]));
    const r = await criarCampeonatoStoreBrowser(m.cliente()).listarMeus();
    expect(r.ok && r.valor.map((c) => c.id)).toEqual(["b", "a"]);
    const c = m.de("campeonatos", "select")[0];
    expect(c.args[0]).toContain("campeonato_organizadores!inner(email)");
    expect(c.eq).toContainEqual(["ativo", true]);
    expect(c.range).toEqual([0, 999]);
    // O resultado é um registro de campeonato (sem a coluna do join).
    expect(r.ok && r.valor[0]).not.toHaveProperty("campeonato_organizadores");
  });

  it("incluirArquivados não filtra por ativo; falha de leitura -> FALHA_LEITURA", async () => {
    const m = new MockSupabase().responder("campeonatos", "select", ok([]));
    await criarCampeonatoStoreBrowser(m.cliente()).listarMeus({ incluirArquivados: true });
    expect(m.de("campeonatos", "select")[0].eq).toEqual([]);

    const f = new MockSupabase().responder("campeonatos", "select", falha());
    expect(await criarCampeonatoStoreBrowser(f.cliente()).listarMeus()).toEqual({
      ok: false,
      erro: { code: "FALHA_LEITURA" },
    });
  });
});

describe("podeGerenciar", () => {
  it("pergunta ao banco (rpc) e só aceita true", async () => {
    const m = new MockSupabase().responderRpc("pode_gerenciar_campeonato", { data: true });
    const store = criarCampeonatoStoreBrowser(m.cliente());
    expect(await store.podeGerenciar("copa-2026")).toEqual({ ok: true, valor: true });
    expect(m.rpcs).toEqual([{ nome: "pode_gerenciar_campeonato", args: { p_id: "copa-2026" } }]);

    const nao = new MockSupabase().responderRpc("pode_gerenciar_campeonato", { data: false });
    expect(await criarCampeonatoStoreBrowser(nao.cliente()).podeGerenciar("x")).toEqual({ ok: true, valor: false });
    const texto = new MockSupabase().responderRpc("pode_gerenciar_campeonato", { data: "true" });
    expect(await criarCampeonatoStoreBrowser(texto.cliente()).podeGerenciar("x")).toEqual({ ok: true, valor: false });
  });

  it("id vazio é false sem consultar; erro do banco -> FALHA_LEITURA", async () => {
    const m = new MockSupabase();
    expect(await criarCampeonatoStoreBrowser(m.cliente()).podeGerenciar("")).toEqual({ ok: true, valor: false });
    expect(m.rpcs).toHaveLength(0);
    const f = new MockSupabase().responderRpc("pode_gerenciar_campeonato", { error: { message: "x" } });
    expect(await criarCampeonatoStoreBrowser(f.cliente()).podeGerenciar("x")).toEqual({
      ok: false,
      erro: { code: "FALHA_LEITURA" },
    });
  });
});

describe("permissão negada pelo banco (RLS/trigger, código 42501)", () => {
  const sem = { ok: false, erro: { code: "SEM_PERMISSAO" } };

  it("criar, atualizar, arquivar e excluir viram SEM_PERMISSAO", async () => {
    const criar = new MockSupabase().responder("campeonatos", "insert", falha("42501"));
    expect(await criarCampeonatoStoreBrowser(criar.cliente()).criar({ nome: "Copa", data: "2026-12-05" })).toEqual(sem);
    expect(criar.de("campeonatos", "insert")).toHaveLength(1); // não tenta de novo

    const atualizar = new MockSupabase().responder("campeonatos", "update", falha("42501"));
    expect(
      await criarCampeonatoStoreBrowser(atualizar.cliente()).atualizar("x", { nome: "A", data: "2026-12-05" })
    ).toEqual(sem);
    expect(await criarCampeonatoStoreBrowser(atualizar.cliente()).definirAtivo("x", false)).toEqual(sem);

    const excluir = new MockSupabase()
      .responder("categorias", "select", ok([], 0))
      .responder("campeonatos", "delete", falha("42501"));
    expect(await criarCampeonatoStoreBrowser(excluir.cliente()).excluir("x")).toEqual(sem);
  });

  it("outros erros de escrita continuam FALHA_PERSISTENCIA", async () => {
    const m = new MockSupabase().responder("campeonatos", "update", falha("XX000"));
    expect(await criarCampeonatoStoreBrowser(m.cliente()).definirAtivo("x", true)).toEqual({
      ok: false,
      erro: { code: "FALHA_PERSISTENCIA" },
    });
  });
});

describe("donos do campeonato", () => {
  it("listarDonos: lê só os donos daquele campeonato, em ordem de entrada", async () => {
    const m = new MockSupabase().responder("campeonato_organizadores", "select", ok([
      { email: "ana@x.com", criado_em: "2026-01-01T00:00:00.000Z" },
      { email: "bia@x.com", criado_em: "2026-02-01T00:00:00.000Z" },
    ]));
    const r = await criarCampeonatoStoreBrowser(m.cliente()).listarDonos("copa-2026");
    expect(r).toEqual({
      ok: true,
      valor: [
        { email: "ana@x.com", criadoEm: "2026-01-01T00:00:00.000Z" },
        { email: "bia@x.com", criadoEm: "2026-02-01T00:00:00.000Z" },
      ],
    });
    const c = m.de("campeonato_organizadores", "select")[0];
    expect(c.eq).toEqual([["campeonato_id", "copa-2026"]]);
    expect(c.order.map((o) => o[0])).toEqual(["criado_em", "email"]);
  });

  it("listarDonos: id vazio não consulta; falha -> FALHA_LEITURA", async () => {
    const m = new MockSupabase();
    expect(await criarCampeonatoStoreBrowser(m.cliente()).listarDonos("")).toEqual({
      ok: false,
      erro: { code: "CAMPEONATO_NAO_ENCONTRADO" },
    });
    expect(m.chamadas).toHaveLength(0);
    const f = new MockSupabase().responder("campeonato_organizadores", "select", falha());
    expect(await criarCampeonatoStoreBrowser(f.cliente()).listarDonos("x")).toEqual({
      ok: false,
      erro: { code: "FALHA_LEITURA" },
    });
  });

  it("adicionarDono: valida e normaliza o e-mail e grava o vínculo", async () => {
    const m = new MockSupabase().responder("campeonato_organizadores", "insert", ok());
    const r = await criarCampeonatoStoreBrowser(m.cliente()).adicionarDono("copa-2026", "  Bia@Exemplo.COM ");
    expect(r.ok && r.valor.email).toBe("bia@exemplo.com");
    expect(m.de("campeonato_organizadores", "insert")[0].args[0]).toMatchObject({
      campeonato_id: "copa-2026",
      email: "bia@exemplo.com",
    });
  });

  it("adicionarDono: e-mail inválido não escreve", async () => {
    const m = new MockSupabase();
    expect(await criarCampeonatoStoreBrowser(m.cliente()).adicionarDono("copa-2026", "bia")).toEqual({
      ok: false,
      erro: { code: "EMAIL_INVALIDO" },
    });
    expect(m.chamadas).toHaveLength(0);
  });

  it("adicionarDono: quem não é organizador (FK 23503) -> NAO_ORGANIZADOR; já é dono (23505) é sucesso", async () => {
    const fk = new MockSupabase().responder("campeonato_organizadores", "insert", falha("23503"));
    expect(await criarCampeonatoStoreBrowser(fk.cliente()).adicionarDono("copa-2026", "bia@x.com")).toEqual({
      ok: false,
      erro: { code: "NAO_ORGANIZADOR" },
    });
    const dup = new MockSupabase().responder("campeonato_organizadores", "insert", falha("23505"));
    const r = await criarCampeonatoStoreBrowser(dup.cliente()).adicionarDono("copa-2026", "bia@x.com");
    expect(r.ok && r.valor.email).toBe("bia@x.com");
  });

  it("adicionarDono: RLS recusou -> SEM_PERMISSAO; outro erro -> FALHA_PERSISTENCIA", async () => {
    const rls = new MockSupabase().responder("campeonato_organizadores", "insert", falha("42501"));
    expect(await criarCampeonatoStoreBrowser(rls.cliente()).adicionarDono("x", "bia@x.com")).toEqual({
      ok: false,
      erro: { code: "SEM_PERMISSAO" },
    });
    const outro = new MockSupabase().responder("campeonato_organizadores", "insert", falha("XX000"));
    expect(await criarCampeonatoStoreBrowser(outro.cliente()).adicionarDono("x", "bia@x.com")).toEqual({
      ok: false,
      erro: { code: "FALHA_PERSISTENCIA" },
    });
  });

  it("removerDono: apaga só o par (campeonato, e-mail)", async () => {
    const m = new MockSupabase().responder("campeonato_organizadores", "delete", ok([{ email: "bia@x.com" }]));
    expect(await criarCampeonatoStoreBrowser(m.cliente()).removerDono("copa-2026", "Bia@X.com")).toEqual({
      ok: true,
      valor: undefined,
    });
    expect(m.de("campeonato_organizadores", "delete")[0].eq).toEqual([
      ["campeonato_id", "copa-2026"],
      ["email", "bia@x.com"],
    ]);
  });

  it("removerDono: o trigger do banco recusa o último dono -> ULTIMO_DONO", async () => {
    const m = new MockSupabase().responder("campeonato_organizadores", "delete", {
      data: null,
      error: { message: "ULTIMO_DONO", code: "P0001" },
    });
    expect(await criarCampeonatoStoreBrowser(m.cliente()).removerDono("copa-2026", "ana@x.com")).toEqual({
      ok: false,
      erro: { code: "ULTIMO_DONO" },
    });
  });

  it("removerDono: e-mail inválido não escreve; RLS -> SEM_PERMISSAO; outro erro -> FALHA_PERSISTENCIA", async () => {
    const m = new MockSupabase();
    expect(await criarCampeonatoStoreBrowser(m.cliente()).removerDono("x", "nao")).toEqual({
      ok: false,
      erro: { code: "EMAIL_INVALIDO" },
    });
    expect(m.chamadas).toHaveLength(0);
    const rls = new MockSupabase().responder("campeonato_organizadores", "delete", falha("42501"));
    expect(await criarCampeonatoStoreBrowser(rls.cliente()).removerDono("x", "a@b.com")).toEqual({
      ok: false,
      erro: { code: "SEM_PERMISSAO" },
    });
    const outro = new MockSupabase().responder("campeonato_organizadores", "delete", falha("XX000"));
    expect(await criarCampeonatoStoreBrowser(outro.cliente()).removerDono("x", "a@b.com")).toEqual({
      ok: false,
      erro: { code: "FALHA_PERSISTENCIA" },
    });
  });
});
