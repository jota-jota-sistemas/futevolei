// Feature: criar-chaveamento-campeonato — Property tests do formato ELIMINAÇÃO SIMPLES.
//
// A eliminação simples é a chave única (side "upper") da dupla eliminação, SEM
// chave de perdedores e SEM grande final: quem perde é eliminado. Estas
// propriedades fixam as invariantes estruturais do formato e o round-trip.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { gerarChaveamento } from "../src/domain/bracket/generator";
import { registrarVencedor } from "../src/domain/bracket/progression";
import { serializar, desserializar } from "../src/domain/bracket/serializer";
import type { Bracket, Match, Pair, PairId } from "../src/domain/bracket/types";

const AGORA = "2026-01-01T00:00:00.000Z";

/** N duplas com seeds consecutivos 1..N e ids/nomes determinísticos. */
function duplas(n: number): Pair[] {
  return Array.from({ length: n }, (_, i) => {
    const seed = i + 1;
    return {
      id: `d${seed}`,
      nomeDupla: `Dupla ${String(seed).padStart(3, "0")}`,
      atletaA: `A${seed}`,
      atletaB: `B${seed}`,
      seed,
      criadoEm: `2026-01-01T00:00:${String(seed % 60).padStart(2, "0")}.000Z`,
    };
  });
}

function gerar(n: number): Bracket {
  const r = gerarChaveamento({ duplas: duplas(n), config: { formato: "eliminação simples" } });
  if (!r.ok) throw new Error("gen falhou: " + r.erro.code);
  return r.bracket;
}

function proximaPotenciaDeDois(n: number): number {
  let s = 1;
  while (s < n) s *= 2;
  return s;
}

/** Jogo pronto (fora de grupo): ambas as duplas definidas, sem bye, sem vencedor. */
function pronto(j: Match): boolean {
  return (
    j.vencedorId === null &&
    j.side !== "grupo" &&
    j.a.pairId !== null && j.a.bye !== true &&
    j.b.pairId !== null && j.b.bye !== true
  );
}

/** "Joga" o mata-mata inteiro (vence sempre o slot A) até o fim. */
function jogarAteOFim(b: Bracket): Bracket {
  let atual = b;
  const teto = atual.matches.length * 4 + 10;
  let passos = 0;
  while (passos < teto) {
    const alvo = atual.matches.find(pronto);
    if (!alvo) break;
    const r = registrarVencedor(atual, alvo.id, alvo.a.pairId as PairId, AGORA);
    if (!r.ok) throw new Error("registrar falhou: " + r.erro.code);
    atual = r.bracket;
    passos++;
  }
  return atual;
}

const arbN = fc.integer({ min: 2, max: 64 });

describe("Feature: criar-chaveamento-campeonato, Property ES-1: eliminação simples só tem side upper e N−1 jogos decisivos", () => {
  // Validates: regra de negócio — mata-mata de eliminação simples
  it("não há jogos de lower nem grande-final; total de decisivos é N−1", () => {
    fc.assert(
      fc.property(arbN, (n) => {
        const b = gerar(n);
        expect(b.formato).toBe("eliminação simples");
        expect(b.matches.some((m) => m.side === "lower")).toBe(false);
        expect(b.matches.some((m) => m.side === "grande-final")).toBe(false);
        // Decisivos: nenhum lado bye.
        const decisivos = b.matches.filter((m) => m.a.bye !== true && m.b.bye !== true);
        expect(decisivos.length).toBe(n - 1);
      }),
      { numRuns: 200 },
    );
  });
});

describe("Feature: criar-chaveamento-campeonato, Property ES-2: cada dupla aparece 1x na 1ª rodada", () => {
  it("os participantes reais da 1ª rodada são exatamente o conjunto cadastrado", () => {
    fc.assert(
      fc.property(arbN, (n) => {
        const b = gerar(n);
        const r1 = b.matches.filter((m) => m.side === "upper" && m.rodada === 1);
        const reais = new Set<string>();
        for (const j of r1) {
          for (const slot of [j.a, j.b]) {
            if (slot.bye !== true && slot.pairId !== null) {
              expect(reais.has(slot.pairId)).toBe(false); // 1x
              reais.add(slot.pairId);
            }
          }
        }
        expect(reais).toEqual(new Set(b.duplas.map((d) => d.id)));
      }),
      { numRuns: 200 },
    );
  });
});

describe("Feature: criar-chaveamento-campeonato, Property ES-3: byes completam a potência de dois nas melhores cabeças", () => {
  it("byes = (próxima potência de 2 ≥ N) − N, adversários são as melhores cabeças", () => {
    fc.assert(
      fc.property(arbN, (n) => {
        const b = gerar(n);
        const r1 = b.matches.filter((m) => m.side === "upper" && m.rodada === 1);
        const seedDe = new Map(b.duplas.map((d) => [d.id, d.seed]));
        const adversariosDeBye: number[] = [];
        let byes = 0;
        for (const j of r1) {
          if (j.a.bye === true) { byes++; adversariosDeBye.push(seedDe.get(j.b.pairId as string)!); }
          if (j.b.bye === true) { byes++; adversariosDeBye.push(seedDe.get(j.a.pairId as string)!); }
        }
        expect(byes).toBe(proximaPotenciaDeDois(n) - n);
        // Os adversários de bye são exatamente as B melhores cabeças {1..B}.
        expect(adversariosDeBye.sort((x, y) => x - y)).toEqual(
          Array.from({ length: byes }, (_, i) => i + 1),
        );
      }),
      { numRuns: 200 },
    );
  });
});

describe("Feature: criar-chaveamento-campeonato, Property ES-4: determinismo e campeã da final", () => {
  it("geração é determinística e a campeã é a vencedora da final (único upper sem avanço)", () => {
    fc.assert(
      fc.property(arbN, (n) => {
        const a = gerar(n);
        const b = gerar(n);
        expect(b).toEqual(a);

        const jogado = jogarAteOFim(a);
        const final = jogado.matches.find((m) => m.side === "upper" && !m.avancaVencedorPara);
        expect(final).toBeDefined();
        expect(final!.vencedorId).not.toBeNull();
        expect(jogado.campeaId).toBe(final!.vencedorId);
      }),
      { numRuns: 200 },
    );
  });
});

describe("Feature: criar-chaveamento-campeonato, Property ES-5: round-trip de serialização", () => {
  it("desserializar(serializar(b)) === b, gerado e em progresso", () => {
    fc.assert(
      fc.property(arbN, (n) => {
        const b = gerar(n);
        expect(desserializar(serializar(b))).toEqual(b);
        const jogado = jogarAteOFim(b);
        expect(desserializar(serializar(jogado))).toEqual(jogado);
      }),
      { numRuns: 200 },
    );
  });
});
