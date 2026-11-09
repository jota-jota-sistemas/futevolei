import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { Campeonato } from "../src/types";
import { opcoesLocais, opcoesCategorias } from "../src/utils/eventos";

/**
 * Property 5: Opções de dropdown são o conjunto distinto derivado dos dados.
 *
 * Para qualquer lista de campeonatos:
 *   (a) `opcoesLocais` retorna exatamente os valores `local` distintos e
 *       não vazios (strings só com espaços são ignoradas), sem duplicatas;
 *   (b) `opcoesCategorias` retorna exatamente a união deduplicada de todos os
 *       valores em todos os arrays `categorias` presentes — eventos sem o
 *       campo `categorias` não contribuem — ignorando vazios/só-espaços e
 *       sem duplicatas.
 *
 * Validates: Requirements 1.1, 3.1
 */

/**
 * Conjuntos pequenos (incluindo valores vazios/só-espaços e duplicatas em
 * potencial) para forçar deduplicação, exclusão de vazios e sobreposições.
 */
const LOCAIS = ["Praia", "Cidade", "Praia", "", "   ", "Arena"] as const;
const CATEGORIAS = ["Open", "Amador B+C", "Feminino", "", "  ", "Open"] as const;

/**
 * Gerador de um campeonato SEM o campo `categorias` (o campo opcional é
 * omitido de propósito: esses eventos NÃO devem contribuir para as opções
 * de categoria).
 */
const arbSemCategorias: fc.Arbitrary<Campeonato> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 6 }),
  nome: fc.constant("Evento"),
  data: fc.constant("2026-01-01"),
  local: fc.constantFrom(...LOCAIS),
  foto: fc.constant("/foto.jpg"),
  descricao: fc.constant("desc"),
});

/**
 * Gerador de um campeonato COM o campo `categorias` (possivelmente vazio ou
 * com valores em branco/duplicados), para exercitar a deduplicação e a
 * exclusão de valores vazios.
 */
const arbComCategorias: fc.Arbitrary<Campeonato> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 6 }),
  nome: fc.constant("Evento"),
  data: fc.constant("2026-01-01"),
  local: fc.constantFrom(...LOCAIS),
  foto: fc.constant("/foto.jpg"),
  descricao: fc.constant("desc"),
  categorias: fc.array(fc.constantFrom(...CATEGORIAS), { maxLength: CATEGORIAS.length }),
});

/** Mistura eventos COM e SEM `categorias`, com locais possivelmente vazios. */
const arbLista: fc.Arbitrary<Campeonato[]> = fc.array(
  fc.oneof(arbComCategorias, arbSemCategorias),
  { maxLength: 20 }
);

describe("Feature: filtros-eventos, Property 5: Opções de dropdown são o conjunto distinto derivado dos dados", () => {
  it("(a) `opcoesLocais` retorna exatamente os locais distintos e não vazios", () => {
    fc.assert(
      fc.property(arbLista, (lista) => {
        const resultado = opcoesLocais(lista);

        // Conjunto esperado: locais não vazios (desconsiderando só-espaços),
        // deduplicados.
        const esperado = new Set<string>();
        for (const c of lista) {
          if (c.local && c.local.trim()) esperado.add(c.local);
        }

        // Mesmo conjunto de valores (ignorando ordem).
        expect(new Set(resultado)).toEqual(esperado);
        // Sem duplicatas na saída.
        expect(resultado.length).toBe(new Set(resultado).size);
        // Nenhum valor vazio/só-espaços entrou.
        for (const l of resultado) {
          expect(l.trim().length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 200 }
    );
  });

  it("(b) `opcoesCategorias` retorna exatamente a união deduplicada das categorias presentes", () => {
    fc.assert(
      fc.property(arbLista, (lista) => {
        const resultado = opcoesCategorias(lista);

        // Conjunto esperado: união de todas as categorias não vazias de
        // eventos que possuem o campo `categorias`; eventos sem o campo não
        // contribuem.
        const esperado = new Set<string>();
        for (const c of lista) {
          for (const cat of c.categorias ?? []) {
            if (cat && cat.trim()) esperado.add(cat);
          }
        }

        // Mesmo conjunto de valores (ignorando ordem).
        expect(new Set(resultado)).toEqual(esperado);
        // Sem duplicatas na saída.
        expect(resultado.length).toBe(new Set(resultado).size);
        // Nenhum valor vazio/só-espaços entrou.
        for (const cat of resultado) {
          expect(cat.trim().length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 200 }
    );
  });

  it("(b') eventos sem o campo `categorias` nunca contribuem para as opções", () => {
    fc.assert(
      fc.property(arbLista, (lista) => {
        // Opções derivadas apenas dos eventos que possuem `categorias`.
        const somenteComCampo = lista.filter((c) => c.categorias !== undefined);
        // Devem ser idênticas às opções da lista completa, pois eventos sem o
        // campo não acrescentam nada.
        expect(opcoesCategorias(lista)).toEqual(opcoesCategorias(somenteComCampo));
      }),
      { numRuns: 200 }
    );
  });
});
