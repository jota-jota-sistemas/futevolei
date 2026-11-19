// tests/duplas-puras.property.test.ts
//
// Funções puras da preparação do chaveamento: dupla repetida, lista colada
// (WhatsApp), sugestão de formato e contagem de placares.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { acharDuplaRepetida, chaveDaDupla } from "../src/domain/pairs/repetida";
import { ATLETA_MAX, LIMITE_LINHAS, interpretarLista } from "../src/domain/pairs/lista";
import { sugerirFormato } from "../src/domain/bracket/sugestao";
import { avisoDePlacaresPerdidos, resumirPlacares } from "../src/domain/bracket/placares";
import { validarClassificadosPorGrupo, validarNumeroDeGrupos } from "../src/domain/bracket/config";
import type { Match } from "../src/domain/bracket/types";

describe("acharDuplaRepetida", () => {
  const duplas = [
    { id: "1", atletaA: "Ana Lima", atletaB: "Bia Souza" },
    { id: "2", atletaA: "Cris", atletaB: "Duda" },
  ];

  it("a mesma dupla em qualquer ordem, sem caixa, acento nem espaços extras", () => {
    expect(acharDuplaRepetida(duplas, "bia souza", "ANA  LIMA")?.id).toBe("1");
    expect(acharDuplaRepetida(duplas, " Ána Lima ", "Bia Sousa")).toBeNull(); // Souza ≠ Sousa
    expect(acharDuplaRepetida(duplas, "Cris", "Duda")?.id).toBe("2");
  });

  it("um atleta só em comum não é repetida; campos vazios nunca casam", () => {
    expect(acharDuplaRepetida(duplas, "Ana Lima", "Carla")).toBeNull();
    expect(acharDuplaRepetida(duplas, "", "Duda")).toBeNull();
    expect(acharDuplaRepetida([], "A", "B")).toBeNull();
  });

  it("propriedade: simétrica (A,B = B,A)", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), fc.string({ minLength: 1, maxLength: 12 }), (a, b) => {
        expect(chaveDaDupla(a, b)).toBe(chaveDaDupla(b, a));
      })
    );
  });
});

