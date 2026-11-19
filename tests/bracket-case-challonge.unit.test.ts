// Case de estudo: "desafio do allanzinho - Estreante" (Challonge x0omsrt2).
// 22 duplas com os seeds do Challonge. Repetindo os placares reais na chave que
// o sistema gera, TODO confronto das chaves de vencedores e de perdedores tem
// de ter acontecido no Challonge (mesma lógica de queda dos perdedores).
import { describe, it, expect } from "vitest";
import type { Bracket, Pair } from "../src/domain/bracket/types";
import { gerarChaveamento, posicaoDaQueda } from "../src/domain/bracket/generator";
import { numerarJogos } from "../src/domain/bracket/ordenacao";
import { registrarPlacar } from "../src/domain/bracket/progression";

// [jogo no Challonge, seed X, seed Y, pontos X, pontos Y]
const CHALLONGE: Array<[number, number, number, number, number]> = [
  [1, 16, 17, 14, 18], [2, 13, 20, 18, 13], [3, 12, 21, 15, 18], [4, 15, 18, 0, 18],
  [5, 14, 19, 8, 18], [6, 11, 22, 18, 9], [7, 8, 9, 18, 11], [8, 7, 10, 16, 18],
  [9, 1, 17, 5, 18], [10, 4, 13, 8, 18], [11, 5, 21, 14, 18], [12, 2, 18, 18, 11],
  [13, 3, 19, 7, 18], [14, 6, 11, 18, 14], [15, 9, 14, 16, 18], [16, 7, 20, 18, 16],
  [17, 1, 22, 11, 18], [18, 5, 15, 18, 0], [19, 18, 12, 18, 14], [20, 11, 16, 7, 18],
  [21, 14, 22, 12, 18], [22, 4, 5, 8, 18], [23, 7, 18, 10, 18], [24, 3, 16, 10, 18],
  [25, 17, 8, 14, 18], [26, 13, 21, 18, 10], [27, 2, 10, 19, 17], [28, 19, 6, 18, 12],
  [29, 17, 18, 12, 18], [30, 21, 16, 18, 15], [31, 10, 22, 9, 18], [32, 6, 5, 18, 13],
  [33, 21, 18, 18, 16], [34, 6, 22, 18, 13], [35, 8, 13, 14, 18], [36, 2, 19, 13, 18],
  [37, 8, 6, 12, 18], [38, 2, 21, 18, 15],
];

function duplas(n: number): Pair[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i + 1}`,
    nomeDupla: `Dupla ${i + 1}`,
    atletaA: `A${i + 1}`,
    atletaB: `B${i + 1}`,
    seed: i + 1,
    criadoEm: `2025-01-01T00:00:${String(i + 1).padStart(2, "0")}.000Z`,
  }));
}

describe("case Challonge: desafio do Allan (22 duplas, dupla eliminação)", () => {
  it("todos os 38 jogos do Challonge acontecem na nossa chave, com as mesmas duplas", () => {
    const r = gerarChaveamento({ duplas: duplas(22), config: { formato: "dupla eliminação" } });
    if (!r.ok) throw new Error(r.erro.code);
    let b: Bracket = numerarJogos(r.bracket);
    const seed = (id: string) => Number(id.slice(1));
    const usados = new Set<number>();
    for (;;) {
      const pronto = b.matches
        .filter((m) => m.side !== "grande-final" && m.vencedorId === null && m.a.pairId && m.b.pairId && !m.a.bye && !m.b.bye)
        .sort((x, y) => (x.ordemDisputa ?? 0) - (y.ordemDisputa ?? 0))[0];
      if (!pronto) break;
      const sa = seed(pronto.a.pairId!);
      const sb = seed(pronto.b.pairId!);
      const ch = CHALLONGE.find(([n, x, y]) => !usados.has(n) && ((x === sa && y === sb) || (x === sb && y === sa)));
      expect(ch, `Jogo ${pronto.ordemDisputa}: seeds ${sa} x ${sb} não se enfrentaram no Challonge`).toBeDefined();
      const [n, x, , px, py] = ch!;
      usados.add(n);
      const res = registrarPlacar(b, pronto.id, x === sa ? px : py, x === sa ? py : px, "2026-11-13T12:00:00.000Z");
      if (!res.ok) throw new Error(res.erro.code);
      b = numerarJogos(res.bracket);
    }
    expect(usados.size).toBe(38);
    // Semifinais: finalistas da chave de vencedores x sobreviventes da de perdedores.
    const semis = b.matches.filter((m) => m.side === "grande-final" && m.rodada === 1);
    const pares = semis.map((m) => [seed(m.a.pairId!), seed(m.b.pairId!)]);
    // Ninguém reencontra quem acabou de eliminar: kaique (13) eliminou joao e leo,
    // então pega gustavo e enzo (2), eliminado por romildo (19), que pega xexa (6).
    expect(pares).toEqual([
      [13, 2], // joao e kaique x gustavo e enzo
      [19, 6], // gabriel e romildo x matheus e xexa
    ]);
  });
});

describe("posicaoDaQueda", () => {
  it("inverte nas rodadas pares e troca de par em par nas ímpares", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((i) => posicaoDaQueda(2, i, 8))).toEqual([7, 6, 5, 4, 3, 2, 1, 0]);
    expect([0, 1, 2, 3].map((i) => posicaoDaQueda(3, i, 4))).toEqual([1, 0, 3, 2]);
    expect([0, 1].map((i) => posicaoDaQueda(4, i, 2))).toEqual([1, 0]);
    expect(posicaoDaQueda(3, 0, 1)).toBe(0);
  });
});
