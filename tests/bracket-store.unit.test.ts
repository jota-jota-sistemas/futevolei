// tests/bracket-store.unit.test.ts
//
// Testes de integração/exemplo do Bracket_Store (feature: criar-chaveamento-campeonato,
// tarefa 14.3). Exercita `criarBracketStoreBrowser(clientMock)` com um cliente
// Supabase MOCKADO e encadeável — NENHUM banco real é tocado.
//
// Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 7.1, 7.2, 7.3, 7.4, 7.6
//
// O cliente Supabase é usado via:
//   client.from(tabela)
//     .select(...) | .insert(...) | .upsert(..., opts) | .delete()
//     .eq(col, val) | .in(col, vals)
//     .maybeSingle() | .single()
// e, em alguns caminhos, o próprio builder é AWAITED diretamente (ex.:
// `await client.from("duplas").select("*").eq(...)`), resolvendo para
// `{ data, error }`. O mock abaixo espelha exatamente esse comportamento:
// é um builder thenable que registra as chamadas e devolve respostas
// configuráveis por (tabela, operação).

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  criarBracketStoreBrowser,
  type CategoryRef,
  type NovaDupla,
} from "../src/store/bracketStore";
import type { Bracket } from "../src/domain/bracket/types";

// ---------------------------------------------------------------------------
// Mock encadeável do cliente Supabase
// ---------------------------------------------------------------------------

type Op = "select" | "insert" | "upsert" | "delete";

interface MockResponse {
  data: unknown;
  error: unknown;
}

/** Resposta de sucesso (erro nulo). */
const ok = (data: unknown): MockResponse => ({ data, error: null });

/** Resposta de erro (data nula, erro preenchido). */
const fail = (): MockResponse => ({
  data: null,
  error: { message: "boom" },
});

/** Registro de uma chamada observada no builder. */
interface CallLog {
  table: string;
  op: Op;
  args: unknown[]; // argumentos passados a insert/upsert/select
  upsertOpts?: unknown; // segundo argumento de upsert (onConflict)
}

/**
 * Fila de respostas por chave "tabela:op". Cada `from(table)` seguido de uma
 * operação consome a próxima resposta configurada para aquela chave; se não
 * houver resposta específica, usa a última configurada (ou sucesso vazio).
 */
class SupabaseMock {
  private respostas = new Map<string, MockResponse[]>();
  readonly calls: CallLog[] = [];

  /** Configura (enfileira) a resposta para uma dada (tabela, op). */
  configurar(table: string, op: Op, resposta: MockResponse): this {
    const chave = `${table}:${op}`;
    const fila = this.respostas.get(chave) ?? [];
    fila.push(resposta);
    this.respostas.set(chave, fila);
    return this;
  }

  private proxima(table: string, op: Op): MockResponse {
    const chave = `${table}:${op}`;
    const fila = this.respostas.get(chave);
    if (fila && fila.length > 0) {
      // Mantém a última resposta disponível para chamadas repetidas.
      return fila.length > 1 ? (fila.shift() as MockResponse) : fila[0];
    }
    return ok([]); // default: sucesso com lista vazia
  }

  /** O objeto que será passado como `client` para a store. */
  asClient(): SupabaseClient {
    const self = this;

    function novoBuilder(table: string) {
      // Estado da cadeia atual.
      const log: CallLog = { table, op: "select", args: [] };
      // Quando uma mutação (insert/upsert/delete) já foi encadeada, um
      // `.select(...)` posterior NÃO troca a operação: no Supabase real,
      // `.insert(...).select()` devolve as linhas mutadas, então a resposta
      // continua vinculada à mutação (espelha o uso em salvarChaveamento).
      let mutou = false;

      const resolver = (): MockResponse => self.proxima(table, log.op);

      const builder: Record<string, unknown> = {
        select: vi.fn((...args: unknown[]) => {
          // Após uma mutação, `.select(...)` só projeta colunas: preserva a
          // operação e o payload da mutação para inspeção no teste.
          if (!mutou) {
            log.op = "select";
            log.args = args;
          }
          return builder;
        }),
        insert: vi.fn((...args: unknown[]) => {
          log.op = "insert";
          log.args = args;
          mutou = true;
          return builder;
        }),
        upsert: vi.fn((valor: unknown, opts?: unknown) => {
          log.op = "upsert";
          log.args = [valor];
          log.upsertOpts = opts;
          mutou = true;
          return builder;
        }),
        delete: vi.fn(() => {
          log.op = "delete";
          mutou = true;
          return builder;
        }),
        eq: vi.fn((..._args: unknown[]) => builder),
        in: vi.fn((..._args: unknown[]) => builder),
        // Terminais que retornam Promise de {data,error}:
        maybeSingle: vi.fn(() => {
          self.calls.push({ ...log });
          return Promise.resolve(resolver());
        }),
        single: vi.fn(() => {
          self.calls.push({ ...log });
          return Promise.resolve(resolver());
        }),
        // Torna o builder "thenable": `await builder` resolve para {data,error}.
        then: (
          onFulfilled?: (v: MockResponse) => unknown,
          onRejected?: (e: unknown) => unknown,
        ) => {
          self.calls.push({ ...log });
          return Promise.resolve(resolver()).then(onFulfilled, onRejected);
        },
      };

      return builder;
    }

    return {
      from: vi.fn((table: string) => novoBuilder(table)),
    } as unknown as SupabaseClient;
  }
}

