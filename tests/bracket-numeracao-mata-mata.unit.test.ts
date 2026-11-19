// Numeração estrutural do mata-mata: todo jogo disputável já nasce numerado.
import { describe, it, expect } from "vitest";
import type { Pair } from "../src/domain/bracket/types";
import { gerarChaveamento } from "../src/domain/bracket/generator";
import { numerarJogos } from "../src/domain/bracket/ordenacao";
function duplas(n: number): Pair[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `d${i + 1}`,
    nomeDupla: `Dupla ${i + 1}`,
    atletaA: `A${i + 1}`,
    atletaB: `B${i + 1}`,
    seed: i + 1,
    criadoEm: `2025-01-01T00:00:${String(i + 1).padStart(2, "0")}.000Z`,
  }));
}
describe("numeração estrutural do mata-mata", () => {
  for (const [formato, n] of [
    ["dupla eliminação", 8],
    ["dupla eliminação", 11],
    ["eliminação simples", 6],
  ] as const) {
    it(`${formato} com ${n} duplas: todo jogo sem BYE é numerado 1..K, sem buracos`, () => {
      const r = gerarChaveamento({ duplas: duplas(n), config: { formato } });
      if (!r.ok) throw new Error(r.erro.code);
      const b = numerarJogos(r.bracket);
      const disputaveis = b.matches.filter((m) => !m.a.bye && !m.b.bye);
      const numeros = disputaveis.map((m) => m.ordemDisputa as number).sort((x, y) => x - y);
      expect(numeros).toEqual(Array.from({ length: disputaveis.length }, (_, i) => i + 1));
      // Jogo com BYE nunca é numerado.
      for (const m of b.matches.filter((m) => m.a.bye || m.b.bye)) {
        expect(m.ordemDisputa).toBeNull();
      }
    });
  }
  for (const n of [8, 11, 22]) {
    it(`${n} duplas: cada jogo vem depois dos jogos que o alimentam; final é a última e as semifinais as penúltimas`, () => {
      const r = gerarChaveamento({ duplas: duplas(n), config: { formato: "dupla eliminação" } });
      if (!r.ok) throw new Error(r.erro.code);
      const b = numerarJogos(r.bracket);
      const porId = new Map(b.matches.map((m) => [m.id, m]));
      for (const m of b.matches) {
        if (m.ordemDisputa === null) continue;
        for (const alvo of [m.avancaVencedorPara, m.encaminhaPerdedorPara]) {
          const destino = alvo && porId.get(alvo.matchId);
          if (destino && destino.ordemDisputa !== null) {
            expect(destino.ordemDisputa).toBeGreaterThan(m.ordemDisputa);
          }
        }
      }
      const numerados = b.matches
        .filter((m) => m.ordemDisputa !== null)
        .sort((x, y) => (x.ordemDisputa as number) - (y.ordemDisputa as number));
      const total = numerados.length;
      expect(numerados[total - 1].side).toBe("grande-final");
      // Os dois jogos que alimentam a final ocupam as duas posições anteriores.
      const final = numerados[total - 1];
      const semis = numerados.filter((m) => m.avancaVencedorPara?.matchId === final.id);
      expect(semis).toHaveLength(2);
      expect(semis.map((m) => m.ordemDisputa as number).sort((x, y) => x - y)).toEqual([
        total - 2,
        total - 1,
      ]);
    });
    it(`${n} duplas: a chave de perdedores começa antes de a de vencedores terminar`, () => {
      const r = gerarChaveamento({ duplas: duplas(n), config: { formato: "dupla eliminação" } });
      if (!r.ok) throw new Error(r.erro.code);
      const b = numerarJogos(r.bracket);
      const num = (side: string) =>
        b.matches.filter((m) => m.side === side && m.ordemDisputa !== null).map((m) => m.ordemDisputa as number);
      expect(Math.min(...num("lower"))).toBeLessThan(Math.max(...num("upper")));
    });
  }
  it("é estável: renumerar não muda os números existentes", () => {
    const r = gerarChaveamento({ duplas: duplas(8), config: { formato: "dupla eliminação" } });
    if (!r.ok) throw new Error(r.erro.code);
    const b1 = numerarJogos(r.bracket);
    const b2 = numerarJogos(b1);
    expect(b2.matches.map((m) => m.ordemDisputa)).toEqual(b1.matches.map((m) => m.ordemDisputa));
  });
});
