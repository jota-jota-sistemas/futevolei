import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { Campeonato } from "../src/types";
import {
  filtrar,
  corresponde,
  ordenarPorDataId,
  compararPorDataId,
  type FiltrosEventos,
} from "../src/utils/eventos";

/**
 * Feature: filtros-eventos
 *
 * Este arquivo cobre duas correctness properties do design:
 *
 *   Property 1: Composição AND e identidade de filtros vazios.
 *     Um evento pertence a `filtrar(campeonatos, filtros)` se e somente se ele
 *     satisfaz TODOS os filtros ativos simultaneamente (conjunção); e quando
 *     nenhum filtro está ativo, o conjunto resultante é igual à entrada.
 *     Validates: Requirements 4.2, 4.3, 1.3, 2.3, 3.4
 *
 *   Property 6: Filtragem preserva a ordenação por (data, id).
 *     Para qualquer lista e qualquer combinação de filtros,
 *     `ordenarPorDataId(filtrar(...))` é não-decrescente pela chave composta
 *     (data, id) e seus ids são um subconjunto dos ids da entrada.
 *     Validates: Requirements 5.1, 5.3
 *
 * Geradores constrangem o espaço de entrada ao domínio real: conjuntos
 * pequenos de locais, datas e categorias para forçar sobreposições (casos
 * em que os filtros realmente casam/excluem eventos), e eventos COM e SEM o
 * campo `categorias` para cobrir a exclusão por categoria ativa.
 */

// --- Domínios pequenos para forçar colisões/sobreposições propositais ---
const LOCAIS = ["Praia", "Cidade", "Clube"];
const DATAS = [
  "2026-01-01",
  "2026-03-05",
  "2026-11-13",
  "2026-11-13",
  "2026-12-31",
];
const CATEGORIAS = ["Open", "Amador B+C", "Feminino", "Iniciante"];

/**
 * Gerador de um campeonato. O campo `categorias` é opcional: às vezes ausente
 * (undefined), às vezes um array possivelmente vazio de categorias do domínio.
 */
const arbCampeonato: fc.Arbitrary<Campeonato> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 6 }),
  nome: fc.constant("Evento"),
  data: fc.constantFrom(...DATAS),
  local: fc.constantFrom(...LOCAIS),
  foto: fc.constant("/foto.jpg"),
  descricao: fc.constant("desc"),
  categorias: fc.option(
    fc.uniqueArray(fc.constantFrom(...CATEGORIAS), { maxLength: 3 }),
    { nil: undefined }
  ),
});

/** Lista de campeonatos com ids únicos (para comparar conjuntos por id sem ambiguidade). */
const arbLista: fc.Arbitrary<Campeonato[]> = fc.uniqueArray(arbCampeonato, {
  maxLength: 20,
  selector: (c) => c.id,
});

/**
 * Gerador de filtros. Cada dimensão pode estar inativa (""), vindo de um
 * conjunto pequeno para gerar casos que realmente casam eventos. A data também
 * pode cair fora do intervalo dos dados para exercitar resultados vazios.
 */
const arbFiltros: fc.Arbitrary<FiltrosEventos> = fc.record({
  local: fc.constantFrom("", ...LOCAIS),
  data: fc.constantFrom("", ...DATAS, "2025-01-01", "2027-01-01"),
  categoria: fc.constantFrom("", ...CATEGORIAS),
});

/** Um filtro está ativo quando seu valor é uma string não-vazia. */
function algumFiltroAtivo(f: FiltrosEventos): boolean {
  return Boolean(f.local) || Boolean(f.data) || Boolean(f.categoria);
}

function idsOrdenados(cs: Campeonato[]): string[] {
  return cs.map((c) => c.id).sort();
}

