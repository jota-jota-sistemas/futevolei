// src/store/progressoStore.ts
//
// Progresso_Store: leitura (só leitura) do andamento de VÁRIOS campeonatos de uma
// vez, para a lista "Meus eventos" mostrar "3 categorias · 24 duplas · …" sem
// abrir um por um. Mesmo padrão das demais stores: cliente público injetável,
// `Result`, nenhum método lança.
//
// Sem N+1: uma consulta de categorias (com a contagem de duplas e o chaveamento
// embutidos) e uma de jogos, ambas em lote por `.in(...)` e paginadas. O
// PostgREST não agrupa, então os jogos são lidos (poucas colunas) e contados aqui.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ResultadoCampeonato } from "../domain/campeonatos/types";
import { PROGRESSO_VAZIO, type DadosProgresso } from "../domain/campeonatos/progresso";

/** Quantos ids por consulta `.in(...)` (mantém a URL curta). */
export const TAMANHO_LOTE = 100;
/** Linhas por página (o PostgREST limita a 1000 por padrão). */
export const TAMANHO_PAGINA = 1000;
/** Teto de páginas por consulta (evita laço sem fim se algo sair do esperado). */
const MAX_PAGINAS = 30;

export type ProgressoPorCampeonato = Record<string, DadosProgresso>;

export interface ProgressoStore {
  /** Progresso de cada id pedido (os que não têm nada vêm zerados). */
  carregar(ids: readonly string[]): Promise<ResultadoCampeonato<ProgressoPorCampeonato>>;
}

interface CategoriaLinha {
  id: string;
  campeonato_id: string;
  nome: string;
  duplas?: { count: number }[] | { count: number } | null;
  chaveamentos?: { id: string }[] | { id: string } | null;
}

interface JogoLinha {
  chaveamento_id: string;
  vencedor_id: string | null;
  a_bye: boolean | null;
  b_bye: boolean | null;
}

const lista = <T>(v: T | T[] | null | undefined): T[] => (Array.isArray(v) ? v : v ? [v] : []);

function contagem(v: CategoriaLinha["duplas"]): number {
  const n = lista(v)[0]?.count;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function pedacos<T>(itens: readonly T[], tamanho: number): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) r.push(itens.slice(i, i + tamanho));
  return r;
}

async function clientePublicoPadrao(): Promise<SupabaseClient> {
  const mod = await import("../lib/supabase");
  return mod.supabase;
}

export function criarProgressoStoreBrowser(
  client?: SupabaseClient,
  opcoes?: { pagina?: number }
): ProgressoStore {
  let cache: SupabaseClient | null = client ?? null;
  async function obterClient(): Promise<SupabaseClient> {
    if (cache === null) cache = await clientePublicoPadrao();
    return cache;
  }
  const pagina = Math.max(1, opcoes?.pagina ?? TAMANHO_PAGINA);

  /** Lê todas as páginas de uma consulta `.in(coluna, ids)` ordenada por `ordem`. */
  async function lerTudo<T>(
    c: SupabaseClient,
    tabela: string,
    colunas: string,
    coluna: string,
    ids: readonly string[],
    ordem: string
  ): Promise<T[] | null> {
    const todas: T[] = [];
    for (let p = 0; p < MAX_PAGINAS; p++) {
      const de = p * pagina;
      const { data, error } = await c
        .from(tabela)
        .select(colunas)
        .in(coluna, [...ids])
        .order(ordem)
        .range(de, de + pagina - 1);
      if (error) return null;
      const linhas = (data ?? []) as unknown as T[];
      todas.push(...linhas);
      if (linhas.length < pagina) return todas;
    }
    return todas;
  }

  return {
    async carregar(ids) {
      const unicos = Array.from(new Set(ids.filter((i) => typeof i === "string" && i !== "")));
      const saida: ProgressoPorCampeonato = {};
      for (const id of unicos) saida[id] = { ...PROGRESSO_VAZIO, nomesCategorias: [] };
      if (unicos.length === 0) return { ok: true, valor: saida };

      try {
        const c = await obterClient();

        // 1) Categorias (com contagem de duplas e chaveamento).
        const chaveamentoDe = new Map<string, string>(); // chaveamento -> campeonato
        for (const lote of pedacos(unicos, TAMANHO_LOTE)) {
          const categorias = await lerTudo<CategoriaLinha>(
            c,
            "categorias",
            "id, campeonato_id, nome, duplas(count), chaveamentos(id)",
            "campeonato_id",
            lote,
            "id"
          );
          if (categorias === null) return { ok: false, erro: { code: "FALHA_LEITURA" } };
          for (const cat of categorias) {
            const p = saida[cat.campeonato_id];
            if (!p) continue;
            p.categorias += 1;
            p.nomesCategorias.push(cat.nome);
            p.duplas += contagem(cat.duplas);
            for (const ch of lista(cat.chaveamentos)) {
              p.chaveamentos += 1;
              chaveamentoDe.set(ch.id, cat.campeonato_id);
            }
          }
        }

        // 2) Jogos dos chaveamentos que existem (sem bye = jogo de verdade).
        for (const lote of pedacos(Array.from(chaveamentoDe.keys()), TAMANHO_LOTE)) {
          const jogos = await lerTudo<JogoLinha>(
            c,
            "jogos",
            "chaveamento_id, vencedor_id, a_bye, b_bye",
            "chaveamento_id",
            lote,
            "id"
          );
          if (jogos === null) return { ok: false, erro: { code: "FALHA_LEITURA" } };
          for (const j of jogos) {
            if (j.a_bye || j.b_bye) continue;
            const campeonato = chaveamentoDe.get(j.chaveamento_id);
            const p = campeonato ? saida[campeonato] : undefined;
            if (!p) continue;
            p.jogos += 1;
            if (j.vencedor_id !== null) p.concluidos += 1;
          }
        }
        for (const p of Object.values(saida)) p.nomesCategorias.sort((a, b) => a.localeCompare(b, "pt-BR"));
        return { ok: true, valor: saida };
      } catch {
        return { ok: false, erro: { code: "FALHA_LEITURA" } };
      }
    },
  };
}
