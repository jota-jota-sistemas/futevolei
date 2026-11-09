// src/domain/bracket/config.ts
//
// Validação pura dos parâmetros de configuração do chaveamento (formato e
// parâmetros da fase de grupos). Sem I/O, sem relógio, sem aleatoriedade.
//
// Cobre:
//   - R2.1/R2.2  formato exatamente "fase de grupos" | "dupla eliminação"
//   - R2.5/R2.6  número de grupos: inteiro, 1..⌊N/2⌋
//   - R2.3/R2.4  classificados por grupo: inteiro, 1..(menor grupo − 1)
//   - R2.7       exigir formato antes de gerar o chaveamento

import type { Format } from "./types";
import type { Result } from "../result";

/** Valores de formato aceitos (R2.1). */
const FORMATOS_VALIDOS: ReadonlyArray<Format> = [
  "fase de grupos",
  "dupla eliminação",
  "eliminação simples",
];

/** Verdadeiro sse `x` é um inteiro finito. */
function ehInteiro(x: unknown): x is number {
  return typeof x === "number" && Number.isInteger(x);
}

/**
 * Tamanho do menor grupo ao distribuir N duplas em G grupos em serpentina.
 *
 * A serpentina produz grupos cujos tamanhos diferem em no máximo 1; os
 * primeiros `N mod G` grupos recebem ⌈N/G⌉ duplas e os demais ⌊N/G⌋. Logo o
 * menor grupo tem exatamente ⌊N/G⌋ duplas (quando N é divisível por G, todos
 * têm N/G). Exposta para reuso por outras unidades de domínio.
 */
export function tamanhoMenorGrupo(n: number, g: number): number {
  return Math.floor(n / g);
}

/**
 * Valida o valor de formato (R2.1, R2.2).
 *
 * ACEITA se, e somente se, `formato` é exatamente "fase de grupos",
 * "dupla eliminação" ou "eliminação simples"; caso contrário rejeita com
 * `FORMATO_INVALIDO`.
 */
export function validarFormato(formato: unknown): Result<Format> {
  if (typeof formato === "string" && (FORMATOS_VALIDOS as string[]).includes(formato)) {
    return { ok: true, valor: formato as Format };
  }
  return { ok: false, erro: { code: "FORMATO_INVALIDO" } };
}

/**
 * Valida o número de grupos para a fase de grupos (R2.5, R2.6).
 *
 * ACEITA se, e somente se, `numeroDeGrupos` é inteiro e 1 ≤ g ≤ ⌊N/2⌋, onde
 * `n` é o número de duplas inscritas na categoria; caso contrário rejeita com
 * `GRUPOS_INVALIDO`.
 */
export function validarNumeroDeGrupos(numeroDeGrupos: unknown, n: number): Result<number> {
  const maximo = Math.floor(n / 2);
  if (ehInteiro(numeroDeGrupos) && numeroDeGrupos >= 1 && numeroDeGrupos <= maximo) {
    return { ok: true, valor: numeroDeGrupos };
  }
  return { ok: false, erro: { code: "GRUPOS_INVALIDO" } };
}

/**
 * Valida o número de classificados por grupo para a fase de grupos (R2.3, R2.4).
 *
 * ACEITA se, e somente se, `classificadosPorGrupo` é inteiro e
 * 1 ≤ c < (tamanho do menor grupo). O menor grupo depende da distribuição em
 * serpentina de N duplas em G grupos: menor grupo = ⌊N/G⌋. Caso contrário
 * rejeita com `CLASSIFICADOS_INVALIDO`.
 *
 * Requer um número de grupos válido (1 ≤ g ≤ ⌊N/2⌋). Fora desse intervalo o
 * menor grupo não é bem-definido e o valor é rejeitado.
 */
export function validarClassificadosPorGrupo(
  classificadosPorGrupo: unknown,
  n: number,
  numeroDeGrupos: number,
): Result<number> {
  if (!validarNumeroDeGrupos(numeroDeGrupos, n).ok) {
    return { ok: false, erro: { code: "CLASSIFICADOS_INVALIDO" } };
  }

  const menorGrupo = tamanhoMenorGrupo(n, numeroDeGrupos);
  if (
    ehInteiro(classificadosPorGrupo) &&
    classificadosPorGrupo >= 1 &&
    classificadosPorGrupo < menorGrupo
  ) {
    return { ok: true, valor: classificadosPorGrupo };
  }
  return { ok: false, erro: { code: "CLASSIFICADOS_INVALIDO" } };
}

/**
 * Exige que um formato tenha sido selecionado antes de gerar o chaveamento
 * (R2.7). Rejeita com `FORMATO_AUSENTE` quando ausente, e com `FORMATO_INVALIDO`
 * quando presente mas inválido.
 */
export function exigirFormato(formato: unknown): Result<Format> {
  if (formato === undefined || formato === null || formato === "") {
    return { ok: false, erro: { code: "FORMATO_AUSENTE" } };
  }
  return validarFormato(formato);
}
