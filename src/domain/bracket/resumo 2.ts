// src/domain/bracket/resumo.ts
//
// Resumo de uma linha mostrado antes de "Gerar chaveamento", para conferir o que
// vai ser gerado sem rolar a página. Função pura.

import type { BracketConfig } from "./types";

export interface EntradaResumo {
  nDuplas: number;
  /** Formato já válido, ou null se ainda falta escolher/corrigir. */
  config: BracketConfig | null;
  /** O organizador definiu o nivelador? (senão, as duplas são sorteadas) */
  niveladorDefinido: boolean;
}

const plural = (n: number, s: string, p: string): string => `${n} ${n === 1 ? s : p}`;

/** "8 duplas · Fase de grupos (2 grupos, 2 classificam) · Nivelador: sua ordem". */
export function resumirGeracao({ nDuplas, config, niveladorDefinido }: EntradaResumo): string {
  const partes = [plural(nDuplas, "dupla", "duplas")];
  if (!config) {
    partes.push("Formato: falta escolher");
  } else if (config.formato === "fase de grupos") {
    const g = config.numeroDeGrupos;
    const c = config.classificadosPorGrupo;
    partes.push(
      g && c
        ? `Fase de grupos (${plural(g, "grupo", "grupos")}, ${c} ${c === 1 ? "classifica" : "classificam"})`
        : "Fase de grupos"
    );
  } else {
    partes.push(config.formato === "dupla eliminação" ? "Dupla eliminação" : "Eliminação simples");
  }
  partes.push(niveladorDefinido ? "Nivelador: sua ordem" : "Nivelador: sorteio");
  return partes.join(" · ");
}
