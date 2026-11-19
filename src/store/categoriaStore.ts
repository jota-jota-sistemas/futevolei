// src/store/categoriaStore.ts
//
// Categoria_Store: a fronteira de I/O das categorias de um campeonato, no mesmo
// padrão do `campeonatoStore`: contrato (interface), implementação de navegador
// sobre o cliente público do Supabase (RLS: escrita só de administrador ou do
// dono do evento) e cliente INJETÁVEL para testes. Nenhum método lança.
//
// Regras:
//   - nomes passam por `domain/categorias` (normalização, slug único, mescla)
//     ANTES de qualquer escrita; nomes repetidos são ignorados, não são erro;
//   - remover só vale para categoria SEM duplas: a cascata do banco apagaria
//     duplas, chaveamento e jogos. O banco também barra (trigger, 23503).
//
// Segurança: só importa o cliente PÚBLICO (nunca `supabase.server.ts`).

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CategoriaId,
  CategoriaItem,
  MesclaCategorias,
  ResultadoCategoria,
} from "../domain/categorias/types";
import { mesclarCategorias } from "../domain/categorias/validation";
import { chaveTexto } from "../utils/texto";

// ---------------------------------------------------------------------------
// Linha do banco e mapeamento
// ---------------------------------------------------------------------------

/** Linha de `categorias` com a contagem de duplas embutida pelo PostgREST. */
export interface CategoriaRow {
  id: string;
  nome: string;
  duplas?: { count: number }[] | { count: number } | null;
}

const COLUNAS = "id, nome, duplas(count)";

/** Teto de linhas por listagem (limite padrão do PostgREST). */
export const LIMITE_LISTAGEM = 1000;

const PG_FK_VIOLATION = "23503";
const PG_UNIQUE_VIOLATION = "23505";
/** Violação de RLS/privilégio. */
const PG_INSUFFICIENT_PRIVILEGE = "42501";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function categoriaRowParaItem(row: CategoriaRow): CategoriaItem {
  const contagem = Array.isArray(row.duplas) ? row.duplas[0]?.count : row.duplas?.count;
  const duplas = typeof contagem === "number" && Number.isFinite(contagem) ? contagem : 0;
  return { id: row.id, nome: row.nome, duplas };
}

/** Ordem estável: nome sem acento/caixa, desempate pelo id. */
function ordenar(itens: CategoriaItem[]): CategoriaItem[] {
  return [...itens].sort(
    (a, b) =>
      chaveTexto(a.nome).localeCompare(chaveTexto(b.nome), "pt-BR") ||
      a.nome.localeCompare(b.nome, "pt-BR") ||
      a.id.localeCompare(b.id)
  );
}

// ---------------------------------------------------------------------------
// Contrato
// ---------------------------------------------------------------------------

/** Resultado de criar várias: o que entrou e o que foi ignorado. */
export interface ResultadoCriacao extends Omit<MesclaCategorias, "adicionar"> {
  criadas: CategoriaItem[];
}

export interface CategoriaStore {
  /** Categorias do campeonato, em ordem alfabética, com a contagem de duplas. */
  listar(campeonatoId: string): Promise<ResultadoCategoria<CategoriaItem[]>>;
  /**
   * Cria as categorias que ainda não existem (repetidas e inválidas são
   * ignoradas e informadas). Uma escrita só: se falhar, nada é criado.
   */
  criarVarias(
    campeonatoId: string,
    nomes: readonly string[]
  ): Promise<ResultadoCategoria<ResultadoCriacao>>;
  /** Remove a categoria. Com duplas: TEM_DUPLAS (nada é apagado). */
  remover(categoriaId: CategoriaId): Promise<ResultadoCategoria<void>>;
  /** Copia para `destinoId` os NOMES das categorias de `origemId` que faltam. */
  copiarDe(origemId: string, destinoId: string): Promise<ResultadoCategoria<ResultadoCriacao>>;
}

// ---------------------------------------------------------------------------
// Helpers (bordas de I/O)
// ---------------------------------------------------------------------------

function erro(code: "FALHA_PERSISTENCIA" | "FALHA_LEITURA" | "SEM_PERMISSAO" | "TEM_DUPLAS" | "CATEGORIA_NAO_ENCONTRADA"): ResultadoCategoria<never> {
  return { ok: false, erro: { code } };
}

function codigoDe(e: unknown): string | undefined {
  return (e as { code?: string } | null)?.code;
}

