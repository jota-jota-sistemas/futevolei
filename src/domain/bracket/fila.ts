// src/domain/bracket/fila.ts
//
// "Próximos jogos": a fila do que ainda falta disputar, para o organizador lançar
// o placar sem procurar o jogo no chaveamento. Funções puras.

import type { Bracket, Match, Pair } from "./types";

/** Jogo que já pode receber placar: as duas duplas definidas, sem bye e sem vencedor. */
export function jogoPendente(m: Match): boolean {
  return (
    m.a.pairId !== null &&
    m.b.pairId !== null &&
    !m.a.bye &&
    !m.b.bye &&
    m.vencedorId === null
  );
}

/** Jogo com placar parcial lançado (ao vivo), ainda sem vencedor. */
export function jogoAoVivo(m: Match): boolean {
  return jogoPendente(m) && (m.placarA !== null || m.placarB !== null);
}

/**
 * Jogos prontos para disputar: primeiro os que estão ao vivo, depois na ordem de
 * disputa (número do jogo). Sem número, vão para o fim, na ordem do chaveamento.
 */
export function proximosJogos(bracket: Pick<Bracket, "matches"> | null): Match[] {
  if (!bracket) return [];
  const indice = new Map(bracket.matches.map((m, i) => [m.id, i]));
  return bracket.matches
    .filter(jogoPendente)
    .sort((x, y) => {
      const vx = jogoAoVivo(x) ? 0 : 1;
      const vy = jogoAoVivo(y) ? 0 : 1;
      if (vx !== vy) return vx - vy;
      const ox = x.ordemDisputa ?? Number.POSITIVE_INFINITY;
      const oy = y.ordemDisputa ?? Number.POSITIVE_INFINITY;
      if (ox !== oy) return ox < oy ? -1 : 1;
      return (indice.get(x.id) ?? 0) - (indice.get(y.id) ?? 0);
    });
}

/** "Jogo 4" (ou "Jogo sem número" enquanto não foi numerado). */
export function rotuloDoJogo(m: Pick<Match, "ordemDisputa">): string {
  return m.ordemDisputa !== null ? `Jogo ${m.ordemDisputa}` : "Jogo";
}

/** As duplas de um jogo, na ordem a × b (vazio se alguma não existe no snapshot). */
export function duplasDoJogo(
  bracket: Pick<Bracket, "duplas">,
  m: Match
): [Pair, Pair] | null {
  const a = bracket.duplas.find((d) => d.id === m.a.pairId);
  const b = bracket.duplas.find((d) => d.id === m.b.pairId);
  return a && b ? [a, b] : null;
}
