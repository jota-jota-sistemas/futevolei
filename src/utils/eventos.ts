import type { Campeonato } from "../types";

/**
 * Meses abreviados em pt-BR (três letras maiúsculas), indexados por mês-1.
 * Ex.: MESES_CURTOS[0] === "JAN".
 */
export const MESES_CURTOS = [
  "JAN", "FEV", "MAR", "ABR", "MAI", "JUN",
  "JUL", "AGO", "SET", "OUT", "NOV", "DEZ",
] as const;

/**
 * Badge de data: dia + mês abreviado (ex.: "13 NOV"), independente de fuso.
 *
 * Recebe uma string ISO (YYYY-MM-DD) e retorna `{ dia, mes }` onde `dia` tem
 * exatamente dois dígitos e `mes` é a abreviação em três letras maiúsculas
 * (JAN..DEZ). Retorna `null` quando ano, mês ou dia forem falsy (vazio,
 * malformado ou com componentes zero/não numéricos), permitindo que o card
 * omita o badge sem interromper a renderização.
 */
export function badge(iso: string): { dia: string; mes: string } | null {
  const [ano, mes, dia] = iso.split("-").map(Number);
  if (!ano || !mes || !dia) return null;
  return { dia: String(dia).padStart(2, "0"), mes: MESES_CURTOS[mes - 1] };
}

/**
 * Comparador de ordenação de campeonatos por data (ascendente), com desempate
 * por id, produzindo uma ordem determinística. Use com `Array.prototype.sort`.
 *
 * Ex.: [...campeonatos].sort(compararPorDataId)
 */
export function compararPorDataId(a: Campeonato, b: Campeonato): number {
  return a.data.localeCompare(b.data) || a.id.localeCompare(b.id);
}

/**
 * Ordena uma lista de campeonatos por (data, id) de forma determinística,
 * sem mutar a entrada. Retorna uma nova lista não-decrescente pela chave
 * composta (data, id).
 */
export function ordenarPorDataId(campeonatos: Campeonato[]): Campeonato[] {
  return [...campeonatos].sort(compararPorDataId);
}
