import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { Campeonato } from "../src/types";
import { filtrar, type FiltrosEventos } from "../src/utils/eventos";

/**
 * Property 3: Filtro de data inclui a partir da data escolhida.
 *
 * Validates: Requirements 2.2
 *
 * Para qualquer lista de campeonatos e qualquer data ISO ativa `d`, o resultado
 * de `filtrar` contém EXATAMENTE os eventos cujo `data` é maior ou igual a `d`
 * por comparação lexicográfica de strings ISO (`c.data >= d`), e nenhum outro.
 * A comparação lexicográfica coincide com a ordem cronológica para o formato
 * `YYYY-MM-DD`.
 */

/**
 * Gerador de string de data ISO (YYYY-MM-DD) bem formada. Dias em 1..28 para
 * evitar dependência do mês; o filtro só compara strings, então qualquer dia
 * válido serve — o importante é cobrir um intervalo de datas comparáveis.
 */
const arbDataIso: fc.Arbitrary<string> = fc
  .record({
    ano: fc.integer({ min: 2020, max: 2030 }),
    mes: fc.integer({ min: 1, max: 12 }),
    dia: fc.integer({ min: 1, max: 28 }),
  })
  .map(
    ({ ano, mes, dia }) =>
      `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(
        dia
      ).padStart(2, "0")}`
  );

/** Gerador de um campeonato com `data` variável; demais campos fixos. */
const arbCampeonato: fc.Arbitrary<Campeonato> = fc
  .record({
    id: fc.string({ minLength: 1, maxLength: 6 }),
    data: arbDataIso,
  })
  .map(({ id, data }) => ({
    id,
    nome: "Evento",
    data,
    local: "Praia",
    foto: "/foto.jpg",
    descricao: "desc",
  }));

/** Lista de campeonatos com ids únicos para comparação sem ambiguidade. */
const arbLista: fc.Arbitrary<Campeonato[]> = fc.uniqueArray(arbCampeonato, {
  maxLength: 20,
  selector: (c) => c.id,
});

describe("Feature: filtros-eventos, Property 3: Filtro de data inclui a partir da data escolhida", () => {
  it("retorna exatamente os eventos com data >= d (comparação de strings ISO)", () => {
    fc.assert(
      fc.property(arbLista, arbDataIso, (lista, d) => {
        const filtros: FiltrosEventos = { data: d };
        const resultado = filtrar(lista, filtros);
        const resultadoIds = new Set(resultado.map((c) => c.id));

        // Todo evento no resultado satisfaz data >= d.
        for (const c of resultado) {
          expect(c.data >= d).toBe(true);
        }

        // Nenhum evento com data >= d fica de fora, e nenhum com data < d entra:
        // cada evento da entrada está no resultado sse c.data >= d.
        for (const c of lista) {
          expect(resultadoIds.has(c.id)).toBe(c.data >= d);
        }
      }),
      { numRuns: 100 }
    );
  });
});
