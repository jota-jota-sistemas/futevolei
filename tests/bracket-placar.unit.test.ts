// Testes de exemplo — placar das partidas (vencedor derivado, 3 pts/vitória,
// desempate por saldo, sem influência de seeding, persistência do placar).
import { describe, it, expect } from "vitest";
import type { Bracket, Match, Pair } from "../src/domain/bracket/types";
import { gerarChaveamento } from "../src/domain/bracket/generator";
import { registrarPlacar } from "../src/domain/bracket/progression";
import { classificarGrupo } from "../src/domain/bracket/standings";
import { serializar, desserializar } from "../src/domain/bracket/serializer";
import { jogoRowParaMatch, matchParaJogoRow } from "../src/store/mappers";

const AGORA = "2026-01-01T00:00:00.000Z";

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

function gerar(n: number, config: Parameters<typeof gerarChaveamento>[0]["config"]): Bracket {
  const r = gerarChaveamento({ duplas: duplas(n), config });
  if (!r.ok) throw new Error(r.erro.code);
  return r.bracket;
}

/** Jogo do grupo entre duas duplas (em qualquer ordem de slot). */
function jogoEntre(b: Bracket, x: string, y: string): Match {
  const j = b.matches.find(
    (m) =>
      m.side === "grupo" &&
      ((m.a.pairId === x && m.b.pairId === y) || (m.a.pairId === y && m.b.pairId === x)),
  );
  if (!j) throw new Error("jogo não encontrado");
  return j;
}

/** Registra placar "x ganha de y por pf a pc". */
function jogar(b: Bracket, x: string, y: string, pf: number, pc: number): Bracket {
  const j = jogoEntre(b, x, y);
  const [pa, pb] = j.a.pairId === x ? [pf, pc] : [pc, pf];
  const r = registrarPlacar(b, j.id, pa, pb, AGORA);
  if (!r.ok) throw new Error(r.erro.code);
  return r.bracket;
}

describe("registrarPlacar", () => {
  const base = gerar(3, { formato: "fase de grupos", numeroDeGrupos: 1 });
  const j0 = base.matches[0];

  it("deriva o vencedor do maior placar e guarda o placar", () => {
    const r = registrarPlacar(base, j0.id, 15, 12, AGORA);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const j = r.bracket.matches.find((m) => m.id === j0.id)!;
    expect(j.vencedorId).toBe(j0.a.pairId);
    expect([j.placarA, j.placarB]).toEqual([15, 12]);

    const r2 = registrarPlacar(base, j0.id, 3, 11, AGORA);
    if (!r2.ok) throw new Error("falhou");
    expect(r2.bracket.matches.find((m) => m.id === j0.id)!.vencedorId).toBe(j0.b.pairId);
  });

  it("rejeita empate e placares inválidos, sem mutar a entrada", () => {
    const antes = JSON.stringify(base);
    const empate = registrarPlacar(base, j0.id, 10, 10, AGORA);
    expect(empate.ok).toBe(false);
    if (!empate.ok) expect(empate.erro.code).toBe("PLACAR_EMPATE");

    for (const [a, b] of [[-1, 5], [5, 1.5], [Number.NaN, 3]]) {
      const r = registrarPlacar(base, j0.id, a, b, AGORA);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.erro.code).toBe("PLACAR_INVALIDO");
    }
    expect(JSON.stringify(base)).toBe(antes);
  });

  it("corrigir o vencedor invalida o mata-mata dependente e limpa seus placares", () => {
    const b = gerar(4, { formato: "eliminação simples" });
    const semi = b.matches.filter((m) => m.a.pairId && m.b.pairId && !m.a.bye && !m.b.bye);
    let atual = b;
    for (const m of semi) {
      const r = registrarPlacar(atual, m.id, 10, 5, AGORA);
      if (!r.ok) throw new Error(r.erro.code);
      atual = r.bracket;
    }
    const final = atual.matches.find(
      (m) => m.vencedorId === null && m.a.pairId && m.b.pairId,
    )!;
    const rf = registrarPlacar(atual, final.id, 9, 7, AGORA);
    if (!rf.ok) throw new Error(rf.erro.code);
    expect(rf.bracket.matches.find((m) => m.id === final.id)!.placarA).toBe(9);

    // Corrige a 1ª semifinal para o outro lado vencer → final é invalidada.
    const corr = registrarPlacar(rf.bracket, semi[0].id, 5, 10, AGORA);
    if (!corr.ok) throw new Error(corr.erro.code);
    const f = corr.bracket.matches.find((m) => m.id === final.id)!;
    expect(f.vencedorId).toBeNull();
    expect([f.placarA, f.placarB]).toEqual([null, null]);
  });
});

describe("classificação por pontos e saldo", () => {
  it("3 pontos por vitória e tabela parcial durante o grupo", () => {
    let b = gerar(3, { formato: "fase de grupos", numeroDeGrupos: 1 });
    b = jogar(b, "d3", "d1", 15, 10);
    const t = classificarGrupo(b.grupos[0], b.matches);
    expect(t[0]).toMatchObject({ pairId: "d3", pontos: 3, vitorias: 1, saldo: 5, posicao: 1 });
    expect(t.find((s) => s.pairId === "d1")).toMatchObject({ pontos: 0, saldo: -5, jogos: 1 });
    expect(t.find((s) => s.pairId === "d2")).toMatchObject({ jogos: 0, saldo: 0 });
  });

  it("empate em pontos é decidido pelo saldo, não pelo seeding", () => {
    // Triângulo: d1>d2, d2>d3, d3>d1 (1 vitória cada). Saldo decide.
    let b = gerar(3, { formato: "fase de grupos", numeroDeGrupos: 1 });
    b = jogar(b, "d1", "d2", 15, 14); // d1 +1, d2 -1
    b = jogar(b, "d2", "d3", 15, 5); //  d2 +10, d3 -10
    b = jogar(b, "d3", "d1", 15, 13); // d3 +2, d1 -2
    // saldos: d1 = +1 -2 = -1; d2 = -1 +10 = +9; d3 = -10 +2 = -8
    const t = classificarGrupo(b.grupos[0], b.matches);
    expect(t.map((s) => s.pairId)).toEqual(["d2", "d1", "d3"]);
    expect(t.map((s) => s.pontos)).toEqual([3, 3, 3]);
  });
});

describe("persistência do placar", () => {
  it("round-trip do serializer preserva placar", () => {
    const b = gerar(3, { formato: "fase de grupos", numeroDeGrupos: 1 });
    const r = registrarPlacar(b, b.matches[0].id, 15, 9, AGORA);
    if (!r.ok) throw new Error(r.erro.code);
    const volta = desserializar(JSON.parse(JSON.stringify(serializar(r.bracket))));
    expect(volta).toEqual(r.bracket);
  });

  it("mappers de jogos leem/escrevem placar_a/placar_b", () => {
    const b = gerar(3, { formato: "fase de grupos", numeroDeGrupos: 1 });
    const r = registrarPlacar(b, b.matches[0].id, 15, 9, AGORA);
    if (!r.ok) throw new Error(r.erro.code);
    const m = r.bracket.matches[0];
    const row = matchParaJogoRow(m, "chav-1");
    expect([row.placar_a, row.placar_b]).toEqual([15, 9]);
    const m2 = jogoRowParaMatch(row);
    expect([m2.placarA, m2.placarB]).toEqual([15, 9]);
  });
});
