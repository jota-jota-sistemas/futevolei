// src/domain/pairs/lista.ts
//
// Interpreta uma LISTA DE DUPLAS COLADA (texto de WhatsApp): uma dupla por linha.
// Função pura, sem I/O. Nunca lança.
//
// Regras:
//   - linhas vazias são ignoradas;
//   - numeração e marcadores no começo são removidos: "1.", "2)", "3-", "(4)",
//     "-", "–", "•", "*"; negrito/itálico/tachado do WhatsApp (*x*, _x_, ~x~)
//     nas pontas também;
//   - separadores: "&", "/" ou "+" (exatamente dois atletas) ou a palavra "e"
//     entre espaços (só quando não há &, / ou +, e exatamente UM " e ");
//     mais de um " e " é ambíguo ("Ana e Bia e Carla") e vira linha inválida;
//   - cada atleta tem 1..80 caracteres depois de aparar e colapsar espaços;
//   - repetida = mesmos dois atletas (em qualquer ordem) de uma dupla já
//     inscrita ou de uma linha anterior da própria lista: não entra, e avisa;
//   - no máximo LIMITE_LINHAS linhas são lidas (o resto é ignorado e informado).
// NÃO trata colunas de planilha (tabulação).

import { chaveTexto } from "../../utils/texto";
import { chaveDaDupla, type AtletasDupla } from "./repetida";

export const LIMITE_LINHAS = 200;
export const ATLETA_MAX = 80;

export type SituacaoLinha = "valida" | "invalida" | "repetida";

export interface LinhaLista {
  /** Número da linha no texto colado (1 = primeira), contando as vazias. */
  linha: number;
  /** O texto da linha como foi colado. */
  bruto: string;
  atletaA?: string;
  atletaB?: string;
  situacao: SituacaoLinha;
  /** Por que a linha é inválida ou repetida. */
  motivo?: string;
}

export interface ResultadoLista {
  linhas: LinhaLista[];
  /** Só as linhas válidas (as que seriam inscritas), na ordem do texto. */
  validas: AtletasDupla[];
  contagem: { validas: number; invalidas: number; repetidas: number };
  /** Havia mais linhas do que o limite: as demais foram ignoradas. */
  excedeuLimite: boolean;
}

/** Numeração e marcadores do começo da linha: "1.", "2)", "3-", "(4)", "-", "•", "*". */
const MARCADOR_INICIAL = /^\s*(?:\(\s*\d{1,3}\s*\)|\d{1,3}\s*[.)\-–—:º°]|[-–—•·*]+)\s*/;

/** Formatação do WhatsApp nas pontas (*negrito*, _itálico_, ~tachado~). */
function semFormatacao(texto: string): string {
  return texto.replace(/^[*_~\s]+/, "").replace(/[*_~\s]+$/, "");
}

function limpar(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

/** Remove marcador e formatação, repetindo até estabilizar (ex.: "*1.* Ana e Bia"). */
function normalizarLinha(bruta: string): string {
  let atual = bruta.trim();
  for (let i = 0; i < 4; i++) {
    const proximo = semFormatacao(atual.replace(MARCADOR_INICIAL, ""));
    if (proximo === atual) break;
    atual = proximo;
  }
  return limpar(atual);
}

type Separacao = { atletas: [string, string] } | { motivo: string };

function separar(linha: string): Separacao {
  if (/[&/+]/.test(linha)) {
    const partes = linha.split(/[&/+]/).map(limpar);
    if (partes.length !== 2 || partes.some((p) => p === "")) {
      return { motivo: "Use exatamente dois atletas por linha." };
    }
    return { atletas: [partes[0], partes[1]] };
  }
  const partes = linha.split(/\s+e\s+/i).map(limpar);
  if (partes.length === 1) {
    return { motivo: "Não achei o separador. Use &, / ou “e” entre os dois atletas." };
  }
  if (partes.length > 2) {
    return { motivo: "Há mais de um “e”. Use & ou / entre os dois atletas." };
  }
  if (partes.some((p) => p === "")) return { motivo: "Use exatamente dois atletas por linha." };
  return { atletas: [partes[0], partes[1]] };
}

export function interpretarLista(
  texto: string,
  existentes: readonly AtletasDupla[] = []
): ResultadoLista {
  const vistas = new Set(existentes.map((d) => chaveDaDupla(d.atletaA, d.atletaB)));
  const linhas: LinhaLista[] = [];
  let lidas = 0;
  let excedeuLimite = false;

  const brutas = String(texto ?? "").split(/\r\n|\r|\n/);
  for (let i = 0; i < brutas.length; i++) {
    const bruto = brutas[i];
    if (bruto.trim() === "") continue;
    if (lidas >= LIMITE_LINHAS) {
      excedeuLimite = true;
      break;
    }
    lidas++;

    const base: Pick<LinhaLista, "linha" | "bruto"> = { linha: i + 1, bruto };
    const linha = normalizarLinha(bruto);
    if (linha === "") {
      linhas.push({ ...base, situacao: "invalida", motivo: "Linha sem nomes." });
      continue;
    }
    const sep = separar(linha);
    if ("motivo" in sep) {
      linhas.push({ ...base, situacao: "invalida", motivo: sep.motivo });
      continue;
    }
    const [atletaA, atletaB] = sep.atletas;
    if (atletaA.length > ATLETA_MAX || atletaB.length > ATLETA_MAX) {
      linhas.push({ ...base, atletaA, atletaB, situacao: "invalida", motivo: `Nome com mais de ${ATLETA_MAX} caracteres.` });
      continue;
    }
    if (chaveTexto(atletaA) === chaveTexto(atletaB)) {
      linhas.push({ ...base, atletaA, atletaB, situacao: "invalida", motivo: "Os dois atletas têm o mesmo nome." });
      continue;
    }
    const chave = chaveDaDupla(atletaA, atletaB);
    if (vistas.has(chave)) {
      linhas.push({ ...base, atletaA, atletaB, situacao: "repetida", motivo: "Dupla já inscrita ou repetida na lista." });
      continue;
    }
    vistas.add(chave);
    linhas.push({ ...base, atletaA, atletaB, situacao: "valida" });
  }

  const validas = linhas
    .filter((l) => l.situacao === "valida")
    .map((l) => ({ atletaA: l.atletaA as string, atletaB: l.atletaB as string }));
  return {
    linhas,
    validas,
    contagem: {
      validas: validas.length,
      invalidas: linhas.filter((l) => l.situacao === "invalida").length,
      repetidas: linhas.filter((l) => l.situacao === "repetida").length,
    },
    excedeuLimite,
  };
}
