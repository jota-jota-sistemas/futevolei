import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { Campeonato } from "../src/types";
import {
  cidadeDoLocal,
  opcoesCidades,
  intervaloDoPreset,
  filtrar,
  type FiltrosEventos,
} from "../src/utils/eventos";

/**
 * Feature: filtros-eventos-usabilidade
 *
 * Property A1: cidadeDoLocal é consistente com opcoesCidades.
 *   Toda cidade retornada por opcoesCidades aparece como cidadeDoLocal de ao
 *   menos um evento, e a soma das contagens = nº de eventos com cidade não vazia.
 *
 * Property A2: filtrar por cidade seleciona exatamente os eventos cuja
 *   cidadeDoLocal(local) é igual à selecionada.
 *
 * Property C1: filtrar por intervalo de preset ({ data: de, dataAte: ate })
 *   retorna exatamente os eventos com de <= c.data <= ate (comparação ISO).
 */

const CIDADES = ["São Paulo", "Santos", "Cotia", "Guarulhos"];
// Gera um `local` em formatos variados, sempre resolvendo para uma cidade conhecida.
const arbLocal = fc.oneof(
  fc.constantFrom(...CIDADES).map((c) => `${c}, SP`),
  fc.constantFrom(...CIDADES).map((c) => `Arena X, Bairro, ${c}, SP`),
  fc.constantFrom(...CIDADES).map((c) => `Bairro, ${c}`) // sem UF
);
const arbData = fc
  .record({ mes: fc.integer({ min: 11, max: 12 }), dia: fc.integer({ min: 1, max: 28 }) })
  .map(({ mes, dia }) => `2026-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`);

const arbCamp: fc.Arbitrary<Campeonato> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 6 }),
  nome: fc.constant("Evento"),
  data: arbData,
  local: arbLocal,
  foto: fc.constant("/f.jpg"),
  descricao: fc.constant("d"),
});
const arbLista = fc.uniqueArray(arbCamp, { maxLength: 20, selector: (c) => c.id });

describe("Feature: filtros-eventos-usabilidade, Property A1: opcoesCidades deriva de cidadeDoLocal", () => {
  it("cada cidade listada corresponde a eventos reais; contagens somam", () => {
    fc.assert(
      fc.property(arbLista, (lista) => {
        const ops = opcoesCidades(lista);
        const comCidade = lista.filter((c) => cidadeDoLocal(c.local) !== "");
        const soma = ops.reduce((s, o) => s + o.total, 0);
        expect(soma).toBe(comCidade.length);
        for (const { cidade, total } of ops) {
          const reais = lista.filter((c) => cidadeDoLocal(c.local) === cidade).length;
          expect(total).toBe(reais);
          expect(reais).toBeGreaterThan(0);
        }
      }),
      { numRuns: 200 }
    );
  });
});

describe("Feature: filtros-eventos-usabilidade, Property A2: filtro por cidade", () => {
  it("retorna exatamente os eventos daquela cidade", () => {
    fc.assert(
      fc.property(arbLista, fc.constantFrom(...CIDADES), (lista, cidade) => {
        const r = filtrar(lista, { cidade });
        const esperado = lista.filter((c) => cidadeDoLocal(c.local) === cidade);
        expect(new Set(r.map((c) => c.id))).toEqual(new Set(esperado.map((c) => c.id)));
      }),
      { numRuns: 200 }
    );
  });
});

describe("Feature: filtros-eventos-usabilidade, Property C1: filtro por intervalo de preset", () => {
  it("retorna exatamente os eventos com de <= data <= ate", () => {
    fc.assert(
      fc.property(arbLista, fc.constantFrom("2026-11", "2026-12"), (lista, mes) => {
        const { de, ate } = intervaloDoPreset(mes, "2026-11-08");
        const r = filtrar(lista, { data: de, dataAte: ate });
        const esperado = lista.filter((c) => c.data >= de && c.data <= ate);
        expect(new Set(r.map((c) => c.id))).toEqual(new Set(esperado.map((c) => c.id)));
      }),
      { numRuns: 200 }
    );
  });

  it("preset vazio é identidade (sem limites)", () => {
    fc.assert(
      fc.property(arbLista, (lista) => {
        const { de, ate } = intervaloDoPreset("", "2026-11-08");
        expect(de).toBe("");
        expect(ate).toBe("");
        expect(filtrar(lista, { data: de, dataAte: ate })).toEqual(lista);
      }),
      { numRuns: 100 }
    );
  });
});
