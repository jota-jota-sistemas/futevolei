// src/domain/jogadores/colocacao.ts
//
// Colocação final das duplas e o resumo por jogador. Funções puras.
//
// A colocação vem do ranking final da categoria (rankingFinal) e é gravada em
// `duplas.colocacao`. Pódio = top 3 (inclui os títulos).
import type { Bracket, PairId } from "../bracket/types";
import { rankingFinal } from "../bracket/ranking";

/** Colocação de cada dupla da categoria; `null` em todas se a final não foi decidida. */
export function colocacoesDaCategoria(bracket: Bracket): Record<PairId, number | null> {
  const ranking = rankingFinal(bracket);
  const porDupla = new Map((ranking ?? []).map((l) => [l.pairId, l.posicao]));
  return Object.fromEntries(bracket.duplas.map((d) => [d.id, porDupla.get(d.id) ?? null]));
}

export interface ResumoColocacoes {
  titulos: number;
  podios: number;
  /** Melhor colocação (menor número); null se nunca terminou uma categoria. */
  melhor: number | null;
}

/** Linha mínima de `duplas` para o resumo. */
export interface DuplaComColocacao {
  jogadorAId: string | null;
  jogadorBId: string | null;
  colocacao: number | null;
}

/** Resumo de cada jogador a partir das duplas em que ele aparece. */
export function resumirColocacoes(
  duplas: ReadonlyArray<DuplaComColocacao>,
): Map<string, ResumoColocacoes> {
  const resumo = new Map<string, ResumoColocacoes>();
  for (const d of duplas) {
    if (d.colocacao === null) continue;
    for (const jogador of new Set([d.jogadorAId, d.jogadorBId])) {
      if (!jogador) continue;
      const r = resumo.get(jogador) ?? { titulos: 0, podios: 0, melhor: null };
      if (d.colocacao === 1) r.titulos += 1;
      if (d.colocacao <= 3) r.podios += 1;
      r.melhor = r.melhor === null ? d.colocacao : Math.min(r.melhor, d.colocacao);
      resumo.set(jogador, r);
    }
  }
  return resumo;
}

/** "🥇 1º lugar", "🥈 2º lugar", "🥉 3º lugar", "5º lugar". */
export function rotuloColocacao(n: number): string {
  const medalha = n === 1 ? "🥇 " : n === 2 ? "🥈 " : n === 3 ? "🥉 " : "";
  return `${medalha}${n}º lugar`;
}

/** Texto curto para a lista: "Melhor: 1º · 2 títulos · 3 pódios" (omite zeros). */
export function textoResumo(r: ResumoColocacoes): string {
  if (r.melhor === null) return "";
  const partes = [`Melhor: ${r.melhor}º`];
  if (r.titulos > 0) partes.push(`${r.titulos} ${r.titulos === 1 ? "título" : "títulos"}`);
  if (r.podios > 0) partes.push(`${r.podios} ${r.podios === 1 ? "pódio" : "pódios"}`);
  return partes.join(" · ");
}
