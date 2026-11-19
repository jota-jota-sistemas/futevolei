// src/domain/bracket/origem.ts
//
// Origem das vagas ainda indefinidas do mata-mata: de qual jogo sairá a dupla
// de cada slot ("Vencedor do jogo 4", "Perdedor do jogo 13"). Função PURA,
// derivada das ligações `avancaVencedorPara` / `encaminhaPerdedorPara`.

import type { Match, MatchId } from "./types";

export type OrigemSlot = {
  tipo: "vencedor" | "perdedor";
  jogo: Match;
};

/** Chave de lookup de um slot: `${matchId}:${a|b}`. */
export function chaveSlot(matchId: MatchId, slot: "a" | "b"): string {
  return `${matchId}:${slot}`;
}

/** Mapeia cada slot alimentado por outro jogo para a sua origem. */
export function origemDosSlots(
  matches: ReadonlyArray<Match>,
): Map<string, OrigemSlot> {
  const mapa = new Map<string, OrigemSlot>();
  for (const m of matches) {
    if (m.avancaVencedorPara) {
      mapa.set(chaveSlot(m.avancaVencedorPara.matchId, m.avancaVencedorPara.slot), {
        tipo: "vencedor",
        jogo: m,
      });
    }
    if (m.encaminhaPerdedorPara) {
      mapa.set(chaveSlot(m.encaminhaPerdedorPara.matchId, m.encaminhaPerdedorPara.slot), {
        tipo: "perdedor",
        jogo: m,
      });
    }
  }
  return mapa;
}

const NOME_SIDE: Record<Match["side"], string> = {
  upper: "chave de vencedores",
  lower: "chave de perdedores",
  "grande-final": "grande final",
  grupo: "grupo",
};

/**
 * Texto da origem. Jogo já numerado: "Vencedor do jogo 4". Ainda sem número
 * (confronto futuro): descreve pela posição, ex. "Perdedor da chave superior,
 * rodada 2, jogo 1".
 */
export function rotuloOrigem(origem: OrigemSlot): string {
  const papel = origem.tipo === "vencedor" ? "Vencedor" : "Perdedor";
  const j = origem.jogo;
  if (j.ordemDisputa !== null) return `${papel} do jogo ${j.ordemDisputa}`;
  // Jogo do lado "grande final" que alimenta outro é uma semifinal.
  if (j.side === "grande-final") return `${papel} da semifinal ${j.ordem + 1}`;
  return `${papel} da ${NOME_SIDE[j.side]}, rodada ${j.rodada}, jogo ${j.ordem + 1}`;
}

/**
 * Origem EFETIVA de uma vaga: se a origem é o VENCEDOR de um jogo de BYE (não
 * disputado, oculto e sem número), quem chega é a dupla do outro slot desse jogo.
 * Segue essa cadeia até um jogo de verdade. Devolve `null` se o jogo de BYE não
 * tiver de onde receber dupla (ambos os slots BYE).
 */
export function origemEfetiva(
  origem: OrigemSlot,
  origens: Map<string, OrigemSlot>,
): OrigemSlot | null {
  let atual = origem;
  for (let i = 0; i < 64; i++) {
    const j = atual.jogo;
    const temBye = j.a.bye === true || j.b.bye === true;
    if (atual.tipo !== "vencedor" || !temBye) return atual;
    const lado: "a" | "b" | null =
      j.a.bye !== true ? "a" : j.b.bye !== true ? "b" : null;
    if (lado === null) return null;
    const proxima = origens.get(chaveSlot(j.id, lado));
    if (!proxima) return atual;
    atual = proxima;
  }
  return atual;
}
