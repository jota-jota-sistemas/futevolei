import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { Pair } from "../src/domain/bracket/types";
import { seedingAleatorio, validarSeeding } from "../src/domain/bracket/seeding";

function duplas(n: number): Pair[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `d${i + 1}`,
    nomeDupla: `Dupla ${String(i + 1).padStart(2, "0")}`,
    atletaA: `A${i + 1}`,
    atletaB: `B${i + 1}`,
    seed: 0,
    criadoEm: `2025-01-01T00:00:${String(i % 60).padStart(2, "0")}.000Z`,
  }));
}

describe("seedingAleatorio", () => {
  it("é sempre uma permutação válida 1..N (aceita por validarSeeding)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 40 }), fc.integer({ min: 0, max: 1e6 }), (n, semente) => {
        let x = semente + 1;
        const rand = (): number => {
          x = (x * 16807) % 2147483647;
          return x / 2147483647;
        };
        const lista = duplas(n);
        const seeds = seedingAleatorio(lista, rand);
        expect(seeds).toHaveLength(n);
        expect(new Set(seeds.map((s) => s.pairId))).toEqual(new Set(lista.map((d) => d.id)));
        expect(validarSeeding(seeds, n).ok).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("com a mesma fonte de aleatoriedade, a saída é a mesma (independe da ordem de entrada)", () => {
    const lista = duplas(10);
    const fixo = (): number => 0.37;
    const a = seedingAleatorio(lista, fixo);
    const b = seedingAleatorio([...lista].reverse(), fixo);
    expect(b).toEqual(a);
  });

  it("não muta a entrada e muda a ordem conforme o sorteio", () => {
    const lista = duplas(8);
    const antes = JSON.stringify(lista);
    const baixo = seedingAleatorio(lista, () => 0);
    const alto = seedingAleatorio(lista, () => 0.999);
    expect(JSON.stringify(lista)).toBe(antes);
    expect(baixo.map((s) => s.pairId)).not.toEqual(alto.map((s) => s.pairId));
  });
});
