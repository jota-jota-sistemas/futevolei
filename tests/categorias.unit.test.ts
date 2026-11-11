import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  classificarCategoria,
  categoriaCombina,
  NIVEIS,
  GENEROS,
} from "../src/utils/categorias";
import { corresponde, contagemNiveis, contagemGeneros } from "../src/utils/eventos";
import type { Campeonato } from "../src/types";

/**
 * Feature: filtro de categorias por Nível e Gênero.
 *
 * As categorias chegam como texto livre; `classificarCategoria` as reduz a
 * nível e gênero. Regras acordadas: cada variante de nível é uma opção própria
 * (Principiante ≠ Estreante, "Iniciante + C" ≠ Iniciante…); "Outros" é um
 * nível; categoria sem gênero escrito é Masculino SOMENTE quando tem nível
 * reconhecido (e não é "Outros").
 */

/** Evento mínimo, só com o que o filtro lê. */
function ev(categorias?: string[]): Campeonato {
  return {
    id: "x", nome: "x", data: "2026-11-01", local: "Arena, Santos, SP",
    foto: "", descricao: "", categorias,
  };
}

describe("classificarCategoria: exemplos", () => {
  const casos: [string, string | null, string | null][] = [
    // texto,                       nível,            gênero
    ["Feminino Iniciante",          "Iniciante",      "Feminino"],
    ["Iniciante",                   "Iniciante",      "Masculino"], // padrão
    ["amador c masc.",              "Amador",         "Masculino"],
    ["Misto Estreante",             "Estreante",      "Misto"],
    ["Principiante",                "Principiante",   "Masculino"],
    ["Aprendiz Masculino",          "Aprendiz",       "Masculino"],
    ["Iniciante + C",               "Iniciante + C",  "Masculino"],
    ["feminino iniciante + c",      "Iniciante + C",  "Feminino"],
    ["Iniciante+Carrega",           "Iniciante",      "Masculino"], // "carrega" é modificador
    ["Estreante Masculino + Cavalo","Estreante",      "Masculino"],
    ["35+ (Carrega)",               "Master",         "Masculino"],
    ["Master 40+ (Prata)",          "Master",         "Masculino"],
    ["Misto Bronze",                "Bronze",         "Misto"],
    ["Intermediário B Masculino",   "Intermediário",  "Masculino"],
    ["Misto (Homem Até C)",         "Amador",         "Misto"],
    ["A+B",                         "Amador",         "Masculino"],
    ["Open",                        "Open",           "Masculino"],
    ["Misto Livre",                 "Open",           "Misto"],
    // "Outros": não recebe o gênero padrão
    ["Kids",                        "Outros",         null],
    ["Pais E Filhos",               "Outros",         null],
    ["Convidados Alunos",           "Outros",         null],
    ["Feminino + Carrega",          "Outros",         "Feminino"],
    ["Vôlei de Praia Feminino",     "Outros",         "Feminino"],
    // só gênero, sem nível: não ganha padrão
    ["Feminino",                    null,             "Feminino"],
    ["Masculino",                   null,             "Masculino"],
    ["Futevôlei Masculino",         null,             "Masculino"],
    ["Mistos",                      null,             "Misto"],
    ["",                            null,             null],
  ];

  for (const [texto, nivel, genero] of casos) {
    it(`"${texto}" -> nível ${nivel}, gênero ${genero}`, () => {
      expect(classificarCategoria(texto)).toEqual({ nivel, genero });
    });
  }
});

describe("Feature: filtro nível/gênero, Property: classificarCategoria", () => {
  const amostras = casosAmostra();

  it("não depende de maiúsculas/minúsculas nem de espaços nas pontas", () => {
    fc.assert(
      fc.property(fc.constantFrom(...amostras), (texto) => {
        const base = classificarCategoria(texto);
        expect(classificarCategoria(texto.toUpperCase())).toEqual(base);
        expect(classificarCategoria(texto.toLowerCase())).toEqual(base);
        expect(classificarCategoria(`  ${texto}  `)).toEqual(base);
      }),
      { numRuns: 100 }
    );
  });

  it("só devolve níveis e gêneros do vocabulário conhecido", () => {
    fc.assert(
      fc.property(fc.string(), (texto) => {
        const { nivel, genero } = classificarCategoria(texto);
        if (nivel !== null) expect(NIVEIS).toContain(nivel);
        if (genero !== null) expect(GENEROS).toContain(genero);
      }),
      { numRuns: 100 }
    );
  });

  it("Masculino sem a palavra 'masc' só ocorre por padrão, com nível real (não 'Outros')", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.constantFrom(...amostras)), (texto) => {
        const { nivel, genero } = classificarCategoria(texto);
        const escritoMasc = /masc/.test(
          texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        );
        if (genero === "Masculino" && !escritoMasc) {
          expect(nivel).not.toBeNull();
          expect(nivel).not.toBe("Outros");
        }
      }),
      { numRuns: 100 }
    );
  });
});

