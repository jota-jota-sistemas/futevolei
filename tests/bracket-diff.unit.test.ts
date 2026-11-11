import { describe, it, expect } from "vitest";
import type { Pair } from "../src/domain/bracket/types";
import { gerarChaveamento } from "../src/domain/bracket/generator";
import { registrarPlacar } from "../src/domain/bracket/progression";
import { jogosAlterados } from "../src/domain/bracket/diff";

const duplas: Pair[] = Array.from({ length: 4 }, (_, i) => ({
  id: `d${i + 1}`,
  nomeDupla: `D${i + 1}`,
  atletaA: `A${i + 1}`,
  atletaB: `B${i + 1}`,
  seed: i + 1,
  criadoEm: `2025-01-01T00:00:0${i}.000Z`,
}));

describe("jogosAlterados", () => {
  const r = gerarChaveamento({ duplas, config: { formato: "eliminação simples" } });
  if (!r.ok) throw new Error(r.erro.code);

  it("sem mudança: nenhum jogo", () => {
    expect(jogosAlterados(r.bracket, r.bracket)).toEqual([]);
  });

  it("registrar um placar altera só o jogo e o destino do vencedor", () => {
    const j = r.bracket.matches.find((m) => m.a.pairId && m.b.pairId)!;
    const p = registrarPlacar(r.bracket, j.id, 10, 5, "2026-01-01T00:00:00.000Z");
    if (!p.ok) throw new Error(p.erro.code);
    const ids = jogosAlterados(r.bracket, p.bracket).map((m) => m.id).sort();
    const esperados = [j.id, j.avancaVencedorPara!.matchId].sort();
    expect(ids).toEqual(esperados);
    expect(ids.length).toBeLessThan(r.bracket.matches.length);
  });
});
