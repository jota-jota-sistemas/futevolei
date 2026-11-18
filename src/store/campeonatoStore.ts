// src/store/campeonatoStore.ts
//
// Campeonato_Store: a fronteira de I/O do gerenciamento de campeonatos
// (eventos), no mesmo padrão do `jogadorStore`: contrato (interface),
// implementação de navegador sobre o cliente público do Supabase (depende das
// políticas de RLS: escrita só com eh_admin()) e cliente INJETÁVEL para testes.
//
// A validação e a normalização vivem em `domain/campeonatos` (puras). Esta store:
//   - valida antes de qualquer escrita,
//   - gera o id (slug + ano, único) e os carimbos de tempo NA BORDA,
//   - traduz linhas <-> domínio,
//   - mapeia falhas de escrita -> FALHA_PERSISTENCIA e de leitura -> FALHA_LEITURA.
//
// Exclusão: `categorias.campeonato_id` tem `on delete cascade` (apagaria
// duplas, chaveamentos e jogos junto). Por isso `excluir` só apaga o campeonato
// quando ele NÃO tem categorias; com categorias, ARQUIVA.
//
// Não mexe em `foto`, `local`, `fonte` e `id_origem` ao editar. A foto não é
// gerenciada aqui (a coluna usa o padrão do banco nas linhas novas).
//
// Segurança: só importa o cliente PÚBLICO (nunca `supabase.server.ts`).

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CampeonatoDetalhe,
  CampeonatoId,
  CampeonatoInput,
  CampeonatoRegistro,
  ResultadoCampeonato,
} from "../domain/campeonatos/types";
import {
  FONTE_MANUAL,
  baseDoId,
  gerarIdCampeonato,
  ordenarCampeonatos,
  validarCampeonato,
} from "../domain/campeonatos/validation";

// ---------------------------------------------------------------------------
// Linha do banco e mapeamento
// ---------------------------------------------------------------------------

/** Linha da tabela `campeonatos` (snake_case, como no banco), só as colunas usadas aqui. */
export interface CampeonatoRow {
  id: string;
  nome: string;
  data: string;
  data_fim: string | null;
  cidade: string | null;
  uf: string | null;
  endereco: string | null;
  preco: number | string | null;
  preco_texto: string | null;
  inscricao: string | null;
  instagram: string | null;
  descricao: string | null;
  listado: boolean | null;
  ativo: boolean | null;
  fonte: string | null;
  criado_em: string;
  atualizado_em: string;
}

/** Linha de leitura de um campeonato, com as categorias embutidas pelo PostgREST. */
export interface CampeonatoDetalheRow extends CampeonatoRow {
  categorias?: { nome: string }[] | { nome: string } | null;
}

const COLUNAS =
  "id, nome, data, data_fim, cidade, uf, endereco, preco, preco_texto, inscricao, instagram, descricao, listado, ativo, fonte, criado_em, atualizado_em";

/** Teto de linhas por listagem (limite padrão do PostgREST). */
export const LIMITE_LISTAGEM = 1000;

/** Quantas vezes `criar` tenta de novo quando o id é tomado entre a consulta e a escrita. */
const TENTATIVAS_CRIAR = 3;

/** Códigos do Postgres. */
const PG_UNIQUE_VIOLATION = "23505";
const PG_FK_VIOLATION = "23503";

