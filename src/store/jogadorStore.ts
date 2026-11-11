// src/store/jogadorStore.ts
//
// Jogador_Store: a fronteira de I/O do CRUD de jogadores, no mesmo padrão do
// `bracketStore`: contrato (interface), implementação de navegador sobre o
// cliente público do Supabase (depende das políticas de RLS) e cliente
// INJETÁVEL para testes.
//
// A validação e a normalização vivem em `domain/jogadores` (puras). Esta store:
//   - valida antes de qualquer escrita,
//   - gera id e carimbos de tempo NA BORDA (aqui o relógio e `crypto.randomUUID`
//     são permitidos),
//   - traduz linhas ↔ domínio,
//   - mapeia falhas de escrita -> FALHA_PERSISTENCIA e de leitura -> FALHA_LEITURA.
//
// Segurança: só importa o cliente PÚBLICO (nunca `supabase.server.ts`).

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  GENEROS_JOGADOR,
  type GeneroJogador,
  type Jogador,
  type JogadorId,
  type JogadorInput,
  type ResultadoJogador,
} from "../domain/jogadores/types";
import {
  ordenarJogadores,
  validarJogador,
} from "../domain/jogadores/validation";

// ---------------------------------------------------------------------------
// Linha do banco e mapeamento
// ---------------------------------------------------------------------------