describe("interpretarLista (texto de WhatsApp)", () => {
  const pares = (texto: string, existentes: { atletaA: string; atletaB: string }[] = []) =>
    interpretarLista(texto, existentes).validas.map((d) => `${d.atletaA}|${d.atletaB}`);

  it("separadores &, /, + e a palavra 'e'", () => {
    expect(pares("Ana & Bia\nCris / Duda\nEva + Fia\nGabi e Helena")).toEqual([
      "Ana|Bia",
      "Cris|Duda",
      "Eva|Fia",
      "Gabi|Helena",
    ]);
  });

  it("numeração, marcadores e formatação do WhatsApp são removidos", () => {
    const texto = ["1. Ana e Bia", "2) Cris / Duda", "3- Eva & Fia", "(4) Gabi + Helena", "• Iris e Jade", "- Kátia e Lúcia", "*5.* *Mara e Nina*", "_Olga & Paula_"].join("\n");
    expect(pares(texto)).toEqual([
      "Ana|Bia",
      "Cris|Duda",
      "Eva|Fia",
      "Gabi|Helena",
      "Iris|Jade",
      "Kátia|Lúcia",
      "Mara|Nina",
      "Olga|Paula",
    ]);
  });

  it("linhas vazias, espaços e quebras Windows/Mac são tolerados", () => {
    expect(pares("\r\n  Ana   &   Bia  \r\n\r\n\rCris e Duda\n")).toEqual(["Ana|Bia", "Cris|Duda"]);
  });

  it("mantém o número da linha original (contando as vazias) e o texto bruto", () => {
    const r = interpretarLista("Ana & Bia\n\nsó um nome");
    expect(r.linhas.map((l) => l.linha)).toEqual([1, 3]);
    expect(r.linhas[1].bruto).toBe("só um nome");
  });

  it("inválidas com o motivo: sem separador, mais de dois nomes, mais de um 'e', nome vazio, mesmo nome, nome longo", () => {
    const r = interpretarLista(
      ["Ana", "Ana & Bia & Carla", "Ana e Bia e Carla", "& Bia", "Ana & ana", `${"A".repeat(ATLETA_MAX + 1)} & Bia`, "1."].join("\n")
    );
    expect(r.linhas.every((l) => l.situacao === "invalida")).toBe(true);
    expect(r.linhas.map((l) => l.motivo)).toEqual([
      expect.stringContaining("separador"),
      expect.stringContaining("exatamente dois"),
      expect.stringContaining("mais de um “e”"),
      expect.stringContaining("exatamente dois"),
      expect.stringContaining("mesmo nome"),
      expect.stringContaining("80"),
      expect.stringContaining("sem nomes"),
    ]);
    expect(r.contagem).toEqual({ validas: 0, invalidas: 7, repetidas: 0 });
  });

  it("repetida: contra as já inscritas e dentro da própria lista (em qualquer ordem); só a primeira vale", () => {
    const r = interpretarLista("Ana & Bia\nbia e ana\nCris & Duda\nCRIS / duda", [{ atletaA: "Cris", atletaB: "Duda" }]);
    expect(r.linhas.map((l) => l.situacao)).toEqual(["valida", "repetida", "repetida", "repetida"]);
    expect(r.validas).toEqual([{ atletaA: "Ana", atletaB: "Bia" }]);
    expect(r.contagem).toEqual({ validas: 1, invalidas: 0, repetidas: 3 });
  });

  it("nomes com 'e' dentro de palavras não confundem (Eduardo, Renata)", () => {
    expect(pares("Eduardo e Renata")).toEqual(["Eduardo|Renata"]);
  });

  it("passou do limite de linhas: lê só as primeiras e avisa", () => {
    const texto = Array.from({ length: LIMITE_LINHAS + 5 }, (_, i) => `A${i} & B${i}`).join("\n");
    const r = interpretarLista(texto);
    expect(r.excedeuLimite).toBe(true);
    expect(r.linhas).toHaveLength(LIMITE_LINHAS);
  });

  it("texto vazio ou só espaços: nada", () => {
    expect(interpretarLista("")).toEqual({ linhas: [], validas: [], contagem: { validas: 0, invalidas: 0, repetidas: 0 }, excedeuLimite: false });
    expect(interpretarLista("  \n \n").linhas).toHaveLength(0);
  });

  it("propriedade: nunca lança e a partição das linhas é completa; válidas têm atletas aparados de 1..80", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (texto) => {
        const r = interpretarLista(texto);
        expect(r.contagem.validas + r.contagem.invalidas + r.contagem.repetidas).toBe(r.linhas.length);
        expect(r.validas).toHaveLength(r.contagem.validas);
        for (const d of r.validas) {
          for (const nome of [d.atletaA, d.atletaB]) {
            expect(nome).toBe(nome.trim());
            expect(nome.length).toBeGreaterThanOrEqual(1);
            expect(nome.length).toBeLessThanOrEqual(ATLETA_MAX);
          }
        }
        // Sem duas válidas iguais (em qualquer ordem).
        const chaves = r.validas.map((d) => chaveDaDupla(d.atletaA, d.atletaB));
        expect(new Set(chaves).size).toBe(chaves.length);
      })
    );
  });

  it("propriedade: uma lista bem formada volta inteira (round-trip em formatos de WhatsApp)", () => {
    const nome = fc.stringMatching(/^[A-Za-zÀ-ú]{2,10}$/);
    const sep = fc.constantFrom(" & ", " / ", " + ", " e ");
    const marcador = fc.constantFrom("", "1. ", "2) ", "- ", "• ");
    fc.assert(
      fc.property(fc.uniqueArray(fc.tuple(nome, nome, sep, marcador), { minLength: 1, maxLength: 10, selector: (t) => chaveDaDupla(t[0], t[1]) }), (itens) => {
        const validos = itens.filter(([a, b]) => a.toLowerCase() !== b.toLowerCase() && !/^e$/i.test(a) && !/^e$/i.test(b));
        const texto = validos.map(([a, b, s, m]) => `${m}${a}${s}${b}`).join("\n");
        const r = interpretarLista(texto);
        expect(r.validas.map((d) => [d.atletaA, d.atletaB])).toEqual(validos.map(([a, b]) => [a, b]));
      })
    );
  });
});

