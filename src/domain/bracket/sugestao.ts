// src/domain/bracket/sugestao.ts
//
// Sugestão de formato para N duplas. É só uma SUGESTÃO ("Usar sugestão" preenche
// os campos; nunca força) e é sempre conferida pelos validadores do domínio
// (`validarNumeroDeGrupos`, `validarClassificadosPorGrupo`): o que sai daqui é
// aceito por eles. Funções puras.
//
// Regra (heurística documentada):
//   - menos de 2 duplas: não há o que sugerir;
//   - até 6 duplas: dupla eliminação (todas ganham uma segunda chance);
//   - 7 ou mais: fase de grupos com grupos de 3 a 5 duplas e 2 classificados por
//     grupo. Entre as opções, prefere as que dão um mata-mata de tamanho
//     potência de 2 (grupos × 2 = 4, 8, 16…), depois grupos de 4 duplas e, por
//     último, menos grupos;
//   - se nada servir (não ocorre com o limite de 128 duplas), cai em dupla
//     eliminação.
// "Eliminação simples" não é sugerida de propósito: hoje o banco só aceita
// "fase de grupos" e "dupla eliminação" para a categoria.

import type { Format } from "./types";
import { validarClassificadosPorGrupo, validarNumeroDeGrupos } from "./config";

export interface SugestaoFormato {
  formato: Format;
  numeroDeGrupos?: number;
  classificadosPorGrupo?: number;
  /** Texto curto para mostrar ao lado do botão "Usar sugestão". */
  motivo: string;
}

const CLASSIFICADOS = 2;
const MENOR_GRUPO = 3;
const MAIOR_GRUPO = 5;

const ehPotenciaDeDois = (n: number): boolean => n > 0 && (n & (n - 1)) === 0;

function plural(n: number, singular: string, pluralTxt: string): string {
  return `${n} ${n === 1 ? singular : pluralTxt}`;
}

export function sugerirFormato(nDuplas: number): SugestaoFormato | null {
  if (!Number.isInteger(nDuplas) || nDuplas < 2) return null;

  const eliminacao: SugestaoFormato = {
    formato: "dupla eliminação",
    motivo: `${plural(nDuplas, "dupla", "duplas")}: dupla eliminação dá a todas uma segunda chance.`,
  };
  if (nDuplas <= 6) return eliminacao;

  // Candidatos válidos, cada um com a pontuação [não é potência de 2, distância de
  // grupos de 4, nº de grupos] (menor é melhor, comparada em ordem).
  const candidatos: { g: number; pontos: [number, number, number] }[] = [];
  for (let g = 2; g <= Math.floor(nDuplas / 2); g++) {
    const menor = Math.floor(nDuplas / g);
    const maior = Math.ceil(nDuplas / g);
    if (menor < MENOR_GRUPO || maior > MAIOR_GRUPO) continue;
    // Só vale se o domínio aceitar (sempre aceita aqui, mas a conferência é a regra).
    if (!validarNumeroDeGrupos(g, nDuplas).ok) continue;
    if (!validarClassificadosPorGrupo(CLASSIFICADOS, nDuplas, g).ok) continue;
    candidatos.push({
      g,
      pontos: [ehPotenciaDeDois(g * CLASSIFICADOS) ? 0 : 1, Math.abs(maior - 4), g],
    });
  }
  candidatos.sort((a, b) => a.pontos[0] - b.pontos[0] || a.pontos[1] - b.pontos[1] || a.pontos[2] - b.pontos[2]);
  const melhor = candidatos[0];
  if (!melhor) return eliminacao;

  const g = melhor.g;
  const tamanho =
    Math.floor(nDuplas / g) === Math.ceil(nDuplas / g)
      ? `${Math.floor(nDuplas / g)}`
      : `${Math.floor(nDuplas / g)} a ${Math.ceil(nDuplas / g)}`;
  return {
    formato: "fase de grupos",
    numeroDeGrupos: g,
    classificadosPorGrupo: CLASSIFICADOS,
    motivo: `${plural(nDuplas, "dupla", "duplas")}: fase de grupos com ${plural(g, "grupo", "grupos")} de ${tamanho} e ${CLASSIFICADOS} classificados por grupo.`,
  };
}