/** Linha da tabela `jogadores` (snake_case, como no banco). */
export interface JogadorRow {
  id: string;
  nome: string;
  apelido: string | null;
  genero: string | null;
  cidade: string | null;
  uf: string | null;
  instagram: string | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

const COLUNAS =
  "id, nome, apelido, genero, cidade, uf, instagram, ativo, criado_em, atualizado_em";

/** Teto de linhas por listagem (limite padrão do PostgREST). */
export const LIMITE_LISTAGEM = 1000;

/** Código do Postgres para violação de chave estrangeira. */
const PG_FK_VIOLATION = "23503";

export function jogadorRowParaJogador(row: JogadorRow): Jogador {
  const genero = (GENEROS_JOGADOR as readonly string[]).includes(row.genero ?? "")
    ? (row.genero as GeneroJogador)
    : null;
  return {
    id: row.id,
    nome: row.nome,
    apelido: row.apelido,
    genero,
    cidade: row.cidade,
    uf: row.uf,
    instagram: row.instagram,
    ativo: row.ativo,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

// ---------------------------------------------------------------------------
// Contrato
// ---------------------------------------------------------------------------

export type DestinoExclusao = "excluido" | "arquivado";

export interface JogadorStore {
  /** Lista ordenada (nome, criadoEm, id). Por padrão só os ativos. */
  listar(opcoes?: { incluirArquivados?: boolean }): Promise<ResultadoJogador<Jogador[]>>;
  obter(id: JogadorId): Promise<ResultadoJogador<Jogador>>;
  criar(entrada: JogadorInput): Promise<ResultadoJogador<Jogador>>;
  atualizar(id: JogadorId, entrada: JogadorInput): Promise<ResultadoJogador<Jogador>>;
  /** Arquiva (ativo = false) ou reativa um jogador. */
  definirAtivo(id: JogadorId, ativo: boolean): Promise<ResultadoJogador<Jogador>>;
  /** Quantas duplas (inscrições) referenciam o jogador. */
  contarVinculos(id: JogadorId): Promise<ResultadoJogador<number>>;
  /**
   * Exclui de vez se o jogador não tem vínculo com nenhuma dupla; caso
   * contrário ARQUIVA (o histórico é preservado). Informa o que ocorreu.
   */
  excluir(id: JogadorId): Promise<ResultadoJogador<DestinoExclusao>>;
}

// ---------------------------------------------------------------------------
// Helpers (bordas de I/O)
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function erroPersistencia(): ResultadoJogador<never> {
  return { ok: false, erro: { code: "FALHA_PERSISTENCIA" } };
}

function erroLeitura(): ResultadoJogador<never> {
  return { ok: false, erro: { code: "FALHA_LEITURA" } };
}

function naoEncontrado(): ResultadoJogador<never> {
  return { ok: false, erro: { code: "JOGADOR_NAO_ENCONTRADO" } };
}

function novoId(): string {
  return crypto.randomUUID();
}

function agoraISO(): string {
  return new Date().toISOString();
}

/**
 * Resolve o cliente público SOB DEMANDA. O import é dinâmico porque
 * `src/lib/supabase.ts` lança se as variáveis de ambiente estiverem ausentes;
 * assim, consumidores e testes com cliente injetado nunca o carregam.
 */
async function clientePublicoPadrao(): Promise<SupabaseClient> {
  const mod = await import("../lib/supabase");
  return mod.supabase;
}

// ---------------------------------------------------------------------------
// Implementação de navegador
// ---------------------------------------------------------------------------

export function criarJogadorStoreBrowser(client?: SupabaseClient): JogadorStore {
  let cache: SupabaseClient | null = client ?? null;
  async function obterClient(): Promise<SupabaseClient> {
    if (cache === null) cache = await clientePublicoPadrao();
    return cache;
  }

  /** Atualiza colunas de um jogador e devolve a linha resultante. */
  async function atualizarColunas(
    id: JogadorId,
    campos: Record<string, unknown>
  ): Promise<ResultadoJogador<Jogador>> {
    try {
      const client = await obterClient();
      const { data, error } = await client
        .from("jogadores")
        .update({ ...campos, atualizado_em: agoraISO() })
        .eq("id", id)
        .select(COLUNAS);
      if (error) return erroPersistencia();
      const linha = (data as JogadorRow[] | null)?.[0];
      if (!linha) return naoEncontrado(); // id inexistente (ou sem permissão)
      return { ok: true, valor: jogadorRowParaJogador(linha) };
    } catch {
      return erroPersistencia();
    }
  }

  const store: JogadorStore = {
    async listar(opcoes) {
      try {
        const client = await obterClient();
        let consulta = client.from("jogadores").select(COLUNAS);
        if (!opcoes?.incluirArquivados) consulta = consulta.eq("ativo", true);
        const { data, error } = await consulta
          .order("nome")
          .range(0, LIMITE_LISTAGEM - 1);
        if (error) return erroLeitura();
        const jogadores = ((data ?? []) as JogadorRow[]).map(jogadorRowParaJogador);
        // A ordem do banco depende da collation; a final é a do domínio.
        return { ok: true, valor: ordenarJogadores(jogadores) };
      } catch {
        return erroLeitura();
      }
    },

    async obter(id) {
      if (!UUID.test(id)) return naoEncontrado();
      try {
        const client = await obterClient();
        const { data, error } = await client
          .from("jogadores")
          .select(COLUNAS)
          .eq("id", id)
          .maybeSingle();
        if (error) return erroLeitura();
        if (!data) return naoEncontrado();
        return { ok: true, valor: jogadorRowParaJogador(data as JogadorRow) };
      } catch {
        return erroLeitura();
      }
    },

    async criar(entrada) {
      const validado = validarJogador(entrada);
      if (!validado.ok) return validado;

      const agora = agoraISO();
      const row: JogadorRow = {
        id: novoId(),
        ...validado.valor,
        ativo: true,
        criado_em: agora,
        atualizado_em: agora,
      };

      try {
        const client = await obterClient();
        const { error } = await client.from("jogadores").insert(row);
        if (error) return erroPersistencia();
      } catch {
        return erroPersistencia();
      }
      return { ok: true, valor: jogadorRowParaJogador(row) };
    },

    async atualizar(id, entrada) {
      if (!UUID.test(id)) return naoEncontrado();
      const validado = validarJogador(entrada);
      if (!validado.ok) return validado;
      return atualizarColunas(id, { ...validado.valor });
    },

    async definirAtivo(id, ativo) {
      if (!UUID.test(id)) return naoEncontrado();
      return atualizarColunas(id, { ativo });
    },

    async contarVinculos(id) {
      if (!UUID.test(id)) return naoEncontrado();
      try {
        const client = await obterClient();
        // `id` já foi validado como UUID: seguro para compor o filtro `or`.
        const { count, error } = await client
          .from("duplas")
          .select("id", { count: "exact", head: true })
          .or(`jogador_a_id.eq.${id},jogador_b_id.eq.${id}`);
        if (error) return erroLeitura();
        return { ok: true, valor: count ?? 0 };
      } catch {
        return erroLeitura();
      }
    },

    async excluir(id) {
      if (!UUID.test(id)) return naoEncontrado();

      const vinculos = await store.contarVinculos(id);
      if (!vinculos.ok) return vinculos;

      const arquivar = async (): Promise<ResultadoJogador<DestinoExclusao>> => {
        const r = await store.definirAtivo(id, false);
        return r.ok ? { ok: true, valor: "arquivado" } : r;
      };

      // Com histórico: arquiva em vez de apagar.
      if (vinculos.valor > 0) return arquivar();

      try {
        const client = await obterClient();
        const { error } = await client.from("jogadores").delete().eq("id", id);
        if (error) {
          // Vínculo criado entre a contagem e o delete: o banco (restrict)
          // barra a exclusão; o histórico é preservado arquivando.
          if ((error as { code?: string }).code === PG_FK_VIOLATION) return arquivar();
          return erroPersistencia();
        }
      } catch {
        return erroPersistencia();
      }
      return { ok: true, valor: "excluido" };
    },
  };

  return store;
}
