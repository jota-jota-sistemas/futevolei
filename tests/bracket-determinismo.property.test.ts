// Feature: criar-chaveamento-campeonato, Property 13: Geração é determinística
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { gerarChaveamento, type GeneratorInput } from "../src/domain/bracket/generator";
import type { BracketConfig, Pair } from "../src/domain/bracket/types";

/**
 * Property 13: Geração é determinística.
 *
 * Validates: Requirements 4.2
 *
 * Para toda entrada válida do gerador (mesmas duplas, formato, parâmetros e
 * seeding):
 *   (a) gerar o chaveamento duas vezes com a MESMA entrada produz estruturas
 *       deep-equal (toEqual); e
 *   (b) permutar a ordem da lista de duplas (mantendo os mesmos seeds em cada
 *       dupla) não altera a estrutura gerada — o gerador reordena por seed
 *       internamente, logo o resultado é idêntico (toEqual).
 *
 * As entradas são geradas válidas por construção com `fc.chain` (evitando
 * `fc.pre`, que exauriria a precondição): N duplas com seeds 1..N consecutivos,
 * para ambos os formatos:
 *   - "dupla eliminação": M em 2..32.
 *   - "fase de grupos": N em 4..32, numeroDeGrupos g em 1..floor(N/2),
 *     classificadosPorGrupo em 1..floor(N/g)-1.
 */

/**
 * Constrói N duplas com seeds 1..N consecutivos. Os ids/nomes/atletas são
 * determinísticos a partir do seed para que a comparação `toEqual` entre duas
 * gerações (ou entre permutações) seja bem-definida.
 */
function construirDuplas(n: number): Pair[] {
  return Array.from({ length: n }, (_, i) => {
    const seed = i + 1;
    return {
      id: `dupla-${seed}`,
      nomeDupla: `Dupla ${String(seed).padStart(3, "0")}`,
      atletaA: `Atleta A${seed}`,
      atletaB: `Atleta B${seed}`,
      seed,
      // criadoEm determinístico, estável por seed.
      criadoEm: `2026-01-01T00:00:${String(seed % 60).padStart(2, "0")}.000Z`,
    } satisfies Pair;
  });
}

/** Embaralhamento determinístico de uma lista a partir de uma permutação. */
function permutar<T>(lista: ReadonlyArray<T>, perm: number[]): T[] {
  return perm.map((idx) => lista[idx]);
}

/** Entrada completa do gerador, válida por construção. */
interface EntradaValida {
  duplas: Pair[];
  config: BracketConfig;
  /** Permutação (índices) da lista de duplas para o teste (b). */
  permutacao: number[];
}

/** Arbitrário de permutação dos índices 0..n-1. */
function arbPermutacao(n: number): fc.Arbitrary<number[]> {
  return fc.constant(Array.from({ length: n }, (_, i) => i)).chain((base) =>
    fc.shuffledSubarray(base, { minLength: n, maxLength: n })
  );
}

/** Entradas válidas para "dupla eliminação": M em 2..32. */
const arbDuplaEliminacao: fc.Arbitrary<EntradaValida> = fc
  .integer({ min: 2, max: 32 })
  .chain((m) =>
    arbPermutacao(m).map((permutacao) => ({
      duplas: construirDuplas(m),
      config: { formato: "dupla eliminação" } as BracketConfig,
      permutacao,
    }))
  );

/**
 * Entradas válidas para "fase de grupos" por construção:
 *   - N em 4..32
 *   - g (numeroDeGrupos) em 1..floor(N/2)
 *   - c (classificadosPorGrupo) em 1..floor(N/g)-1
 *     (floor(N/g) é o tamanho do menor grupo na serpentina; c deve ser < ele).
 */
const arbFaseDeGrupos: fc.Arbitrary<EntradaValida> = fc
  .integer({ min: 4, max: 32 })
  .chain((n) =>
    fc.integer({ min: 1, max: Math.floor(n / 2) }).chain((g) => {
      const menorGrupo = Math.floor(n / g);
      return fc
        .integer({ min: 1, max: Math.max(1, menorGrupo - 1) })
        .chain((c) =>
          arbPermutacao(n).map((permutacao) => ({
            duplas: construirDuplas(n),
            config: {
              formato: "fase de grupos",
              numeroDeGrupos: g,
              classificadosPorGrupo: c,
            } as BracketConfig,
            permutacao,
          }))
        );
    })
  );

const arbEntrada: fc.Arbitrary<EntradaValida> = fc.oneof(
  arbDuplaEliminacao,
  arbFaseDeGrupos
);

describe("Feature: criar-chaveamento-campeonato, Property 13: Geração é determinística", () => {
  it("(a) gerar duas vezes com a mesma entrada produz estruturas idênticas", () => {
    fc.assert(
      fc.property(arbEntrada, ({ duplas, config }) => {
        const input: GeneratorInput = { duplas, config };

        const primeira = gerarChaveamento(input);
        const segunda = gerarChaveamento(input);

        expect(primeira.ok).toBe(true);
        expect(segunda.ok).toBe(true);
        if (primeira.ok && segunda.ok) {
          expect(segunda.bracket).toEqual(primeira.bracket);
        }
      }),
      { numRuns: 200 }
    );
  });

  it("(b) permutar a ordem da lista de duplas (mesmos seeds) não altera a estrutura gerada", () => {
    fc.assert(
      fc.property(arbEntrada, ({ duplas, config, permutacao }) => {
        const baseline = gerarChaveamento({ duplas, config });

        const duplasPermutadas = permutar(duplas, permutacao);
        const permutado = gerarChaveamento({ duplas: duplasPermutadas, config });

        expect(baseline.ok).toBe(true);
        expect(permutado.ok).toBe(true);
        if (baseline.ok && permutado.ok) {
          expect(permutado.bracket).toEqual(baseline.bracket);
        }
      }),
      { numRuns: 200 }
    );
  });
});
