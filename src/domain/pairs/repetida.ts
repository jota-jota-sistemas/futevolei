// src/domain/pairs/repetida.ts
//
// "Essa dupla já está inscrita?": mesma dupla = mesmos dois atletas, em qualquer
// ordem (Ana & Bia = Bia & Ana), sem diferenciar caixa, acento nem espaços.
// Funções puras. Não é erro: a tela avisa e deixa a pessoa decidir (dois
// atletas homônimos podem existir), por isso devolve a dupla encontrada.

import { chaveTexto } from "../../utils/texto";

export interface AtletasDupla {
  atletaA: string;
  atletaB: string;
}

/** Chave que identifica a dupla independentemente da ordem dos atletas. */
export function chaveDaDupla(atletaA: string, atletaB: string): string {
  return [chaveTexto(atletaA), chaveTexto(atletaB)].sort().join("\u0000");
}

/** A primeira dupla de `duplas` com os mesmos atletas (em qualquer ordem), ou null. */
export function acharDuplaRepetida<T extends AtletasDupla>(
  duplas: readonly T[],
  atletaA: string,
  atletaB: string
): T | null {
  const a = chaveTexto(atletaA);
  const b = chaveTexto(atletaB);
  if (a === "" || b === "") return null;
  const chave = chaveDaDupla(atletaA, atletaB);
  return duplas.find((d) => chaveDaDupla(d.atletaA, d.atletaB) === chave) ?? null;
}
