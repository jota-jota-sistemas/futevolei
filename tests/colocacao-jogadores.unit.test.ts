// Colocação final das duplas e o resumo por jogador.
import { describe, it, expect } from "vitest";
import type { Bracket, Pair } from "../src/domain/bracket/types";
import { gerarChaveamento } from "../src/domain/bracket/generator";
import { registrarPlacar } from "../src/domain/bracket/progression";
import {
  colocacoesDaCategoria,
  resumirColocacoes,
  rotuloColocacao,
  textoResumo,
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

describe("resumirColocacoes", () => {
  it("conta títulos, pódios (top 3) e a melhor colocação para os dois jogadores da dupla", () => {
    const r = resumirColocacoes([
      { jogadorAId: "ana", jogadorBId: "bia", colocacao: 1 },
      { jogadorAId: "ana", jogadorBId: "caio", colocacao: 3 },
      { jogadorAId: "ana", jogadorBId: null, colocacao: 7 },
      { jogadorAId: "bia", jogadorBId: "caio", colocacao: null },
    ]);
    expect(r.get("ana")).toEqual({ titulos: 1, podios: 2, melhor: 1 });
    expect(r.get("bia")).toEqual({ titulos: 1, podios: 1, melhor: 1 });
    expect(r.get("caio")).toEqual({ titulos: 0, podios: 1, melhor: 3 });
  });
  it("mesmo jogador nos dois lugares (dado inválido) conta uma vez só", () => {
    expect(resumirColocacoes([{ jogadorAId: "x", jogadorBId: "x", colocacao: 1 }]).get("x")).toEqual({ titulos: 1, podios: 1, melhor: 1 });
  });
});

describe("textos", () => {
  it("rótulo com medalha no pódio", () => {
    expect([1, 2, 3, 4].map(rotuloColocacao)).toEqual(["🥇 1º lugar", "🥈 2º lugar", "🥉 3º lugar", "4º lugar"]);
  });
  it("resumo omite zeros e usa singular", () => {
    expect(textoResumo({ titulos: 1, podios: 1, melhor: 1 })).toBe("Melhor: 1º · 1 título · 1 pódio");
    expect(textoResumo({ titulos: 0, podios: 2, melhor: 2 })).toBe("Melhor: 2º · 2 pódios");
    expect(textoResumo({ titulos: 0, podios: 0, melhor: 9 })).toBe("Melhor: 9º");
    expect(textoResumo({ titulos: 0, podios: 0, melhor: null })).toBe("");
  });
});
