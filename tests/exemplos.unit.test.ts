import { describe, it, expect } from "vitest";
import type { Campeonato } from "../src/types";
import type { FiltrosEventos } from "../src/utils/eventos";
import { badge, ordenarPorDataId, filtrar } from "../src/utils/eventos";

/**
 * Unit tests de exemplos e edge cases (tarefa 9.6).
 *
 * Validates: Requirements 4.3, 4.4, 4.5
 *
 * Esta suíte cobre a LÓGICA testável sem renderizar componentes .astro:
 *  - `badge` de src/utils/eventos.ts (casos de fronteira e inválidos) — R4.4/R4.5
 *  - `ordenarPorDataId` de src/utils/eventos.ts (lista vazia, 1 item, ordem
 *    conhecida) — apoia R4.3 (lista vazia => seção mostra mensagem e zero cards)
 *    e R4.2 (ordem determinística por data,id).
 *
 * Observação: o estado vazio da seção ("Nenhum evento cadastrado no momento.")
 * e o fallback de mídia vazia (`.event-card__img--vazia`) vivem no markup
 * .astro de EventsSection/EventCard. Como não há render de componente Astro
 * configurado no ambiente de testes (e a tarefa pede para NÃO instalar
 * bibliotecas novas de render Astro), aqui cobrimos apenas a lógica subjacente:
 * `ordenarPorDataId([])` tem length 0, logo a seção então exibe a mensagem e
 * nenhum card. A verificação VISUAL do markup (mensagem de estado vazio e a
 * classe de mídia vazia) é coberta pela inspeção visual/build da tarefa 10.
 */

describe("tarefa 9.6: exemplos e edge cases", () => {
  describe("badge(): casos de fronteira (R4.4)", () => {
    it('badge("2026-01-01") => { dia: "01", mes: "JAN" }', () => {
      expect(badge("2026-01-01")).toEqual({ dia: "01", mes: "JAN" });
    });

    it('badge("2026-12-31") => { dia: "31", mes: "DEZ" }', () => {
      expect(badge("2026-12-31")).toEqual({ dia: "31", mes: "DEZ" });
    });

    it('badge("2026-11-13") => { dia: "13", mes: "NOV" }', () => {
      expect(badge("2026-11-13")).toEqual({ dia: "13", mes: "NOV" });
    });
  });

  describe("badge(): datas ausentes/inválidas => null (R4.5)", () => {
    it('badge("") => null (data ausente)', () => {
      expect(badge("")).toBeNull();
    });

    it('badge("2026-00-10") => null (mês zero inválido)', () => {
      expect(badge("2026-00-10")).toBeNull();
    });
  });

  describe("ordenarPorDataId(): estado vazio e exemplos (R4.3, R4.2)", () => {
    it("lista vazia => [] (length 0 => seção mostra mensagem e zero cards)", () => {
      const resultado = ordenarPorDataId([]);
      expect(resultado).toEqual([]);
      expect(resultado).toHaveLength(0);
    });

    it("lista com 1 item => mesmo conteúdo (nova lista, não muta a entrada)", () => {
      const unico: Campeonato = {
        id: "a",
        nome: "Único",
        data: "2026-05-10",
        local: "Praia",
        foto: "/foto.jpg",
        descricao: "desc",
      };
      const entrada = [unico];
      const resultado = ordenarPorDataId(entrada);

      expect(resultado).toEqual([unico]);
      expect(resultado).not.toBe(entrada); // nova lista
    });

    it("lista pequena conhecida => ordem esperada por (data, id)", () => {
      const base = (id: string, data: string): Campeonato => ({
        id,
        nome: "Evento",
        data,
        local: "Praia",
        foto: "/foto.jpg",
        descricao: "desc",
      });

      // Fora de ordem; empate de data (2026-11-13) desempatado por id (b < c).
      const entrada: Campeonato[] = [
        base("d", "2026-12-31"),
        base("c", "2026-11-13"),
        base("a", "2026-01-01"),
        base("b", "2026-11-13"),
      ];

      const ids = ordenarPorDataId(entrada).map((c) => c.id);
      expect(ids).toEqual(["a", "b", "c", "d"]);
    });
  });
});

/**
 * Unit tests de exemplos e edge cases para `filtrar` (tarefa 1.8).
 *
 * Validates: Requirements 3.3, 4.2, 5.2
 *
 * Casos concretos que apoiam as correctness properties da lógica pura de
 * filtragem em src/utils/eventos.ts:
 *  - filtro que não casa nada => resultado vazio (R5.2)
 *  - evento sem `categorias` excluído quando a categoria está ativa (R3.3)
 *  - todos os filtros vazios => saída = entrada (R4.2)
 */

describe("tarefa 1.8: exemplos e edge cases de filtrar()", () => {
  // Fábrica de evento base; `categorias` é opcional para cobrir eventos sem o campo.
  const evento = (
    id: string,
    data: string,
    local: string,
    categorias?: string[]
  ): Campeonato => ({
    id,
    nome: "Evento",
    data,
    local,
    foto: "/foto.jpg",
    descricao: "desc",
    ...(categorias ? { categorias } : {}),
  });

  it("filtro que não casa nada => length 0 (R5.2)", () => {
    const campeonatos: Campeonato[] = [
      evento("a", "2026-01-01", "Praia Grande", ["Open"]),
      evento("b", "2026-11-13", "Guarujá", ["Amador B+C"]),
    ];

    // Nenhum evento tem esse local, então nada corresponde.
    const filtros: FiltrosEventos = { local: "Inexistente" };
    const resultado = filtrar(campeonatos, filtros);

    expect(resultado).toHaveLength(0);
  });

  it("evento sem `categorias` é excluído quando a categoria está ativa (R3.3)", () => {
    const comCategoria = evento("a", "2026-01-01", "Praia", ["Open"]);
    const semCategoria = evento("b", "2026-02-01", "Praia"); // sem o campo categorias
    const campeonatos: Campeonato[] = [comCategoria, semCategoria];

    const resultado = filtrar(campeonatos, { categoria: "Open" });

    // Só o evento que contém a categoria passa; o sem `categorias` é excluído.
    expect(resultado).toEqual([comCategoria]);
    expect(resultado.map((c) => c.id)).not.toContain("b");
  });

  it("todos os filtros vazios => saída = entrada (R4.2)", () => {
    const campeonatos: Campeonato[] = [
      evento("a", "2026-01-01", "Praia Grande", ["Open"]),
      evento("b", "2026-11-13", "Guarujá"),
      evento("c", "2026-12-31", "Santos", ["Feminino"]),
    ];

    // Filtros inativos: "" (e campos omitidos) são tratados como identidade.
    const filtros: FiltrosEventos = { local: "", data: "", categoria: "" };
    const resultado = filtrar(campeonatos, filtros);

    // Mesmo conteúdo e mesma ordem da entrada (filtrar não reordena).
    expect(resultado).toEqual(campeonatos);
    // Objeto vazio também deve se comportar como identidade.
    expect(filtrar(campeonatos, {})).toEqual(campeonatos);
  });
});
