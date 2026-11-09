// Feature: criar-chaveamento-campeonato — Property tests da NUMERAÇÃO/ORDENAÇÃO
// dos jogos (ordem de disputa na fila única do torneio).

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { gerarChaveamento } from "../src/domain/bracket/generator";
import { numerarJogos } from "../src/domain/bracket/ordenacao";
import type { Bracket, Match, Pair, PairId } from "../src/domain/bracket/types";

function duplas(n: number): Pair[] {
  return Array.from({ length: n }, (_, i) => {
    const seed = i + 1;
    return {
      id: `d${seed}`,
      nomeDupla: `Dupla ${seed}`,
      atletaA: `A${seed}`,
      atletaB: `B${seed}`,
      seed,
      criadoEm: `2026-01-01T00:00:${String(seed % 60).padStart(2, "0")}.000Z`,
    };
  });
}

/** Gera um bracket de fase de grupos (round-robin — todos os jogos conhecidos). */
function gerarGrupos(n: number, g: number): Bracket {
  const r = gerarChaveamento({
    duplas: duplas(n),
    config: { formato: "fase de grupos", numeroDeGrupos: g },
  });
  if (!r.ok) throw new Error("gen: " + r.erro.code);
  return r.bracket;
}

function elegivel(m: Match): boolean {
  return (
    m.a.pairId !== null && m.b.pairId !== null &&
    m.a.bye !== true && m.b.bye !== true
  );
}

/** N (4..24) e G válido (1..floor(N/2)). */
const arbNG = fc
  .integer({ min: 4, max: 24 })
  .chain((n) => fc.tuple(fc.constant(n), fc.integer({ min: 1, max: Math.floor(n / 2) })));

describe("Feature: criar-chaveamento-campeonato, Property ORD-1: numeração 1..K contígua e única nos elegíveis", () => {
  it("todos os jogos elegíveis recebem números 1..K sem repetição nem buraco", () => {
    fc.assert(
      fc.property(arbNG, ([n, g]) => {
        const b = numerarJogos(gerarGrupos(n, g));
        const numeros = b.matches
          .filter((m) => m.ordemDisputa !== null)
          .map((m) => m.ordemDisputa as number)
          .sort((x, y) => x - y);
        // Fase de grupos: todos os jogos são elegíveis desde a geração.
        const elegiveis = b.matches.filter(elegivel).length;
        expect(numeros.length).toBe(elegiveis);
        expect(numeros).toEqual(Array.from({ length: elegiveis }, (_, i) => i + 1));
      }),
      { numRuns: 200 },
    );
  });
});

describe("Feature: criar-chaveamento-campeonato, Property ORD-2: evita dupla em jogos consecutivos quando possível", () => {
  it("nenhum par de jogos consecutivos compartilha dupla, a menos que seja inevitável naquele passo", () => {
    fc.assert(
      fc.property(arbNG, ([n, g]) => {
        const b = numerarJogos(gerarGrupos(n, g));
        const ordenados = b.matches
          .filter((m) => m.ordemDisputa !== null)
          .sort((x, y) => (x.ordemDisputa as number) - (y.ordemDisputa as number));

        const duplasDe = (m: Match) => new Set<PairId>([m.a.pairId as PairId, m.b.pairId as PairId]);

        for (let i = 1; i < ordenados.length; i++) {
          const ant = duplasDe(ordenados[i - 1]);
          const atual = ordenados[i];
          const compartilha = [...duplasDe(atual)].some((d) => ant.has(d));
          if (compartilha) {
            // Só é aceitável se, naquele passo, TODOS os candidatos restantes
            // (jogos de número >= i+1, 1-based) compartilhavam com o anterior.
            const restantes = ordenados.slice(i);
            const todosConflitavam = restantes.every((r) =>
              [...duplasDe(r)].some((d) => ant.has(d)),
            );
            expect(todosConflitavam).toBe(true);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe("Feature: criar-chaveamento-campeonato, Property ORD-3: determinismo", () => {
  it("numerar duas vezes produz exatamente a mesma atribuição", () => {
    fc.assert(
      fc.property(arbNG, ([n, g]) => {
        const base = gerarGrupos(n, g);
        const a = numerarJogos(base);
        const b = numerarJogos(base);
        const mapa = (x: Bracket) =>
          new Map(x.matches.map((m) => [m.id, m.ordemDisputa]));
        expect(mapa(a)).toEqual(mapa(b));
      }),
      { numRuns: 200 },
    );
  });
});

describe("Feature: criar-chaveamento-campeonato, Property ORD-4: estabilidade (já numerado não muda; só cresce)", () => {
  it("renumerar preserva os números existentes e só adiciona no fim", () => {
    fc.assert(
      fc.property(arbNG, ([n, g]) => {
        const b1 = numerarJogos(gerarGrupos(n, g));
        // Simula "novos jogos": zera o número de alguns jogos e renumera. Os que
        // ficaram devem manter o número; os zerados recebem números > max atual.
        const matches = b1.matches.map((m) => ({ ...m }));
        const numerados = matches.filter((m) => m.ordemDisputa !== null);
        // zera ~metade (os de maior número) para simular "surgiram depois"
        const ordenadosDesc = [...numerados].sort(
          (x, y) => (y.ordemDisputa as number) - (x.ordemDisputa as number),
        );
        const zerar = new Set(
          ordenadosDesc.slice(0, Math.floor(ordenadosDesc.length / 2)).map((m) => m.id),
        );
        const maxPreservado = Math.max(
          0,
          ...matches
            .filter((m) => m.ordemDisputa !== null && !zerar.has(m.id))
            .map((m) => m.ordemDisputa as number),
        );
        for (const m of matches) if (zerar.has(m.id)) m.ordemDisputa = null;

        const b2 = numerarJogos({ ...b1, matches });

        // (a) os preservados mantêm o número exato
        const antes = new Map(numerados.filter((m) => !zerar.has(m.id)).map((m) => [m.id, m.ordemDisputa]));
        for (const m of b2.matches) {
          if (antes.has(m.id)) expect(m.ordemDisputa).toBe(antes.get(m.id));
        }
        // (b) os renumerados receberam números > maxPreservado
        for (const m of b2.matches) {
          if (zerar.has(m.id)) {
            expect(m.ordemDisputa).not.toBeNull();
            expect(m.ordemDisputa as number).toBeGreaterThan(maxPreservado);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
