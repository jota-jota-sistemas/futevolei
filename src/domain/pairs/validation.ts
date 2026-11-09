// src/domain/pairs/validation.ts
//
// Validação de duplas (pairs) — funções puras, sem I/O.
// Conforme a seção "Error Handling" e as Correctness Properties 1–4 do design.md.
//
// Regras cobertas:
//   - R1.2: nome da dupla com 1..80 caracteres após trim      -> NOME_DUPLA_INVALIDO
//   - R1.3: nomes dos atletas A e B com 1..80 após trim        -> NOME_ATLETA_INVALIDO { qual }
//   - R1.4: nome duplicado por categoria, insensível a caixa
//           e a espaços nas extremidades                        -> NOME_DUPLICADO
//   - R1.7/R1.8: listagem determinística por (nome em caixa
//           baixa, criadoEm), sem mutar a entrada; vazio -> vazio

import type { Pair, DomainError } from "../bracket/types";
import type { Result } from "../result";

const MIN_LEN = 1;
const MAX_LEN = 80;

/** Verdadeiro sse o comprimento do texto após trim está em [1, 80]. */
function comprimentoValido(texto: string): boolean {
  const n = texto.trim().length;
  return n >= MIN_LEN && n <= MAX_LEN;
}

/**
 * Chave de comparação de nomes de dupla para unicidade por categoria (R1.4):
 * ignora espaços nas extremidades e diferença de maiúsculas/minúsculas.
 */
export function chaveNomeDupla(nomeDupla: string): string {
  return nomeDupla.trim().toLowerCase();
}

/**
 * Valida o nome da dupla (R1.2 / Property 1).
 * Aceita sse, após trim, o comprimento está entre 1 e 80.
 */
export function validarNomeDupla(nomeDupla: string): Result<string> {
  if (!comprimentoValido(nomeDupla)) {
    return { ok: false, erro: { code: "NOME_DUPLA_INVALIDO" } };
  }
  return { ok: true, valor: nomeDupla };
}

/**
 * Valida os nomes dos atletas A e B (R1.3 / Property 2).
 * Aceita sse ambos têm comprimento entre 1 e 80 após trim. Se exatamente um
 * é inválido, aponta o atleta correto; se ambos são inválidos, aponta A primeiro.
 */
export function validarNomesAtletas(
  atletaA: string,
  atletaB: string
): Result<{ atletaA: string; atletaB: string }> {
  if (!comprimentoValido(atletaA)) {
    return { ok: false, erro: { code: "NOME_ATLETA_INVALIDO", qual: "A" } };
  }
  if (!comprimentoValido(atletaB)) {
    return { ok: false, erro: { code: "NOME_ATLETA_INVALIDO", qual: "B" } };
  }
  return { ok: true, valor: { atletaA, atletaB } };
}

/**
 * Detecta nome duplicado dentro de uma categoria (R1.4 / Property 3).
 * A comparação é insensível a espaços nas extremidades e à caixa das letras.
 *
 * @param nomeDupla       nome candidato a ser adicionado
 * @param existentes      nomes de dupla já registrados na mesma categoria
 * @returns ok(nomeDupla) se não há duplicata; senão NOME_DUPLICADO
 */
export function validarNomeNaoDuplicado(
  nomeDupla: string,
  existentes: readonly string[]
): Result<string> {
  const chave = chaveNomeDupla(nomeDupla);
  const existe = existentes.some((nome) => chaveNomeDupla(nome) === chave);
  if (existe) {
    return { ok: false, erro: { code: "NOME_DUPLICADO" } };
  }
  return { ok: true, valor: nomeDupla };
}

/**
 * Validação completa de uma dupla candidata (R1.2–R1.4), na ordem:
 * nome da dupla, nomes dos atletas e, por fim, unicidade do nome na categoria.
 * Retorna o primeiro erro encontrado; não muta nenhuma entrada.
 */
export function validarDuplaCandidata(
  candidata: { nomeDupla: string; atletaA: string; atletaB: string },
  nomesExistentes: readonly string[]
): Result<{ nomeDupla: string; atletaA: string; atletaB: string }> {
  const nome = validarNomeDupla(candidata.nomeDupla);
  if (!nome.ok) return nome;

  const atletas = validarNomesAtletas(candidata.atletaA, candidata.atletaB);
  if (!atletas.ok) return atletas;

  const unico = validarNomeNaoDuplicado(candidata.nomeDupla, nomesExistentes);
  if (!unico.ok) return unico;

  return {
    ok: true,
    valor: {
      nomeDupla: candidata.nomeDupla,
      atletaA: candidata.atletaA,
      atletaB: candidata.atletaB,
    },
  };
}

/**
 * Compara duas duplas pela chave composta (nome em caixa baixa, criadoEm).
 * Determinística e total: valores iguais em ambas as chaves retornam 0.
 */
export function compararDuplas(a: Pair, b: Pair): number {
  const nomeA = chaveNomeDupla(a.nomeDupla);
  const nomeB = chaveNomeDupla(b.nomeDupla);
  if (nomeA < nomeB) return -1;
  if (nomeA > nomeB) return 1;
  if (a.criadoEm < b.criadoEm) return -1;
  if (a.criadoEm > b.criadoEm) return 1;
  return 0;
}

/**
 * Lista as duplas em ordenação determinística por (nome em caixa baixa,
 * criadoEm) (R1.7 / Property 4). Não muta a entrada; lista vazia -> lista vazia.
 */
export function listarDuplasOrdenadas(duplas: readonly Pair[]): Pair[] {
  return [...duplas].sort(compararDuplas);
}

// Re-exporta o tipo para conveniência de quem consome este módulo.
export type { DomainError };
