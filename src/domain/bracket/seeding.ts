// src/domain/bracket/seeding.ts
//
// Validação de seeding e geração do seeding padrão de uma categoria.
// Funções puras e determinísticas: sem I/O, sem relógio, sem aleatoriedade e
// sem mutação das entradas.
//
// R3.1: posições inteiras no intervalo 1..N formando uma sequência consecutiva
//       iniciando em 1, sem repetições e sem lacunas.
// R3.2: posição repetida → SEED_DUPLICADO (com a posição duplicada).
// R3.3: posição fora de 1..N → SEED_FORA_INTERVALO; lacuna na sequência → SEED_LACUNA.
// R3.4: sem seeding atribuído → ordem alfabética (ignorando caixa) do nome da dupla,
//       desempatando pela ordem de inscrição (criadoEm).
// R3.6: seeding inválido é rejeitado antes de qualquer distribuição.

import type { Pair, PairId } from "./types";
import type { Result } from "../result";

/**
 * Atribuição de uma posição de cabeça de chave a uma dupla.
 * `posicao` é a posição numérica pretendida (idealmente 1..N).
 */
export interface SeedAssignment {
  pairId: PairId;
  posicao: number;
}

/**
 * Valida um conjunto de atribuições de seeding para N duplas.
 *
 * Aceita se, e somente se, o multiset de `posicao` é exatamente {1,…,N}:
 * - N atribuições (uma por dupla),
 * - todas inteiras no intervalo 1..N,
 * - sem repetição e sem lacuna.
 *
 * Ordem de verificação dos erros (determinística):
 * 1. repetição → SEED_DUPLICADO (menor posição que se repete);
 * 2. valor fora de 1..N → SEED_FORA_INTERVALO (menor posição fora do intervalo);
 * 3. lacuna → SEED_LACUNA (menor posição ausente de 1..N).
 *
 * Não muta a entrada. Em caso de sucesso devolve as atribuições em ordem
 * crescente de `posicao`.
 */
export function validarSeeding(
  seeds: ReadonlyArray<SeedAssignment>,
  n: number,
): Result<SeedAssignment[]> {
  const posicoes = seeds.map((s) => s.posicao);

  // 1) Repetição: aponta a menor posição que aparece mais de uma vez.
  const vistas = new Set<number>();
  const repetidas: number[] = [];
  for (const p of posicoes) {
    if (vistas.has(p)) {
      repetidas.push(p);
    } else {
      vistas.add(p);
    }
  }
  if (repetidas.length > 0) {
    const posicao = Math.min(...repetidas);
    return { ok: false, erro: { code: "SEED_DUPLICADO", posicao } };
  }

  // 2) Fora do intervalo: posição não inteira ou fora de 1..N.
  const foraIntervalo = posicoes
    .filter((p) => !Number.isInteger(p) || p < 1 || p > n)
    .sort((a, b) => a - b);
  if (foraIntervalo.length > 0) {
    return {
      ok: false,
      erro: { code: "SEED_FORA_INTERVALO", posicao: foraIntervalo[0] },
    };
  }

  // 3) Lacuna: toda posição de 1..N precisa estar presente exatamente uma vez.
  // Como não há repetição nem valor fora do intervalo, qualquer ausência em
  // 1..N é uma lacuna. Isso também cobre o caso de quantidade incorreta de
  // atribuições (faltando ou sobrando duplas em relação a N).
  for (let posicao = 1; posicao <= n; posicao++) {
    if (!vistas.has(posicao)) {
      return { ok: false, erro: { code: "SEED_LACUNA", posicao } };
    }
  }

  const ordenadas = [...seeds].sort((a, b) => a.posicao - b.posicao);
  return { ok: true, valor: ordenadas };
}

/**
 * Compara duas duplas pelo seeding padrão (R3.4):
 * 1. nome da dupla em ordem alfabética, ignorando diferenças de caixa;
 * 2. desempate pela ordem de inscrição (criadoEm crescente);
 * 3. desempate final estável pelo id (garante determinismo total).
 */
export function compararSeedingPadrao(a: Pair, b: Pair): number {
  const nomeA = a.nomeDupla.trim().toLowerCase();
  const nomeB = b.nomeDupla.trim().toLowerCase();
  const porNome = nomeA.localeCompare(nomeB);
  if (porNome !== 0) return porNome;

  const porCriacao = a.criadoEm.localeCompare(b.criadoEm);
  if (porCriacao !== 0) return porCriacao;

  return a.id.localeCompare(b.id);
}

/**
 * Gera o seeding padrão de uma lista de duplas (R3.4): atribui posições
 * 1..N em ordem alfabética do nome da dupla (ignorando caixa), desempatando
 * pela ordem de inscrição (criadoEm).
 *
 * Função pura e determinística: não muta a entrada e produz a mesma saída para
 * qualquer permutação da mesma lista de duplas.
 */
export function seedingPadrao(
  duplas: ReadonlyArray<Pair>,
): SeedAssignment[] {
  return [...duplas]
    .sort(compararSeedingPadrao)
    .map((dupla, indice) => ({ pairId: dupla.id, posicao: indice + 1 }));
}