describe("categoriaCombina / corresponde: nível e gênero na MESMA categoria", () => {
  it("'Feminino' + 'Iniciante' não casa com 'Feminino Master' e 'Masculino Iniciante' separados", () => {
    const armadilha = ev(["Feminino Master", "Masculino Iniciante"]);
    const certo = ev(["Feminino Iniciante"]);
    const filtro = { genero: "Feminino", nivel: "Iniciante" };
    expect(corresponde(armadilha, filtro)).toBe(false);
    expect(corresponde(certo, filtro)).toBe(true);
  });

  it("cada filtro sozinho casa em qualquer categoria do evento", () => {
    const e = ev(["Feminino Master", "Masculino Iniciante"]);
    expect(corresponde(e, { genero: "Feminino" })).toBe(true);
    expect(corresponde(e, { nivel: "Iniciante" })).toBe(true);
    expect(corresponde(e, { nivel: "Open" })).toBe(false);
  });

  it("categoria sem gênero escrito casa com Masculino (padrão), não com Feminino", () => {
    const e = ev(["Iniciante"]);
    expect(corresponde(e, { genero: "Masculino" })).toBe(true);
    expect(corresponde(e, { genero: "Feminino" })).toBe(false);
  });

  it("'Outros' não recebe gênero padrão", () => {
    const e = ev(["Kids"]);
    expect(corresponde(e, { nivel: "Outros" })).toBe(true);
    expect(corresponde(e, { genero: "Masculino" })).toBe(false);
  });

  it("evento sem categorias não casa com nível/gênero ativos, mas passa sem filtro", () => {
    expect(corresponde(ev(undefined), { nivel: "Iniciante" })).toBe(false);
    expect(corresponde(ev([]), { genero: "Misto" })).toBe(false);
    expect(corresponde(ev(undefined), {})).toBe(true);
    expect(corresponde(ev([]), { nivel: "", genero: "" })).toBe(true);
  });

  it("filtro vazio nunca restringe uma categoria", () => {
    fc.assert(
      fc.property(fc.constantFrom(...casosAmostra()), (texto) => {
        expect(categoriaCombina(texto, {})).toBe(true);
        expect(categoriaCombina(texto, { nivel: "", genero: "" })).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});

describe("contagemNiveis / contagemGeneros", () => {
  it("conta EVENTOS (uma vez por valor), na ordem canônica, sem valores zerados", () => {
    const eventos = [
      ev(["Feminino Iniciante", "Misto Iniciante", "Masculino Estreante"]), // Iniciante conta 1x
      ev(["Iniciante"]),
      ev(["Open"]),
      ev(undefined),
    ];
    expect(contagemNiveis(eventos)).toEqual([
      { nivel: "Estreante", total: 1 },
      { nivel: "Iniciante", total: 2 },
      { nivel: "Open", total: 1 },
    ]);
    expect(contagemGeneros(eventos)).toEqual([
      { genero: "Masculino", total: 3 }, // Estreante masc., "Iniciante" padrão, "Open" padrão
      { genero: "Feminino", total: 1 },
      { genero: "Misto", total: 1 },
    ]);
  });
});

/** Textos reais (variações vistas no calendário) usados como amostra. */
function casosAmostra(): string[] {
  return [
    "Feminino Iniciante", "iniciante", "AMADOR C MASC.", "Misto Estreante",
    "Principiante", "Aprendiz Masculino", "Iniciante + C", "iniciante+carrega",
    "35+ (Carrega)", "Master 40+ (Prata)", "Misto Bronze", "Intermediário B Masculino",
    "Misto (Homem Até C)", "A+B", "Open", "Misto Livre", "Kids", "Pais E Filhos",
    "Feminino + Carrega", "Vôlei de Praia Feminino", "Feminino", "Masculino", "Mistos",
  ];
}
