import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { Campeonato } from "../src/types";
import { filtrar, type FiltrosEventos } from "../src/utils/eventos";

/**
 * Property 4: Filtro de categoria por pertencimento, excluindo eventos sem categorias.
 *
 * Para qualquer lista de campeonatos (incluindo eventos COM e SEM o campo
 * `categorias`) e qualquer categoria ativa:
 *   (a) todo evento no resultado possui um array `categorias` que contém a
 *       categoria selecionada;
 *   (b) eventos sem o campo `categorias` são sempre excluídos quando a
 *       categoria está ativa;
 *   (c) nenhum evento cuja `categorias` contém a categoria ativa é omitido.
 *
 * Validates: Requirements 3.2, 3.3
 */

/** Conjunto pequeno de categorias para forçar pertencimento e sobreposições. */
const CATEGORIAS = ["Open", "Amador B+C", "Feminino", "Iniciante", "Misto"] as const;

/**
 * Gerador de um campeonato SEM o campo `categorias` (o campo opcional é
 * omitido de propósito para cobrir R3.3 / EDGE_CASE).
 */
const arbSemCategorias: fc.Arbitrary<Campeonato> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 6 }),
  nome: fc.constant("Evento"),
  data: fc.constant("2026-01-01"),
  local: fc.constant("Praia"),
  foto: fc.constant("/foto.jpg"),
  descricao: fc.constant("desc"),
});

/**
 * Gerador de um campeonato COM o campo `categorias` (possivelmente vazio),
 * usando um subconjunto do pequeno conjunto `CATEGORIAS`.
 */
const arbComCategorias: fc.Arbitrary<Campeonato> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 6 }),
  nome: fc.constant("Evento"),
  data: fc.constant("2026-01-01"),
  local: fc.constant("Praia"),
  foto: fc.constant("/foto.jpg"),
  descricao: fc.constant("desc"),
  categorias: fc.uniqueArray(fc.constantFrom(...CATEGORIAS), { maxLength: CATEGORIAS.length }),
});

/** Mistura eventos COM e SEM `categorias` na mesma lista. */
const arbLista: fc.Arbitrary<Campeonato[]> = fc.array(
  fc.oneof(arbComCategorias, arbSemCategorias),
  { maxLength: 20 }
);

/** Categoria ativa: sempre um valor não vazio do conjunto conhecido. */
const arbCategoriaAtiva: fc.Arbitrary<string> = fc.constantFrom(...CATEGORIAS);

describe("Feature: filtros-eventos, Property 4: Filtro de categoria por pertencimento, excluindo eventos sem categorias", () => {
  it("(a) todo evento no resultado contém a categoria ativa em `categorias`", () => {
    fc.assert(
      fc.property(arbLista, arbCategoriaAtiva, (lista, categoria) => {
        const filtros: FiltrosEventos = { categoria };
        for (const c of filtrar(lista, filtros)) {
          expect(c.categorias).toBeDefined();
          expect(c.categorias).toContain(categoria);
        }
      }),
      { numRuns: 200 }
    );
  });

  it("(b) eventos sem `categorias` são sempre excluídos quando a categoria está ativa", () => {
    fc.assert(
      fc.property(arbLista, arbCategoriaAtiva, (lista, categoria) => {
        const filtros: FiltrosEventos = { categoria };
        const resultado = filtrar(lista, filtros);
        for (const c of resultado) {
          expect(c.categorias).not.toBeUndefined();
        }
      }),
      { numRuns: 200 }
    );
  });

  it("(c) nenhum evento cuja `categorias` contém a categoria ativa é omitido", () => {
    fc.assert(
      fc.property(arbLista, arbCategoriaAtiva, (lista, categoria) => {
        const filtros: FiltrosEventos = { categoria };
        const resultado = filtrar(lista, filtros);
        const esperados = lista.filter((c) => c.categorias?.includes(categoria));
        expect(resultado).toEqual(esperados);
      }),
      { numRuns: 200 }
    );
  });
});