function erroDeEscrita(e: unknown): ResultadoCategoria<never> {
  return codigoDe(e) === PG_INSUFFICIENT_PRIVILEGE ? erro("SEM_PERMISSAO") : erro("FALHA_PERSISTENCIA");
}

function idDeCampeonatoValido(id: string): boolean {
  return typeof id === "string" && id.length >= 1 && id.length <= 200;
}

/**
 * Resolve o cliente público SOB DEMANDA. O import é dinâmico porque
 * `src/lib/supabase.ts` lança se as variáveis de ambiente estiverem ausentes.
 */
async function clientePublicoPadrao(): Promise<SupabaseClient> {
  const mod = await import("../lib/supabase");
  return mod.supabase;
}

// ---------------------------------------------------------------------------
// Implementação de navegador
// ---------------------------------------------------------------------------

export function criarCategoriaStoreBrowser(client?: SupabaseClient): CategoriaStore {
  let cache: SupabaseClient | null = client ?? null;
  async function obterClient(): Promise<SupabaseClient> {
    if (cache === null) cache = await clientePublicoPadrao();
    return cache;
  }

  const store: CategoriaStore = {
    async listar(campeonatoId) {
      if (!idDeCampeonatoValido(campeonatoId)) return erro("FALHA_LEITURA");
      try {
        const c = await obterClient();
        const { data, error } = await c
          .from("categorias")
          .select(COLUNAS)
          .eq("campeonato_id", campeonatoId)
          .range(0, LIMITE_LISTAGEM - 1);
        if (error) return erro("FALHA_LEITURA");
        const itens = ((data ?? []) as unknown as CategoriaRow[]).map(categoriaRowParaItem);
        return { ok: true, valor: ordenar(itens) };
      } catch {
        return erro("FALHA_LEITURA");
      }
    },

    async criarVarias(campeonatoId, nomes) {
      if (!idDeCampeonatoValido(campeonatoId)) return erro("FALHA_PERSISTENCIA");
      const existentes = await store.listar(campeonatoId);
      if (!existentes.ok) return existentes;

      const mescla = mesclarCategorias(
        existentes.valor.map((e) => e.nome),
        nomes
      );
      const { adicionar, repetidas, invalidas } = mescla;
      if (adicionar.length === 0) {
        return { ok: true, valor: { criadas: [], repetidas, invalidas } };
      }

      try {
        const c = await obterClient();
        const linhas = adicionar.map((nome) => ({ campeonato_id: campeonatoId, nome }));
        const { data, error } = await c.from("categorias").insert(linhas).select("id, nome");
        if (error) {
          // Outra pessoa criou o mesmo nome entre a leitura e a escrita: nada entrou.
          return codigoDe(error) === PG_UNIQUE_VIOLATION ? erro("FALHA_PERSISTENCIA") : erroDeEscrita(error);
        }
        const criadas = ordenar(
          ((data ?? []) as { id: string; nome: string }[]).map((r) => ({ id: r.id, nome: r.nome, duplas: 0 }))
        );
        return { ok: true, valor: { criadas, repetidas, invalidas } };
      } catch {
        return erro("FALHA_PERSISTENCIA");
      }
    },

    async remover(categoriaId) {
      if (!UUID.test(categoriaId)) return erro("CATEGORIA_NAO_ENCONTRADA");
      try {
        const c = await obterClient();
        const contagem = await c
          .from("duplas")
          .select("id", { count: "exact", head: true })
          .eq("categoria_id", categoriaId);
        if (contagem.error) return erro("FALHA_LEITURA");
        if ((contagem.count ?? 0) > 0) return erro("TEM_DUPLAS");

        const { data, error } = await c.from("categorias").delete().eq("id", categoriaId).select("id");
        if (error) {
          // Dupla criada entre a contagem e a remoção: o banco (trigger) barra.
          if (codigoDe(error) === PG_FK_VIOLATION) return erro("TEM_DUPLAS");
          return erroDeEscrita(error);
        }
        if (!Array.isArray(data) || data.length === 0) return erro("CATEGORIA_NAO_ENCONTRADA");
        return { ok: true, valor: undefined };
      } catch {
        return erro("FALHA_PERSISTENCIA");
      }
    },

    async copiarDe(origemId, destinoId) {
      const origem = await store.listar(origemId);
      if (!origem.ok) return origem;
      return store.criarVarias(
        destinoId,
        origem.valor.map((c) => c.nome)
      );
    },
  };

  return store;
}
