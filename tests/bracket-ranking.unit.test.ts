// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import type { Bracket, Pair } from "../src/domain/bracket/types";
import { gerarChaveamento, posicionarClassificadosNoMataMata } from "../src/domain/bracket/generator";
import { registrarPlacar } from "../src/domain/bracket/progression";
import { rankingFinal } from "../src/domain/bracket/ranking";
import { renderBracketClient } from "../src/components/bracket/renderBracketClient";

const AGORA = "2026-01-01T00:00:00.000Z";

function duplas(n: number): Pair[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `d${i + 1}`,
    nomeDupla: `D${i + 1}`,
    atletaA: `A${i + 1}`,
    atletaB: `B${i + 1}`,
    seed: i + 1,
    criadoEm: `2025-01-01T00:00:${String(i).padStart(2, "0")}.000Z`,
  }));
}

function gerar(n: number, config: Parameters<typeof gerarChaveamento>[0]["config"]): Bracket {
  const r = gerarChaveamento({ duplas: duplas(n), config });
  if (!r.ok) throw new Error(r.erro.code);
  return r.bracket;
}

/** Disputa todos os jogos prontos até acabar; o lado A sempre vence por 15 x 10. */
function jogarTudo(inicio: Bracket, filtro: (m: Bracket["matches"][number]) => boolean = () => true): Bracket {
  let b = inicio;
  for (let guarda = 0; guarda < 500; guarda++) {
    const m = b.matches.find((x) => filtro(x) && x.vencedorId === null && x.a.pairId && x.b.pairId);
    if (!m) break;
    const r = registrarPlacar(b, m.id, 15, 10, AGORA);
    if (!r.ok) throw new Error(r.erro.code);
    b = r.bracket;
  }
  return b;
}

