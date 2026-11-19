// src/domain/bracket/placares.ts
//
// Quantos placares o chaveamento já tem: serve para avisar, antes de gerar de
// novo, o que seria perdido. Função pura.

import type { Bracket } from "./types";

export interface ResumoPlacares {
  /** Jogos com algum placar lançado (inclui o jogo "ao vivo"). */
  comPlacar: number;
  /** Jogos já encerrados (têm vencedor). */
  encerrados: number;
}

/** Jogos reais (sem bye) com placar lançado e quantos já foram encerrados. */
export function resumirPlacares(bracket: Pick<Bracket, "matches"> | null): ResumoPlacares {
  if (!bracket) return { comPlacar: 0, encerrados: 0 };
  let comPlacar = 0;
  let encerrados = 0;
  for (const m of bracket.matches) {
    if (m.a.bye || m.b.bye) continue;
    if (m.placarA !== null || m.placarB !== null || m.vencedorId !== null) comPlacar++;
    if (m.vencedorId !== null) encerrados++;
  }
  return { comPlacar, encerrados };
}

/** "apagar 7 placares registrados", ou null quando não há nada a perder. */
export function avisoDePlacaresPerdidos(resumo: ResumoPlacares): string | null {
  if (resumo.comPlacar === 0) return null;
  const n = resumo.comPlacar;
  return `${n} ${n === 1 ? "placar registrado" : "placares registrados"}`;
}