describe("sugerirFormato", () => {
  it("menos de 2 duplas (ou valor inválido): nenhuma sugestão", () => {
    for (const n of [0, 1, -3, 2.5, Number.NaN]) expect(sugerirFormato(n), String(n)).toBeNull();
  });

  it("até 6 duplas: dupla eliminação", () => {
    for (let n = 2; n <= 6; n++) {
      const s = sugerirFormato(n)!;
      expect(s.formato).toBe("dupla eliminação");
      expect(s.numeroDeGrupos).toBeUndefined();
    }
  });

  it("exemplos: 8 duplas = 2 grupos de 4; 12 = 4 grupos de 3; 16 = 4 grupos de 4; 7 = 2 grupos (3 a 4)", () => {
    expect(sugerirFormato(8)).toMatchObject({ formato: "fase de grupos", numeroDeGrupos: 2, classificadosPorGrupo: 2 });
    expect(sugerirFormato(12)).toMatchObject({ numeroDeGrupos: 4, classificadosPorGrupo: 2 });
    expect(sugerirFormato(16)).toMatchObject({ numeroDeGrupos: 4, classificadosPorGrupo: 2 });
    expect(sugerirFormato(7)).toMatchObject({ numeroDeGrupos: 2, classificadosPorGrupo: 2 });
    expect(sugerirFormato(8)!.motivo).toBe("8 duplas: fase de grupos com 2 grupos de 4 e 2 classificados por grupo.");
    expect(sugerirFormato(7)!.motivo).toContain("de 3 a 4");
  });

  it("propriedade: para qualquer N de 2 a 128 a sugestão é aceita pelos validadores do domínio", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 128 }), (n) => {
        const s = sugerirFormato(n)!;
        expect(s).not.toBeNull();
        expect(["dupla eliminação", "fase de grupos"]).toContain(s.formato);
        if (s.formato === "fase de grupos") {
          const g = validarNumeroDeGrupos(s.numeroDeGrupos, n);
          expect(g.ok).toBe(true);
          expect(validarClassificadosPorGrupo(s.classificadosPorGrupo, n, s.numeroDeGrupos!).ok).toBe(true);
          // Grupos de 3 a 5 duplas.
          expect(Math.floor(n / s.numeroDeGrupos!)).toBeGreaterThanOrEqual(3);
          expect(Math.ceil(n / s.numeroDeGrupos!)).toBeLessThanOrEqual(5);
        }
        expect(s.motivo.length).toBeGreaterThan(10);
      })
    );
  });
});

describe("resumirPlacares / avisoDePlacaresPerdidos", () => {
  const jogo = (p: Partial<Match> & { placarA?: number | null; placarB?: number | null }): Match =>
    ({
      id: "j",
      side: "upper",
      rodada: 1,
      ordem: 0,
      a: { pairId: "a" },
      b: { pairId: "b" },
      vencedorId: null,
      registradoEm: null,
      ordemDisputa: null,
      placarA: null,
      placarB: null,
      ...p,
    }) as Match;

  it("conta jogos com placar (inclusive ao vivo) e encerrados; byes não contam", () => {
    const r = resumirPlacares({
      matches: [
        jogo({}),
        jogo({ placarA: 3, placarB: 1 }), // ao vivo
        jogo({ placarA: 15, placarB: 9, vencedorId: "a" }), // encerrado
        jogo({ a: { pairId: "a", bye: true }, vencedorId: "b" }), // bye
      ],
    });
    expect(r).toEqual({ comPlacar: 2, encerrados: 1 });
  });

  it("sem chaveamento: zeros; aviso só quando há algo a perder", () => {
    expect(resumirPlacares(null)).toEqual({ comPlacar: 0, encerrados: 0 });
    expect(avisoDePlacaresPerdidos({ comPlacar: 0, encerrados: 0 })).toBeNull();
    expect(avisoDePlacaresPerdidos({ comPlacar: 1, encerrados: 0 })).toBe("1 placar registrado");
    expect(avisoDePlacaresPerdidos({ comPlacar: 7, encerrados: 5 })).toBe("7 placares registrados");
  });
});