describe("ranking final", () => {
  it("só existe quando a final foi decidida", () => {
    const b = gerar(4, { formato: "eliminação simples" });
    expect(rankingFinal(b)).toBeNull();
    const parcial = jogarTudo(b, (m) => m.rodada === 1);
    expect(rankingFinal(parcial)).toBeNull();
  });

  it("eliminação simples: campeã, vice, depois semifinalistas (vitórias e pontos desempatam)", () => {
    const fim = jogarTudo(gerar(4, { formato: "eliminação simples" }));
    const rk = rankingFinal(fim)!;
    expect(rk).toHaveLength(4);
    expect(rk[0]).toMatchObject({ posicao: 1, etapa: "Campeã" });
    expect(rk[1]).toMatchObject({ posicao: 2, etapa: "Vice-campeã" });
    expect(rk[0].pairId).toBe(fim.campeaId);
    // Os dois eliminados na semifinal: cada um tem 0 vitórias, 10 pontos => dividem o 3º lugar.
    expect(rk[2]).toMatchObject({ posicao: 3, etapa: "Eliminada na semifinal", vitorias: 0, pontosPro: 10 });
    expect(rk[3].posicao).toBe(3);
  });

  it("critério 1 vale mais que vitórias: quem foi mais longe fica na frente", () => {
    const fim = jogarTudo(gerar(8, { formato: "eliminação simples" }));
    const rk = rankingFinal(fim)!;
    const fases = rk.map((l) => l.etapa);
    expect(fases.indexOf("Eliminada na semifinal")).toBeLessThan(fases.indexOf("Eliminada nas quartas de final"));
    expect(rk.map((l) => l.posicao)).toEqual([1, 2, 3, 3, 5, 5, 5, 5]);
  });

  it("dupla eliminação: campeã, vice (perdeu a grande final) e depois pela chave de perdedores", () => {
    const fim = jogarTudo(gerar(6, { formato: "dupla eliminação" }));
    expect(fim.campeaId).not.toBeNull();
    const rk = rankingFinal(fim)!;
    expect(rk).toHaveLength(6);
    expect(new Set(rk.map((l) => l.pairId)).size).toBe(6);
    expect(rk[0]).toMatchObject({ posicao: 1, etapa: "Campeã", pairId: fim.campeaId });
    expect(rk[1]).toMatchObject({ posicao: 2, etapa: "Vice-campeã" });
    // 6 duplas têm semifinais cruzadas: os dois eliminados nelas dividem o 3º lugar.
    expect(rk[2]).toMatchObject({ posicao: 3, etapa: "Eliminada na semifinal" });
    expect(rk[3]).toMatchObject({ posicao: 3, etapa: "Eliminada na semifinal" });
    expect(rk[4].etapa).toMatch(/chave de perdedores/);
    // Posições nunca diminuem ao longo da lista.
    for (let i = 1; i < rk.length; i++) expect(rk[i].posicao).toBeGreaterThanOrEqual(rk[i - 1].posicao);
  });

  it("fase de grupos: quem não passou do grupo fica atrás de todo o mata-mata, e a campeã é definida", () => {
    let b = gerar(6, { formato: "fase de grupos", numeroDeGrupos: 2, classificadosPorGrupo: 2 });
    b = jogarTudo(b, (m) => m.side === "grupo");
    const cls = b.grupos.flatMap((g) =>
      g.duplas.slice(0, 2).map((id, i) => ({ pair: b.duplas.find((d) => d.id === id)!, grupoId: g.id, posicaoNoGrupo: i + 1 })),
    );
    const pos = posicionarClassificadosNoMataMata(cls, b.config);
    if (!pos.ok) throw new Error(pos.erro.code);
    let combinado: Bracket = {
      ...b,
      matches: [...b.matches.filter((m) => m.side === "grupo"), ...pos.bracket.matches.filter((m) => m.side !== "grupo")],
    };
    expect(rankingFinal(combinado)).toBeNull(); // mata-mata ainda não jogado
    combinado = jogarTudo(combinado);

    // Correção: a campeã passa a ser definida também depois da fase de grupos.
    expect(combinado.campeaId).not.toBeNull();

    const rk = rankingFinal(combinado)!;
    expect(rk).toHaveLength(6);
    expect(rk[0].etapa).toBe("Campeã");
    const ultimas = rk.slice(-2);
    expect(ultimas.every((l) => l.etapa === "Eliminada na fase de grupos")).toBe(true);
    expect(rk.slice(0, 4).every((l) => l.etapa !== "Eliminada na fase de grupos")).toBe(true);
  });

  it("corrigir uma semifinal depois da final limpa a campeã (chave única)", () => {
    const fim = jogarTudo(gerar(4, { formato: "eliminação simples" }));
    expect(fim.campeaId).not.toBeNull();
    const semi = fim.matches.find((m) => m.side === "upper" && m.rodada === 1)!;
    const r = registrarPlacar(fim, semi.id, 5, 15, AGORA); // inverte o vencedor
    if (!r.ok) throw new Error(r.erro.code);
    expect(r.bracket.campeaId).toBeNull();
    expect(rankingFinal(r.bracket)).toBeNull();
  });
});

describe("ranking final na tela", () => {
  it("aparece embaixo do chaveamento só quando o campeonato termina", () => {
    const b = gerar(4, { formato: "eliminação simples" });
    expect(renderBracketClient(b).querySelector(".ranking-final")).toBeNull();

    const fim = jogarTudo(b);
    const view = renderBracketClient(fim);
    const ranking = view.querySelector(".ranking-final");
    expect(ranking).not.toBeNull();
    // Fica depois do chaveamento (último bloco da visualização).
    expect(view.lastElementChild).toBe(ranking);
    const linhas = view.querySelectorAll(".ranking-final__linha");
    expect(linhas).toHaveLength(4);
    expect(linhas[0].querySelector(".ranking-final__pos")?.textContent).toBe("1º");
    expect(linhas[0].querySelector(".ranking-final__etapa")?.textContent).toBe("Campeã");
    expect(linhas[0].querySelector(".ranking-final__dupla")?.textContent).toMatch(/ & /);
  });
});

