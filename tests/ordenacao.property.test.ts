import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { Campeonato } from "../src/types";
import { ordenarPorDataId, compararPorDataId } from "../src/utils/eventos";

/**
 * Property 2: Ordenação de eventos determinística e por (data, id).
 *
 * Para qualquer lista de campeonatos, a saída de `ordenarPorDataId` deve ser:
 *   (a) uma permutação da entrada (mesmo multiset de ids);
 *   (b) não-decrescente pela chave composta (data, id);
 *   (c) determinística (mesma entrada => mesma ordem, inclusive em empates);
 *   (d) obtida sem mutar a lista de entrada.
 *
 * Validates: Requirements 4.2
 */

/** Pequeno conjunto de datas para forçar empates de data propositalmente. */
const DATAS = ["2026-01-01", "2026-11-13", "2026-11-13", "2026-12-31", "2026-03-05"];

/** Gerador de um campeonato com data de um conjunto pequeno e id arbitrário. */
const arbCampeonato: fc.Arbitrary<Campeonato> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 6 }),
  nome: fc.constant("Evento"),
  data: fc.constantFrom(...DATAS),
  local: fc.constant("Praia"),
  foto: fc.constant("/foto.jpg"),
  descricao: fc.constant("desc"),
});

/** Lista de campeonatos com ids únicos (garante multiset comparável sem ambiguidade). */
const arbLista: fc.Arbitrary<Campeonato[]> = fc
  .uniqueArray(arbCampeonato, { maxLength: 20, selector: (c) => c.id })
  .map((cs) => cs.slice());

function multisetIds(cs: Campeonato[]): string[] {
  return cs.map((c) => c.id).sort();
}

describe("Feature: pingo-rebrand-visual, Property 2: Ordenação de eventos determinística e por (data, id)", () => {
  it("(a) a saída é uma permutação da entrada (mesmo multiset de ids)", () => {
    fc.assert(
      fc.property(arbLista, (lista) => {
        const ordenada = ordenarPorDataId(lista);
        expect(ordenada).toHaveLength(lista.length);
        expect(multisetIds(ordenada)).toEqual(multisetIds(lista));
      }),
      { numRuns: 200 }
    );
  });

  it("(b) a saída é não-decrescente pela chave composta (data, id)", () => {
    fc.assert(
      fc.property(arbLista, (lista) => {
        const ordenada = ordenarPorDataId(lista);
        for (let i = 1; i < ordenada.length; i++) {
          expect(compararPorDataId(ordenada[i - 1], ordenada[i])).toBeLessThanOrEqual(0);
        }
      }),
      { numRuns: 200 }
    );
  });

  it("(c) ordenar a mesma entrada duas vezes produz a mesma ordem (determinismo)", () => {
    fc.assert(
      fc.property(arbLista, (lista) => {
        const primeira = ordenarPorDataId(lista);
        const segunda = ordenarPorDataId(lista);
        expect(segunda).toEqual(primeira);
      }),
      { numRuns: 200 }
    );
  });

  it("(c') qualquer permutação da mesma entrada produz a mesma saída ordenada", () => {
    fc.assert(
      fc.property(arbLista, (lista) => {
        const baseline = ordenarPorDataId(lista);
        const embaralhada = [...lista].reverse();
        expect(ordenarPorDataId(embaralhada)).toEqual(baseline);
      }),
      { numRuns: 200 }
    );
  });

  it("(d) não muta a lista de entrada", () => {
    fc.assert(
      fc.property(arbLista, (lista) => {
        const copia = lista.map((c) => ({ ...c }));
        ordenarPorDataId(lista);
        expect(lista).toEqual(copia);
      }),
      { numRuns: 200 }
    );
  });
});
