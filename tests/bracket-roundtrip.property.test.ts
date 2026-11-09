// Feature: criar-chaveamento-campeonato, Property 29: Round-trip de serialização preserva o chaveamento
//
// Property 29: Round-trip de serialização preserva o chaveamento — Para todo
// chaveamento válido (qualquer formato e qualquer estado de progresso),
// desserializar(serializar(b)) é equivalente ao original, preservando
// identidade, ordem e vínculos entre grupos, upper, lower, grande final,
// jogos, participantes e resultados.
//
// Validates: Requirements 7.5

import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { serializar, desserializar } from "../src/domain/bracket/serializer";
import { gerarChaveamento } from "../src/domain/bracket/generator";
import { registrarVencedor } from "../src/domain/bracket/progression";
import type { Bracket, BracketConfig, Pair } from "../src/domain/bracket/types";

// `agora` fixo para manter a progressão determinística (R6.1 injeta o relógio).
const AGORA = "2026-01-01T00:00:00.000Z";

/**
 * Constrói N duplas com seeds consecutivos 1..N. O `criadoEm` é derivado do
 * índice para manter tudo determinístico e serializável.
 */
function construirDuplas(n: number): Pair[] {
  return Array.from({ length: n }, (_, i): Pair => {
    const seed = i + 1;
    return {
      id: `dupla-${seed}`,
      nomeDupla: `Dupla ${seed}`,
      atletaA: `Atleta ${seed}A`,
      atletaB: `Atleta ${seed}B`,
      seed,
      criadoEm: `2025-01-01T00:00:${String(i).padStart(2, "0")}.000Z`,
    };
  });
}

/**
 * Entrada crua, já VÁLIDA por construção, de um chaveamento. Os parâmetros de
 * grupo são gerados por dependência (via `fc.chain`), evitando descartes: para
 * a fase de grupos vale 1 ≤ G ≤ ⌊N/2⌋ e 1 ≤ C < ⌊N/G⌋.
 */
interface EntradaBracket {
  n: number;
  config: BracketConfig;
}

/** Arbitrary de config "dupla eliminação" para N duplas. */
function arbConfigEliminacao(n: number): fc.Arbitrary<EntradaBracket> {
  return fc.constant({ n, config: { formato: "dupla eliminação" } });
}

/**
 * Arbitrary de config "fase de grupos" com parâmetros válidos para N duplas.
 * Escolhe G em 1..⌊N/2⌋ e, em função do menor grupo ⌊N/G⌋, escolhe C em
 * 1..(menorGrupo−1). Só é usado quando existe ao menos um G com menorGrupo ≥ 2.
 */
function arbConfigGrupos(n: number): fc.Arbitrary<EntradaBracket> {
  const maxGrupos = Math.floor(n / 2);
  return fc.integer({ min: 1, max: maxGrupos }).chain((g) => {
    const menorGrupo = Math.floor(n / g);
    // Garante um intervalo válido de classificados (1..menorGrupo−1).
    const maxClass = Math.max(1, menorGrupo - 1);
    return fc.integer({ min: 1, max: maxClass }).map((c) => ({
      n,
      config: {
        formato: "fase de grupos" as const,
        numeroDeGrupos: g,
        classificadosPorGrupo: Math.min(c, menorGrupo - 1),
      },
    }));
  });
}

/**
 * Entrada válida por construção: alterna entre os dois formatos. A fase de
 * grupos só é oferecida quando N ≥ 4 (garante ao menos um G com menor grupo
 * ≥ 2 e, portanto, um C válido); para N < 4 usa dupla eliminação.
 */
const arbEntrada: fc.Arbitrary<EntradaBracket> = fc
  .integer({ min: 2, max: 32 })
  .chain((n) => {
    if (n < 4) {
      return arbConfigEliminacao(n);
    }
    return fc.oneof(arbConfigEliminacao(n), arbConfigGrupos(n));
  });

/** Monta o Bracket a partir da entrada válida; a geração sempre tem sucesso. */
function montarBracket(e: EntradaBracket): Bracket {
  const duplas = construirDuplas(e.n);
  const resultado = gerarChaveamento({ duplas, config: e.config });
  if (!resultado.ok) {
    throw new Error(
      `geração inesperadamente falhou: ${JSON.stringify(e)} -> ${JSON.stringify(resultado.erro)}`,
    );
  }
  return resultado.bracket;
}

/** Arbitrary de chaveamento recém-gerado (sem resultados registrados). */
const arbBracketGerado: fc.Arbitrary<Bracket> = arbEntrada.map(montarBracket);

/**
 * Verdadeiro quando o jogo está pronto para registro manual: ambos os
 * participantes definidos (pairId não-nulo) e nenhum é bye.
 */
function jogoPronto(m: Bracket["matches"][number]): boolean {
  const aOk = m.a.pairId !== null && m.a.bye !== true;
  const bOk = m.b.pairId !== null && m.b.bye !== true;
  return aOk && bOk && m.vencedorId === null;
}

/**
 * Aplica uma sequência determinística de resultados ao bracket gerado. A cada
 * passo escolhe o PRIMEIRO jogo pronto (ordem estável de `matches`) e registra
 * o vencedor de acordo com o próximo booleano de `escolhas` (true = dupla A).
 * Isso leva o chaveamento a diversos estados em progresso — e, nos casos que
 * chegam à grande final, define a campeã (R6.7).
 */
function aplicarResultados(base: Bracket, escolhas: boolean[]): Bracket {
  let atual = base;
  let i = 0;
  for (const escolheA of escolhas) {
    const jogo = atual.matches.find(jogoPronto);
    if (!jogo) break; // nenhum jogo pronto: nada mais a registrar
    const vencedorId = escolheA ? jogo.a.pairId : jogo.b.pairId;
    if (vencedorId === null) break;
    const resultado = registrarVencedor(atual, jogo.id, vencedorId, AGORA);
    if (!resultado.ok) break; // segurança: não deve ocorrer em jogos prontos
    atual = resultado.bracket;
    i++;
  }
  // `i` evita o aviso de variável não usada em ferramentas estritas.
  void i;
  return atual;
}

/**
 * Arbitrary de chaveamento EM PROGRESSO: parte de um bracket gerado e aplica
 * uma lista de escolhas de vencedor. O comprimento cobre desde poucos jogos até
 * o torneio completo (duplа eliminação pode ter até ~2M−2 jogos decisivos).
 */
const arbBracketJogado: fc.Arbitrary<Bracket> = fc
  .tuple(arbBracketGerado, fc.array(fc.boolean(), { minLength: 0, maxLength: 80 }))
  .map(([base, escolhas]) => aplicarResultados(base, escolhas));

describe("Feature: criar-chaveamento-campeonato, Property 29: Round-trip de serialização preserva o chaveamento", () => {
  it("desserializar(serializar(b)) === b para chaveamentos recém-gerados", () => {
    fc.assert(
      fc.property(arbBracketGerado, (b) => {
        expect(desserializar(serializar(b))).toEqual(b);
      }),
      { numRuns: 200 },
    );
  });

  it("desserializar(serializar(b)) === b para chaveamentos em progresso (inclui campeã)", () => {
    fc.assert(
      fc.property(arbBracketJogado, (b) => {
        expect(desserializar(serializar(b))).toEqual(b);
      }),
      { numRuns: 200 },
    );
  });
});
