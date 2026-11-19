// "Próximos jogos" e passagem grupos → mata-mata: funções puras sobre
// chaveamentos gerados pelo próprio domínio.
import { describe, it, expect } from "vitest";
import type { Bracket, Pair } from "../src/domain/bracket/types";
import { gerarChaveamento } from "../src/domain/bracket/generator";
import { numerarJogos } from "../src/domain/bracket/ordenacao";
import { registrarPlacar, atualizarPlacarAoVivo } from "../src/domain/bracket/progression";
import { proximosJogos, jogoPendente, rotuloDoJogo } from "../src/domain/bracket/fila";
import {
  jogosPendentesDosGrupos,
  descreverFaltantes,
  podeGerarMataMata,
  prepararMataMata,
} from "../src/domain/bracket/matamata";

const duplas = (n: number): Pair[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`, nomeDupla: `D${i + 1}`, atletaA: `A${i + 1}`, atletaB: `B${i + 1}`,
    seed: i + 1, criadoEm: "2026-01-01T00:00:00.000Z",
  }));
const gerar = (n: number, config: Parameters<typeof gerarChaveamento>[0]["config"]): Bracket => {
  const r = gerarChaveamento({ duplas: duplas(n), config });
  if (!r.ok) throw new Error("falha ao gerar");
  return numerarJogos({ ...r.bracket, campeonatoId: "c", categoriaId: "k" });
};
const agora = "2026-11-18T10:00:00.000Z";
/** Joga um jogo: o slot A vence por 15 a 10. */
const jogar = (b: Bracket, id: string): Bracket => {
  const r = registrarPlacar(b, id, 15, 10, agora);
  if (!r.ok) throw new Error("falha ao registrar");
  return numerarJogos(r.bracket);
};

describe("proximosJogos", () => {
  it("sem chaveamento, fila vazia", () => {
    expect(proximosJogos(null)).toEqual([]);
  });
  it("lista só jogos prontos, em ordem de disputa", () => {
    const b = gerar(4, { formato: "dupla eliminação" });
    const fila = proximosJogos(b);
    expect(fila.length).toBeGreaterThan(0);
    expect(fila.every(jogoPendente)).toBe(true);
    const nums = fila.map((m) => m.ordemDisputa ?? Infinity);
    expect(nums).toEqual([...nums].sort((x, y) => x - y));
  });
  it("jogo encerrado sai da fila e o que ficou pronto entra", () => {
    let b = gerar(4, { formato: "dupla eliminação" });
    const antes = proximosJogos(b);
    b = jogar(b, antes[0].id);
    const depois = proximosJogos(b);
    expect(depois.map((m) => m.id)).not.toContain(antes[0].id);
  });
  it("jogo ao vivo vai para o topo", () => {
    const b = gerar(4, { formato: "dupla eliminação" });
    const fila = proximosJogos(b);
    const ultimo = fila[fila.length - 1];
    const r = atualizarPlacarAoVivo(b, ultimo.id, 3, 2);
    if (!r.ok) throw new Error("falha");
    expect(proximosJogos(r.bracket)[0].id).toBe(ultimo.id);
  });
  it("rotuloDoJogo", () => {
    expect(rotuloDoJogo({ ordemDisputa: 4 })).toBe("Jogo 4");
    expect(rotuloDoJogo({ ordemDisputa: null })).toBe("Jogo");
  });
});

describe("fase de grupos → mata-mata", () => {
  const cfg = { formato: "fase de grupos" as const, numeroDeGrupos: 2, classificadosPorGrupo: 2 };

  it("descreverFaltantes", () => {
    const b = gerar(8, cfg);
    const p = jogosPendentesDosGrupos(b);
    expect(descreverFaltantes([])).toBe("");
    expect(descreverFaltantes(p.slice(0, 1))).toBe(`Falta o Jogo ${p[0].ordemDisputa}`);
    expect(descreverFaltantes(p.slice(0, 3))).toBe(
      `Faltam Jogo ${p[0].ordemDisputa}, Jogo ${p[1].ordemDisputa} e Jogo ${p[2].ordemDisputa}`
    );
    expect(descreverFaltantes([{ ...p[0], ordemDisputa: null }, p[1]])).toBe("Faltam 2 jogos");
  });

  it("enquanto faltam jogos, não pode gerar e a preparação diz o que falta", () => {
    const b = gerar(8, cfg);
    expect(podeGerarMataMata(b)).toBe(false);
    const prep = prepararMataMata(b);
    expect(prep.tipo).toBe("incompleto");
    if (prep.tipo === "incompleto") expect(prep.pendentes).toHaveLength(12);
  });

  it("com todos os grupos decididos, prepara o mata-mata e mostra os cruzamentos sem gravar", () => {
    let b = gerar(8, cfg);
    for (const m of jogosPendentesDosGrupos(b)) b = jogar(b, m.id);
    expect(jogosPendentesDosGrupos(b)).toHaveLength(0);
    expect(podeGerarMataMata(b)).toBe(true);
    const copia = JSON.stringify(b);
    const prep = prepararMataMata(b);
    expect(JSON.stringify(b)).toBe(copia); // não muta
    expect(prep.tipo).toBe("pronto");
    if (prep.tipo !== "pronto") return;
    expect(prep.cruzamentos.length).toBeGreaterThanOrEqual(2);
    for (const c of prep.cruzamentos) {
      expect(c.a).not.toBe("(a definir)");
      expect(c.b).not.toBe("(a definir)");
    }
    // Os jogos de grupo e seus placares continuam no combinado.
    const grupo = prep.bracket.matches.filter((m) => m.side === "grupo");
    expect(grupo.every((m) => m.vencedorId !== null)).toBe(true);
    expect(prep.bracket.matches.some((m) => m.side !== "grupo")).toBe(true);
    expect(podeGerarMataMata(prep.bracket)).toBe(false); // já tem mata-mata
  });

  it("outros formatos nunca podem gerar mata-mata", () => {
    expect(podeGerarMataMata(gerar(4, { formato: "dupla eliminação" }))).toBe(false);
  });
});