describe("Feature: filtros-eventos, Property 1: Composição AND e identidade de filtros vazios", () => {
  it("um evento está no resultado se e somente se satisfaz todos os filtros ativos (corresponde)", () => {
    fc.assert(
      fc.property(arbLista, arbFiltros, (lista, filtros) => {
        const resultado = filtrar(lista, filtros);
        const idsResultado = new Set(resultado.map((c) => c.id));

        // Direção 1: todo evento no resultado corresponde.
        for (const c of resultado) {
          expect(corresponde(c, filtros)).toBe(true);
        }

        // Direção 2 (sse): todo evento que corresponde está no resultado,
        // e nenhum que não corresponde está presente.
        for (const c of lista) {
          expect(idsResultado.has(c.id)).toBe(corresponde(c, filtros));
        }
      }),
      { numRuns: 200 }
    );
  });

  it("nenhum filtro ativo (todos vazios) ⇒ saída igual à entrada (identidade)", () => {
    fc.assert(
      fc.property(arbLista, (lista) => {
        const vazio: FiltrosEventos = { local: "", data: "", categoria: "" };
        const resultado = filtrar(lista, vazio);
        // Mesma ordem e mesmos elementos: filtrar não reordena nem muta.
        expect(resultado).toEqual(lista);
      }),
      { numRuns: 200 }
    );
  });

  it("filtros undefined também são identidade (espelham controles vazios)", () => {
    fc.assert(
      fc.property(arbLista, (lista) => {
        const resultado = filtrar(lista, {});
        expect(resultado).toEqual(lista);
      }),
      { numRuns: 100 }
    );
  });

  it("filtrar não muta a lista de entrada", () => {
    fc.assert(
      fc.property(arbLista, arbFiltros, (lista, filtros) => {
        const copia = lista.map((c) => ({ ...c }));
        filtrar(lista, filtros);
        expect(lista).toEqual(copia);
      }),
      { numRuns: 100 }
    );
  });
});

describe("Feature: filtros-eventos, Property 6: Filtragem preserva a ordenação por (data, id)", () => {
  it("ordenarPorDataId(filtrar(...)) é não-decrescente pela chave composta (data, id)", () => {
    fc.assert(
      fc.property(arbLista, arbFiltros, (lista, filtros) => {
        const ordenado = ordenarPorDataId(filtrar(lista, filtros));
        for (let i = 1; i < ordenado.length; i++) {
          expect(
            compararPorDataId(ordenado[i - 1], ordenado[i])
          ).toBeLessThanOrEqual(0);
        }
      }),
      { numRuns: 200 }
    );
  });

  it("os ids do resultado ordenado são um subconjunto dos ids da entrada", () => {
    fc.assert(
      fc.property(arbLista, arbFiltros, (lista, filtros) => {
        const ordenado = ordenarPorDataId(filtrar(lista, filtros));
        const idsEntrada = new Set(lista.map((c) => c.id));
        for (const c of ordenado) {
          expect(idsEntrada.has(c.id)).toBe(true);
        }
      }),
      { numRuns: 200 }
    );
  });

  it("ordenar o resultado filtrado coincide com filtrar a lista já ordenada (ordem preservada)", () => {
    fc.assert(
      fc.property(arbLista, arbFiltros, (lista, filtros) => {
        // Como filtrar preserva a ordem relativa e ordenarPorDataId é estável
        // pela chave composta, filtrar depois de ordenar a lista completa
        // produz exatamente a mesma sequência (mesmos ids em mesma ordem).
        const viaFiltrarDepoisOrdenar = ordenarPorDataId(filtrar(lista, filtros));
        const viaOrdenarDepoisFiltrar = filtrar(ordenarPorDataId(lista), filtros);
        expect(viaFiltrarDepoisOrdenar.map((c) => c.id)).toEqual(
          viaOrdenarDepoisFiltrar.map((c) => c.id)
        );
      }),
      { numRuns: 200 }
    );
  });

  it("sanity: o conjunto de ids independe de ordenar antes ou depois de filtrar", () => {
    fc.assert(
      fc.property(arbLista, arbFiltros, (lista, filtros) => {
        const a = ordenarPorDataId(filtrar(lista, filtros));
        const b = filtrar(lista, filtros);
        expect(idsOrdenados(a)).toEqual(idsOrdenados(b));
      }),
      { numRuns: 100 }
    );
  });
});
