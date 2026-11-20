// src/domain/jogadores/colocacao.ts
//
// Colocação final das duplas e o resumo de cada jogador POR NÍVEL. Funções puras.
//
// A colocação vem do ranking final da categoria (rankingFinal) e é gravada em
// `duplas.colocacao`. O nível sai do nome livre da categoria pelo mesmo
// classificador do filtro de eventos (utils/categorias.ts), com nível e gênero
// separados ("Estreante Masculino" ≠ "Estreante Misto"). Pódio = top 3 (inclui
// os títulos). Títulos, pódios e melhor colocação são contados por nível.
import type { Bracket, PairId } from "../bracket/types";
import { rankingFinal } from "../bracket/ranking";
import { classificarCategoria, GENEROS, NIVEIS } from "../../utils/categorias";

/** Colocação de cada dupla da categoria; `null` em todas se a final não foi decidida. */
export function colocacoesDaCategoria(bracket: Bracket): Record<PairId, number | null> {
  const ranking = rankingFinal(bracket);
  const porDupla = new Map((ranking ?? []).map((l) => [l.pairId, l.posicao]));
  return Object.fromEntries(bracket.duplas.map((d) => [d.id, porDupla.get(d.id) ?? null]));
}

/** Resumo de um jogador em UM nível. */
export interface ResumoNivel {
  /** "Estreante Masculino", "Amador Feminino", "Misto" (sem nível), "Outros". */
  nivel: string;
  titulos: number;
  podios: number;
  /** Melhor colocação (menor número) no nível. */
  melhor: number;
}

/** Linha mínima de `duplas` para o resumo. */
export interface DuplaComColocacao {
  jogadorAId: string | null;
  jogadorBId: string | null;
  colocacao: number | null;
  /** Nome livre da categoria em que a dupla jogou (null = desconhecida). */
  categoria: string | null;
}

/** Chave de ordenação: ordem dos NIVEIS, depois dos GENEROS; sem nível no fim. */
function ordemDe(nivel: string | null, genero: string | null): number {
  const n = nivel === null ? NIVEIS.length : NIVEIS.indexOf(nivel as (typeof NIVEIS)[number]);
  const g = genero === null ? GENEROS.length : GENEROS.indexOf(genero as (typeof GENEROS)[number]);
  return n * 10 + g;
}

/** Rótulo do nível de uma categoria: "Estreante Masculino"; sem nível, só o gênero; nada, "Outros". */
export function nivelDaCategoria(categoria: string | null): { rotulo: string; ordem: number } {
  const { nivel, genero } = classificarCategoria(categoria ?? "");
  if (nivel === "Outros" || (nivel === null && genero === null)) {
    return { rotulo: "Outros", ordem: ordemDe("Outros", null) };
  }
  return {
    rotulo: [nivel, genero].filter(Boolean).join(" "),
    ordem: ordemDe(nivel, genero),
  };
}

/** Resumo por nível de cada jogador, a partir das duplas em que ele aparece. */
export function resumirColocacoesPorNivel(
  duplas: ReadonlyArray<DuplaComColocacao>,
): Map<string, ResumoNivel[]> {
  const porJogador = new Map<string, Map<string, ResumoNivel & { ordem: number }>>();
  for (const d of duplas) {
    if (d.colocacao === null) continue;
    const { rotulo, ordem } = nivelDaCategoria(d.categoria);
    for (const jogador of new Set([d.jogadorAId, d.jogadorBId])) {
      if (!jogador) continue;
      const niveis = porJogador.get(jogador) ?? new Map();
      const r = niveis.get(rotulo) ?? { nivel: rotulo, titulos: 0, podios: 0, melhor: d.colocacao, ordem };
      if (d.colocacao === 1) r.titulos += 1;
      if (d.colocacao <= 3) r.podios += 1;
      r.melhor = Math.min(r.melhor, d.colocacao);
      niveis.set(rotulo, r);
      porJogador.set(jogador, niveis);
    }
  }
  const resultado = new Map<string, ResumoNivel[]>();
  for (const [jogador, niveis] of porJogador) {
    resultado.set(
      jogador,
      [...niveis.values()]
        .sort((a, b) => a.ordem - b.ordem || a.nivel.localeCompare(b.nivel))
        .map(({ ordem: _o, ...r }) => r),
    );
  }
  return resultado;
}

/** "🥇 1º lugar", "🥈 2º lugar", "🥉 3º lugar", "5º lugar". */
export function rotuloColocacao(n: number): string {
  const medalha = n === 1 ? "🥇 " : n === 2 ? "🥈 " : n === 3 ? "🥉 " : "";
  return `${medalha}${n}º lugar`;
}

/** "🏆 Estreante Masculino · Melhor: 1º · 1 título · 1 pódio" (omite zeros). */
export function textoResumoNivel(r: ResumoNivel): string {
  const partes = [r.nivel, `Melhor: ${r.melhor}º`];
  if (r.titulos > 0) partes.push(`${r.titulos} ${r.titulos === 1 ? "título" : "títulos"}`);
  if (r.podios > 0) partes.push(`${r.podios} ${r.podios === 1 ? "pódio" : "pódios"}`);
  return (r.titulos > 0 ? "🏆 " : "") + partes.join(" · ");
}