export function campeonatoRowParaRegistro(row: CampeonatoRow): CampeonatoRegistro {
  const preco = typeof row.preco === "string" ? Number(row.preco) : row.preco;
  return {
    id: row.id,
    nome: row.nome,
    data: row.data,
    dataFim: row.data_fim,
    cidade: row.cidade,
    uf: row.uf ? row.uf.trim() : null,
    endereco: row.endereco,
    preco: preco !== null && preco !== undefined && Number.isFinite(preco) ? preco : null,
    precoTexto: row.preco_texto,
    inscricao: row.inscricao,
    instagram: row.instagram,
    descricao: row.descricao,
    listado: row.listado !== false,
    ativo: row.ativo !== false,
    fonte: row.fonte,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

/** Nomes das categorias embutidas (objeto, array ou ausente), sem vazios, em ordem alfabética. */
function nomesDeCategorias(embutido: CampeonatoDetalheRow["categorias"]): string[] {
  const lista = Array.isArray(embutido) ? embutido : embutido ? [embutido] : [];
  return lista
    .map((c) => (c?.nome ?? "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function campeonatoRowParaDetalhe(row: CampeonatoDetalheRow): CampeonatoDetalhe {
  return { ...campeonatoRowParaRegistro(row), categorias: nomesDeCategorias(row.categorias) };
}

// ---------------------------------------------------------------------------
// Contrato
// ---------------------------------------------------------------------------

export type DestinoExclusaoCampeonato = "excluido" | "arquivado";

export interface CampeonatoStore {
  /** Lista ordenada (data desc, nome, id). Por padrão só os ativos. */
  listar(opcoes?: { incluirArquivados?: boolean }): Promise<ResultadoCampeonato<CampeonatoRegistro[]>>;
  /** Um campeonato com os nomes das categorias. */
  obter(id: CampeonatoId): Promise<ResultadoCampeonato<CampeonatoDetalhe>>;
  /** Cria um campeonato manual (`fonte = "manual"`, ativo) com id único gerado. */
  criar(entrada: CampeonatoInput): Promise<ResultadoCampeonato<CampeonatoRegistro>>;
  /** Atualiza os dados editáveis. Nunca altera `id`, `fonte` nem `id_origem`. */
  atualizar(id: CampeonatoId, entrada: CampeonatoInput): Promise<ResultadoCampeonato<CampeonatoRegistro>>;
  /** Arquiva (ativo = false) ou reativa um campeonato. */
  definirAtivo(id: CampeonatoId, ativo: boolean): Promise<ResultadoCampeonato<CampeonatoRegistro>>;
  /** Quantas categorias o campeonato tem. */
  contarCategorias(id: CampeonatoId): Promise<ResultadoCampeonato<number>>;
  /**
   * Exclui de vez se o campeonato não tem categorias; caso contrário ARQUIVA
   * (o histórico é preservado). Informa o que ocorreu.
   */
  excluir(id: CampeonatoId): Promise<ResultadoCampeonato<DestinoExclusaoCampeonato>>;
}

// ---------------------------------------------------------------------------
// Helpers (bordas de I/O)
// ---------------------------------------------------------------------------

/** Id utilizável na consulta: texto não vazio e de tamanho razoável. */
function idValido(id: string): boolean {
  return typeof id === "string" && id.length >= 1 && id.length <= 200;
}

function erroPersistencia(): ResultadoCampeonato<never> {
  return { ok: false, erro: { code: "FALHA_PERSISTENCIA" } };
}

function erroLeitura(): ResultadoCampeonato<never> {
  return { ok: false, erro: { code: "FALHA_LEITURA" } };
}

function naoEncontrado(): ResultadoCampeonato<never> {
  return { ok: false, erro: { code: "CAMPEONATO_NAO_ENCONTRADO" } };
}

function agoraISO(): string {
  return new Date().toISOString();
}

function codigoDe(erro: unknown): string | undefined {
  return (erro as { code?: string } | null)?.code;
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

export function criarCampeonatoStoreBrowser(client?: SupabaseClient): CampeonatoStore {
  let cache: SupabaseClient | null = client ?? null;
  async function obterClient(): Promise<SupabaseClient> {
    if (cache === null) cache = await clientePublicoPadrao();
    return cache;
  }

  /** Atualiza colunas de um campeonato e devolve a linha resultante. */
  async function atualizarColunas(
    id: CampeonatoId,
    campos: Record<string, unknown>
  ): Promise<ResultadoCampeonato<CampeonatoRegistro>> {
    try {
      const c = await obterClient();
      const { data, error } = await c
        .from("campeonatos")
        .update({ ...campos, atualizado_em: agoraISO() })
        .eq("id", id)
        .select(COLUNAS);
      if (error) return erroPersistencia();
      const linha = (data as CampeonatoRow[] | null)?.[0];
      if (!linha) return naoEncontrado(); // id inexistente (ou sem permissão)
      return { ok: true, valor: campeonatoRowParaRegistro(linha) };
    } catch {
      return erroPersistencia();
    }
  }

  /** Ids já usados que começam com a base (inclui arquivados, para o admin). */
  async function idsComBase(base: string): Promise<ResultadoCampeonato<string[]>> {
    try {
      const c = await obterClient();
      // `base` só tem [a-z0-9-] (slug): sem curingas de LIKE.
      const { data, error } = await c
        .from("campeonatos")
        .select("id")
        .like("id", `${base}%`)
        .range(0, LIMITE_LISTAGEM - 1);
      if (error) return erroLeitura();
      return { ok: true, valor: ((data ?? []) as { id: string }[]).map((r) => r.id) };
    } catch {
      return erroLeitura();
    }
  }

  const store: CampeonatoStore = {
    async listar(opcoes) {
      try {
        const c = await obterClient();
        let consulta = c.from("campeonatos").select(COLUNAS);
        if (!opcoes?.incluirArquivados) consulta = consulta.eq("ativo", true);
        const { data, error } = await consulta
          .order("data", { ascending: false })
          .range(0, LIMITE_LISTAGEM - 1);
        if (error) return erroLeitura();
        const lista = ((data ?? []) as CampeonatoRow[]).map(campeonatoRowParaRegistro);
        // A ordem do banco depende da collation; a final é a do domínio.
        return { ok: true, valor: ordenarCampeonatos(lista) };
      } catch {
        return erroLeitura();
      }
    },

    async obter(id) {
      if (!idValido(id)) return naoEncontrado();
      try {
        const c = await obterClient();
        const { data, error } = await c
          .from("campeonatos")
          .select(`${COLUNAS}, categorias(nome)`)
          .eq("id", id)
          .maybeSingle();
        if (error) return erroLeitura();
        if (!data) return naoEncontrado();
        return { ok: true, valor: campeonatoRowParaDetalhe(data as unknown as CampeonatoDetalheRow) };
      } catch {
        return erroLeitura();
      }
    },

    async criar(entrada) {
      const validado = validarCampeonato(entrada);
      if (!validado.ok) return validado;
      const d = validado.valor;

      const base = baseDoId(d.nome, d.data);
      const tomados = new Set<string>();

      for (let tentativa = 0; tentativa < TENTATIVAS_CRIAR; tentativa++) {
        const existentes = await idsComBase(base);
        if (!existentes.ok) return existentes;
        const id = gerarIdCampeonato(d.nome, d.data, [...existentes.valor, ...tomados]);

        const agora = agoraISO();
        const row: CampeonatoRow = {
          id,
          nome: d.nome,
          data: d.data,
          data_fim: d.dataFim,
          cidade: d.cidade,
          uf: d.uf,
          endereco: d.endereco,
          preco: d.preco,
          preco_texto: d.precoTexto,
          inscricao: d.inscricao,
          instagram: d.instagram,
          descricao: d.descricao,
          listado: d.listado,
          ativo: true,
          fonte: FONTE_MANUAL,
          criado_em: agora,
          atualizado_em: agora,
        };

        try {
          const c = await obterClient();
          const { error } = await c.from("campeonatos").insert(row);
          if (!error) return { ok: true, valor: campeonatoRowParaRegistro(row) };
          // Id tomado entre a consulta e a escrita: tenta o próximo.
          if (codigoDe(error) === PG_UNIQUE_VIOLATION) {
            tomados.add(id);
            continue;
          }
          return erroPersistencia();
        } catch {
          return erroPersistencia();
        }
      }
      return erroPersistencia();
    },

    async atualizar(id, entrada) {
      if (!idValido(id)) return naoEncontrado();
      const validado = validarCampeonato(entrada);
      if (!validado.ok) return validado;
      const d = validado.valor;
      // Colunas editáveis, uma a uma: `id`, `fonte`, `id_origem` e `foto` ficam fora.
      return atualizarColunas(id, {
        nome: d.nome,
        data: d.data,
        data_fim: d.dataFim,
        cidade: d.cidade,
        uf: d.uf,
        endereco: d.endereco,
        preco: d.preco,
        preco_texto: d.precoTexto,
        inscricao: d.inscricao,
        instagram: d.instagram,
        descricao: d.descricao,
        listado: d.listado,
      });
    },

    async definirAtivo(id, ativo) {
      if (!idValido(id)) return naoEncontrado();
      return atualizarColunas(id, { ativo });
    },

    async contarCategorias(id) {
      if (!idValido(id)) return naoEncontrado();
      try {
        const c = await obterClient();
        const { count, error } = await c
          .from("categorias")
          .select("id", { count: "exact", head: true })
          .eq("campeonato_id", id);
        if (error) return erroLeitura();
        return { ok: true, valor: count ?? 0 };
      } catch {
        return erroLeitura();
      }
    },

    async excluir(id) {
      if (!idValido(id)) return naoEncontrado();

      const categorias = await store.contarCategorias(id);
      if (!categorias.ok) return categorias;

      const arquivar = async (): Promise<ResultadoCampeonato<DestinoExclusaoCampeonato>> => {
        const r = await store.definirAtivo(id, false);
        return r.ok ? { ok: true, valor: "arquivado" } : r;
      };

      // Com categorias: arquiva em vez de apagar (o delete levaria duplas,
      // chaveamentos e jogos junto, por cascata).
      if (categorias.valor > 0) return arquivar();

      try {
        const c = await obterClient();
        const { data, error } = await c.from("campeonatos").delete().eq("id", id).select("id");
        if (error) {
          // Se o banco barrar por vínculo, preserva o histórico arquivando.
          if (codigoDe(error) === PG_FK_VIOLATION) return arquivar();
          return erroPersistencia();
        }
        // Nenhuma linha removida: id inexistente (ou sem permissão).
        if (!Array.isArray(data) || data.length === 0) return naoEncontrado();
      } catch {
        return erroPersistencia();
      }
      return { ok: true, valor: "excluido" };
    },
  };

  return store;
}