// ---------------------------------------------------------------------------
// Fixtures comuns
// ---------------------------------------------------------------------------

const REF: CategoryRef = {
  campeonatoId: "camp-1",
  categoriaId: "cat-1",
};

const DUPLA_VALIDA: NovaDupla = {
  nomeDupla: "Fera FC",
  atletaA: "Ana",
  atletaB: "Bia",
};

/** Linha `duplas` crua (snake_case) como o banco devolveria. */
function duplaRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "d1",
    categoria_id: REF.categoriaId,
    nome_dupla: "Fera FC",
    atleta_a: "Ana",
    atleta_b: "Bia",
    seed: 1,
    criado_em: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

/** Bracket mínimo (fase de grupos sem grupos/jogos) para exercitar persistência. */
function bracketMinimo(): Bracket {
  return {
    campeonatoId: REF.campeonatoId,
    categoriaId: REF.categoriaId,
    formato: "fase de grupos",
    config: { formato: "fase de grupos", numeroDeGrupos: 1, classificadosPorGrupo: 1 },
    duplas: [],
    grupos: [],
    matches: [],
    campeaId: null,
    versao: 1,
  };
}

// ===========================================================================
// adicionarDupla (R1.1–R1.4)
// ===========================================================================

describe("Bracket_Store.adicionarDupla", () => {
  it("dupla válida: retorna Pair com id e persiste (R1.1)", async () => {
    const mock = new SupabaseMock();
    // select de nomes existentes (unicidade) => vazio; insert => sucesso.
    mock.configurar("duplas", "select", ok([]));
    mock.configurar("duplas", "insert", ok(null));

    const store = criarBracketStoreBrowser(mock.asClient());
    const r = await store.adicionarDupla(REF, DUPLA_VALIDA);

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(typeof r.valor.id).toBe("string");
      expect(r.valor.id.length).toBeGreaterThan(0);
      expect(r.valor.nomeDupla).toBe("Fera FC");
      expect(r.valor.atletaA).toBe("Ana");
      expect(r.valor.atletaB).toBe("Bia");
      expect(typeof r.valor.criadoEm).toBe("string");
    }
    // Confirma que houve leitura de nomes e depois um insert em `duplas`.
    expect(mock.calls.some((c) => c.table === "duplas" && c.op === "select")).toBe(true);
    expect(mock.calls.some((c) => c.table === "duplas" && c.op === "insert")).toBe(true);
  });

  it("nome da dupla inválido: NOME_DUPLA_INVALIDO antes do insert (R1.2)", async () => {
    const mock = new SupabaseMock();
    mock.configurar("duplas", "select", ok([]));

    const store = criarBracketStoreBrowser(mock.asClient());
    const r = await store.adicionarDupla(REF, { ...DUPLA_VALIDA, nomeDupla: "   " });

    expect(r).toEqual({ ok: false, erro: { code: "NOME_DUPLA_INVALIDO" } });
    // Validação ocorre antes de qualquer escrita: nenhum insert.
    expect(mock.calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("nome de atleta inválido: NOME_ATLETA_INVALIDO antes do insert (R1.3)", async () => {
    const mock = new SupabaseMock();
    mock.configurar("duplas", "select", ok([]));

    const store = criarBracketStoreBrowser(mock.asClient());
    const r = await store.adicionarDupla(REF, { ...DUPLA_VALIDA, atletaB: "" });

    expect(r).toEqual({
      ok: false,
      erro: { code: "NOME_ATLETA_INVALIDO", qual: "B" },
    });
    expect(mock.calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("nome duplicado (case/space-insensitive): NOME_DUPLICADO (R1.4)", async () => {
    const mock = new SupabaseMock();
    // Já existe "fera fc" na categoria; candidata "  FERA FC " colide.
    mock.configurar("duplas", "select", ok([{ nome_dupla: "fera fc" }]));

    const store = criarBracketStoreBrowser(mock.asClient());
    const r = await store.adicionarDupla(REF, { ...DUPLA_VALIDA, nomeDupla: "  FERA FC " });

    expect(r).toEqual({ ok: false, erro: { code: "NOME_DUPLICADO" } });
    expect(mock.calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("falha de leitura ao checar unicidade: FALHA_LEITURA (R7.6)", async () => {
    const mock = new SupabaseMock();
    mock.configurar("duplas", "select", fail());

    const store = criarBracketStoreBrowser(mock.asClient());
    const r = await store.adicionarDupla(REF, DUPLA_VALIDA);

    expect(r).toEqual({ ok: false, erro: { code: "FALHA_LEITURA" } });
  });

  it("falha de escrita no insert: FALHA_PERSISTENCIA (R7.2)", async () => {
    const mock = new SupabaseMock();
    mock.configurar("duplas", "select", ok([]));
    mock.configurar("duplas", "insert", fail());

    const store = criarBracketStoreBrowser(mock.asClient());
    const r = await store.adicionarDupla(REF, DUPLA_VALIDA);

    expect(r).toEqual({ ok: false, erro: { code: "FALHA_PERSISTENCIA" } });
  });
});

// ===========================================================================
// removerDupla (R1.5 / R1.6)
// ===========================================================================

describe("Bracket_Store.removerDupla", () => {
  it("sem chaveamento na categoria: remove a dupla (R1.5)", async () => {
    const mock = new SupabaseMock();
    // 1) descobre a categoria da dupla
    mock.configurar("duplas", "select", ok({ categoria_id: REF.categoriaId }));
    // 2) verifica chaveamento => não há (null)
    mock.configurar("chaveamentos", "select", ok(null));
    // 3) delete da dupla => sucesso
    mock.configurar("duplas", "delete", ok(null));

    const store = criarBracketStoreBrowser(mock.asClient());
    const r = await store.removerDupla("d1");

    expect(r).toEqual({ ok: true, valor: undefined });
    expect(mock.calls.some((c) => c.table === "duplas" && c.op === "delete")).toBe(true);
  });

  it("com chaveamento existente: bloqueia com REMOCAO_BLOQUEADA (R1.6)", async () => {
    const mock = new SupabaseMock();
    mock.configurar("duplas", "select", ok({ categoria_id: REF.categoriaId }));
    // chaveamento existe => remoção bloqueada
    mock.configurar("chaveamentos", "select", ok({ id: "chav-1" }));

    const store = criarBracketStoreBrowser(mock.asClient());
    const r = await store.removerDupla("d1");

    expect(r).toEqual({ ok: false, erro: { code: "REMOCAO_BLOQUEADA" } });
    // Não deve ter chegado a deletar a dupla.
    expect(mock.calls.some((c) => c.table === "duplas" && c.op === "delete")).toBe(false);
  });
});

// ===========================================================================
// listarDuplas (R1.7 / R1.8)
// ===========================================================================

describe("Bracket_Store.listarDuplas", () => {
  it("retorna duplas ordenadas por (nome, criadoEm) (R1.7)", async () => {
    const mock = new SupabaseMock();
    // Linhas fora de ordem; esperado: Alfa, Beta, Zulu.
    mock.configurar(
      "duplas",
      "select",
      ok([
        duplaRow({ id: "z", nome_dupla: "Zulu", criado_em: "2026-01-01T00:00:00.000Z" }),
        duplaRow({ id: "a", nome_dupla: "Alfa", criado_em: "2026-01-02T00:00:00.000Z" }),
        duplaRow({ id: "b", nome_dupla: "beta", criado_em: "2026-01-03T00:00:00.000Z" }),
      ]),
    );

    const store = criarBracketStoreBrowser(mock.asClient());
    const r = await store.listarDuplas(REF);

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.map((p) => p.id)).toEqual(["a", "b", "z"]);
      expect(r.valor.map((p) => p.nomeDupla)).toEqual(["Alfa", "beta", "Zulu"]);
    }
  });

  it("sem duplas: retorna lista vazia (R1.8)", async () => {
    const mock = new SupabaseMock();
    mock.configurar("duplas", "select", ok([]));

    const store = criarBracketStoreBrowser(mock.asClient());
    const r = await store.listarDuplas(REF);

    expect(r).toEqual({ ok: true, valor: [] });
  });

  it("falha de leitura: FALHA_LEITURA (R7.6)", async () => {
    const mock = new SupabaseMock();
    mock.configurar("duplas", "select", fail());

    const store = criarBracketStoreBrowser(mock.asClient());
    const r = await store.listarDuplas(REF);

    expect(r).toEqual({ ok: false, erro: { code: "FALHA_LEITURA" } });
  });
});

// ===========================================================================
// salvarChaveamento (R7.1 / R7.2)
// ===========================================================================

describe("Bracket_Store.salvarChaveamento", () => {
  it("faz upsert por categoria (onConflict) e sobrescreve com delete+insert (R7.1)", async () => {
    const mock = new SupabaseMock();
    // upsert(...).select("id").single() => id do chaveamento
    mock.configurar("chaveamentos", "upsert", ok({ id: "chav-1" }));
    // deletes de limpeza => sucesso
    mock.configurar("jogos", "delete", ok(null));
    mock.configurar("grupos", "delete", ok(null));
    // bracket mínimo => sem inserts subordinados

    const store = criarBracketStoreBrowser(mock.asClient());
    const r = await store.salvarChaveamento(REF, bracketMinimo());

    expect(r).toEqual({ ok: true, valor: undefined });

    // Upsert feito na tabela `chaveamentos` com onConflict em categoria_id.
    const upsert = mock.calls.find((c) => c.table === "chaveamentos" && c.op === "upsert");
    expect(upsert).toBeDefined();
    expect(upsert?.upsertOpts).toEqual({ onConflict: "categoria_id" });
    const payload = upsert?.args[0] as Record<string, unknown>;
    expect(payload.categoria_id).toBe(REF.categoriaId);

    // Sobrescrita: apaga jogos e grupos antes de reinserir.
    expect(mock.calls.some((c) => c.table === "jogos" && c.op === "delete")).toBe(true);
    expect(mock.calls.some((c) => c.table === "grupos" && c.op === "delete")).toBe(true);
  });

  it("falha de escrita no upsert: FALHA_PERSISTENCIA (R7.2)", async () => {
    const mock = new SupabaseMock();
    mock.configurar("chaveamentos", "upsert", fail());

    const store = criarBracketStoreBrowser(mock.asClient());
    const r = await store.salvarChaveamento(REF, bracketMinimo());

    expect(r).toEqual({ ok: false, erro: { code: "FALHA_PERSISTENCIA" } });
  });
});

// ===========================================================================
// carregarChaveamento (R7.3 / R7.4 / R7.6)
// ===========================================================================

describe("Bracket_Store.carregarChaveamento", () => {
  it("recupera um chaveamento salvo (R7.3)", async () => {
    const mock = new SupabaseMock();
    // 1) chaveamento da categoria (maybeSingle)
    mock.configurar(
      "chaveamentos",
      "select",
      ok({
        id: "chav-1",
        categoria_id: REF.categoriaId,
        formato: "fase de grupos",
        config_json: { formato: "fase de grupos", numeroDeGrupos: 1, classificadosPorGrupo: 1 },
        campea_id: null,
        atualizado_em: "2026-01-01T00:00:00.000Z",
      }),
    );
    // 2) duplas da categoria
    mock.configurar("duplas", "select", ok([duplaRow()]));
    // 3) grupos (vazio) => sem consulta a grupo_duplas
    mock.configurar("grupos", "select", ok([]));
    // 5) jogos (vazio)
    mock.configurar("jogos", "select", ok([]));

    const store = criarBracketStoreBrowser(mock.asClient());
    const r = await store.carregarChaveamento(REF);

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor).not.toBeNull();
      expect(r.valor?.categoriaId).toBe(REF.categoriaId);
      // A store preenche o campeonatoId a partir do CategoryRef.
      expect(r.valor?.campeonatoId).toBe(REF.campeonatoId);
      expect(r.valor?.formato).toBe("fase de grupos");
      expect(r.valor?.duplas.map((d) => d.id)).toEqual(["d1"]);
    }
  });

  it("estado vazio (sem chaveamento): retorna null (R7.4)", async () => {
    const mock = new SupabaseMock();
    mock.configurar("chaveamentos", "select", ok(null));

    const store = criarBracketStoreBrowser(mock.asClient());
    const r = await store.carregarChaveamento(REF);

    expect(r).toEqual({ ok: true, valor: null });
  });

  it("falha de leitura do chaveamento: FALHA_LEITURA (R7.6)", async () => {
    const mock = new SupabaseMock();
    mock.configurar("chaveamentos", "select", fail());

    const store = criarBracketStoreBrowser(mock.asClient());
    const r = await store.carregarChaveamento(REF);

    expect(r).toEqual({ ok: false, erro: { code: "FALHA_LEITURA" } });
  });
});
