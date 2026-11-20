// Colocação final das duplas e o resumo por jogador.
import { describe, it, expect } from "vitest";
import type { Bracket, Pair } from "../src/domain/bracket/types";
import { gerarChaveamento } from "../src/domain/bracket/generator";
import { registrarPlacar } from "../src/domain/bracket/progression";
import {
  colocacoesDaCategoria,
  nivelDaCategoria,
  resumirColocacoesPorNivel,
  rotuloColocacao,
  textoResumoNivel,
} from "../src/domain/jogadores/colocacao";

function duplas(n: number): Pair[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `d${i + 1}`, nomeDupla: `D${i + 1}`, atletaA: `A${i + 1}`, atletaB: `B${i + 1}`,
    seed: i + 1, criadoEm: `2025-01-01T00:00:${String(i + 1).padStart(2, "0")}.000Z`,
  }));
}

/** Joga tudo: a dupla de menor seed sempre vence. */
function jogarTudo(b: Bracket): Bracket {
  for (;;) {
    const m = b.matches.find((x) => x.vencedorId === null && x.a.pairId && x.b.pairId && !x.a.bye && !x.b.bye);
    if (!m) return b;
    const sa = Number(m.a.pairId!.slice(1));
    const sb = Number(m.b.pairId!.slice(1));
    const r = registrarPlacar(b, m.id, sa < sb ? 18 : 10, sa < sb ? 10 : 18, "2026-01-01T00:00:00.000Z");
    if (!r.ok) throw new Error(r.erro.code);
    b = r.bracket;
  }
}

describe("colocacoesDaCategoria", () => {
  it("antes da final decidida, todas null", () => {
    const r = gerarChaveamento({ duplas: duplas(6), config: { formato: "dupla eliminação" } });
    if (!r.ok) throw new Error();
    const c = colocacoesDaCategoria(r.bracket);
    expect(Object.keys(c)).toHaveLength(6);
    expect(Object.values(c).every((v) => v === null)).toBe(true);
  });
  it("com a final decidida, a campeã é 1 e todas têm colocação", () => {
    const r = gerarChaveamento({ duplas: duplas(6), config: { formato: "dupla eliminação" } });
    if (!r.ok) throw new Error();
    const c = colocacoesDaCategoria(jogarTudo(r.bracket));
    expect(c.d1).toBe(1);
    expect(Object.values(c).every((v) => typeof v === "number" && v >= 1)).toBe(true);
  });
});

describe("nivelDaCategoria", () => {
  it("separa nível e gênero; sem gênero escrito, nível vale Masculino", () => {
    expect(nivelDaCategoria("Masculino Estreante").rotulo).toBe("Estreante Masculino");
    expect(nivelDaCategoria("Estreante Masc.").rotulo).toBe("Estreante Masculino");
    expect(nivelDaCategoria("Estreante").rotulo).toBe("Estreante Masculino");
    expect(nivelDaCategoria("Misto Estreante").rotulo).toBe("Estreante Misto");
    expect(nivelDaCategoria("Amador C Fem.").rotulo).toBe("Amador Feminino");
  });
  it("sem nível: só o gênero; sem nada ou 'Outros' (Kids, Cavalo): Outros", () => {
    expect(nivelDaCategoria("Feminino").rotulo).toBe("Feminino");
    expect(nivelDaCategoria("Kids").rotulo).toBe("Outros");
    expect(nivelDaCategoria(null).rotulo).toBe("Outros");
  });
});

describe("resumirColocacoesPorNivel", () => {
  it("conta títulos, pódios e melhor colocação por nível, para os dois jogadores da dupla", () => {
    const r = resumirColocacoesPorNivel([
      { jogadorAId: "ana", jogadorBId: "bia", colocacao: 1, categoria: "Masculino Estreante" },
      { jogadorAId: "ana", jogadorBId: "caio", colocacao: 3, categoria: "Estreante Masc." },
      { jogadorAId: "ana", jogadorBId: null, colocacao: 7, categoria: "Misto Estreante" },
      { jogadorAId: "ana", jogadorBId: null, colocacao: 5, categoria: "Iniciante" },
      { jogadorAId: "bia", jogadorBId: "caio", colocacao: null, categoria: "Iniciante" },
    ]);
    expect(r.get("ana")).toEqual([
      { nivel: "Estreante Masculino", titulos: 1, podios: 2, melhor: 1 },
      { nivel: "Estreante Misto", titulos: 0, podios: 0, melhor: 7 },
      { nivel: "Iniciante Masculino", titulos: 0, podios: 0, melhor: 5 },
    ]);
    expect(r.get("bia")).toEqual([{ nivel: "Estreante Masculino", titulos: 1, podios: 1, melhor: 1 }]);
    expect(r.get("caio")).toEqual([{ nivel: "Estreante Masculino", titulos: 0, podios: 1, melhor: 3 }]);
  });
  it("mesmo jogador nos dois lugares (dado inválido) conta uma vez só", () => {
    expect(resumirColocacoesPorNivel([{ jogadorAId: "x", jogadorBId: "x", colocacao: 1, categoria: "Open" }]).get("x"))
      .toEqual([{ nivel: "Open Masculino", titulos: 1, podios: 1, melhor: 1 }]);
  });
});

describe("textos", () => {
  it("rótulo com medalha no pódio", () => {
    expect([1, 2, 3, 4].map(rotuloColocacao)).toEqual(["🥇 1º lugar", "🥈 2º lugar", "🥉 3º lugar", "4º lugar"]);
  });
  it("resumo do nível omite zeros, usa singular e troféu só com título", () => {
    expect(textoResumoNivel({ nivel: "Estreante Masculino", titulos: 1, podios: 1, melhor: 1 }))
      .toBe("🏆 Estreante Masculino · Melhor: 1º · 1 título · 1 pódio");
    expect(textoResumoNivel({ nivel: "Iniciante Misto", titulos: 0, podios: 2, melhor: 2 }))
      .toBe("Iniciante Misto · Melhor: 2º · 2 pódios");
    expect(textoResumoNivel({ nivel: "Outros", titulos: 0, podios: 0, melhor: 9 })).toBe("Outros · Melhor: 9º");
  });
});
