// src/domain/bracket/diff.ts
//
// Diferença entre duas versões de um chaveamento: quais jogos mudaram.
// Usada para gravar só o que mudou (ex.: um placar + a cascata dele) em vez de
// reescrever o chaveamento inteiro. Função PURA.

import type { Bracket, Match } from "./types";

/** Jogos de `depois` que são novos ou diferentes do mesmo id em `antes`. */
export function jogosAlterados(antes: Bracket, depois: Bracket): Match[] {
  const anteriores = new Map<string, string>();
  for (const m of antes.matches) anteriores.set(m.id, JSON.stringify(m));
  return depois.matches.filter((m) => anteriores.get(m.id) !== JSON.stringify(m));
}
