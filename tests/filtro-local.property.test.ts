import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { Campeonato } from "../src/types";
import { filtrar, type FiltrosEventos } from "../src/utils/eventos";

/**
 * Property 2: Filtro de local seleciona por igualdade exata.
 *
 * Para qualquer lista de campeonatos e qualquer valor de `local` ativo,
 * `filtrar` com esse `local`:
 *   (a) devolve apenas eventos cujo `local` é exatamente igual ao selecionado
 *       (nada com `local` diferente escapa); e
 *   (b) não omite nenhum evento da entrada cujo `local` seja igual ao
 *       selecionado (completude por igualdade exata).
 *
 * Validates: Requirements 1.2
 */

/**
 * Pequeno conjunto de locais para que o valor sorteado como filtro quase
 * sempre exista nos dados, exercitando de fato a seleção por igualdade.
 */
const LOCAIS = ["Praia Grande", "Morumbi", "Pirituba", "Guarulhos"];

/** Gerador de um campeonato com `local` vindo do conjunto e id arbitrário. */
const arbCampeonato: fc.Arbitrary<Campeonato> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 6 }),
  nome: fc.constant("Evento"),
  data: fc.constant("2026-01-01"),
  local: fc.constantFrom(...LOCAIS),
  foto: fc.constant("/foto.jpg"),
  descricao: fc.constant("desc"),
});

/** Lista de campeonatos com ids únicos (evita ambiguidade ao comparar conjuntos). */
const arbLista: fc.Arbitrary<Campeonato[]> = fc.uniqueArray(arbCampeonato, {
  maxLength: 20,
  selector: (c) => c.id,
});

/** Valor de `local` ativo a usar como filtro. */
const arbLocalFiltro: fc.Arbitrary<string> = fc.constantFrom(...LOCAIS);

describe("Feature: filtros-eventos, Property 2: Filtro de local seleciona por igualdade exata", () => {
  it("(a) todo evento no resultado tem `local` igual ao selecionado", () => {
    fc.assert(
      fc.property(arbLista, arbLocalFiltro, (lista, local) => {
        const filtros: FiltrosEventos = { local };
        for (const c of filtrar(lista, filtros)) {
          expect(c.local).toBe(local);
        }
      }),
      { numRuns: 200 }
    );
  });

  it("(b) nenhum evento com o `local` selecionado é omitido do resultado", () => {
    fc.assert(
      fc.property(arbLista, arbLocalFiltro, (lista, local) => {
        const filtros: FiltrosEventos = { local };
        const resultadoIds = new Set(filtrar(lista, filtros).map((c) => c.id));
        for (const c of lista) {
          if (c.local === local) {
            expect(resultadoIds.has(c.id)).toBe(true);
          }
        }
      }),
      { numRuns: 200 }
    );
  });
});