describe("dupla eliminação: semifinais cruzadas (5+ duplas)", () => {
  const b = gerar(8, { formato: "dupla eliminação" });
  const porId = new Map(b.matches.map((m) => [m.id, m]));
  const fontesDe = (id: string) =>
    b.matches.filter((m) => m.avancaVencedorPara?.matchId === id);

  it("as semifinais cruzam as chaves em metades opostas: G1 × P2 e G2 × P1", () => {
    const semis = b.matches.filter((m) => m.side === "grande-final" && m.rodada === 1);
    expect(semis).toHaveLength(2);

    const [semiA, semiB] = semis.sort((x, y) => x.ordem - y.ordem);
    const dados = (semi: typeof semiA) => {
      const g = fontesDe(semi.id).find((m) => m.side === "upper")!;
      const p = fontesDe(semi.id).find((m) => m.side === "lower")!;
      return { g, p };
    };
    const A = dados(semiA);
    const B = dados(semiB);
    // Cada semifinal junta UM finalista da chave de vencedores e UM sobrevivente da de perdedores.
    expect(A.g.id).not.toBe(B.g.id);
    expect(A.p.id).not.toBe(B.p.id);
    // Metades opostas: o sobrevivente de perdedores de cada semifinal vem da metade do OUTRO G.
    // (ordem 0 da penúltima rodada de cada chave = metade 0; ordem 1 = metade 1)
    expect(A.g.ordem).toBe(0);
    expect(A.p.ordem).toBe(1);
    expect(B.g.ordem).toBe(1);
    expect(B.p.ordem).toBe(0);
    // Os dois vencedores vão para a grande final.
    expect(semiA.avancaVencedorPara?.matchId).toBe(semiB.avancaVencedorPara?.matchId);
    const final = porId.get(semiA.avancaVencedorPara!.matchId)!;
    expect(final.rodada).toBe(2);
    expect(final.avancaVencedorPara).toBeUndefined();
  });

  it("não existe final da chave de vencedores nem as duas últimas rodadas da de perdedores", () => {
    const ultimaUpper = Math.max(...b.matches.filter((m) => m.side === "upper").map((m) => m.rodada));
    expect(ultimaUpper).toBe(2); // 8 duplas: U1 e U2 (a U3 que seria a final não existe)
    const ultimaLower = Math.max(...b.matches.filter((m) => m.side === "lower").map((m) => m.rodada));
    expect(ultimaLower).toBe(2); // L1 e L2 (L3 e L4 viraram semifinais)
  });

  it("para qualquer tamanho de 2 a 40 duplas o campeonato termina com campeã e ranking", () => {
    for (let n = 2; n <= 40; n++) {
      const fim = jogarTudo(gerar(n, { formato: "dupla eliminação" }));
      expect(fim.campeaId, `n=${n}`).not.toBeNull();
      const rk = rankingFinal(fim)!;
      expect(rk, `n=${n}`).not.toBeNull();
      expect(rk).toHaveLength(n);
      expect(rk[0]).toMatchObject({ posicao: 1, etapa: "Campeã", pairId: fim.campeaId });
      expect(rk[1].etapa).toBe("Vice-campeã");
    }
  });

  it("semifinal não define campeã: só a final", () => {
    let atual = gerar(8, { formato: "dupla eliminação" });
    // Joga tudo menos a final.
    for (let g = 0; g < 100; g++) {
      const m = atual.matches.find(
        (x) => x.vencedorId === null && x.a.pairId && x.b.pairId && !(x.side === "grande-final" && x.rodada === 2),
      );
      if (!m) break;
      const r = registrarPlacar(atual, m.id, 15, 10, AGORA);
      if (!r.ok) throw new Error(r.erro.code);
      atual = r.bracket;
    }
    const semis = atual.matches.filter((x) => x.side === "grande-final" && x.rodada === 1);
    expect(semis.every((s) => s.vencedorId !== null)).toBe(true);
    expect(atual.campeaId).toBeNull();
    expect(rankingFinal(atual)).toBeNull();
  });
});
