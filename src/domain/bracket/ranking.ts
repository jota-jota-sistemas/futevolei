// src/domain/bracket/ranking.ts
//
// Ranking final de uma categoria: a posição que cada dupla ficou. Função PURA.
//
// Critérios (nesta ordem):
//   1) quem foi mais longe no chaveamento;
//   2) vitórias (jogos disputados de verdade, sem contar walkover);
//   3) pontos feitos (soma dos placares da dupla, grupos e mata-mata).
// Duplas empatadas nos três critérios dividem a mesma posição (ex.: dois 5º).
//
// "Mais longe" vira um número (`fase`), maior = mais longe:
//   - eliminada na fase de grupos (nunca chegou ao mata-mata): 0;
//   - eliminada num jogo sem "segunda chance" (chave única, ou chave de
//     perdedores): o número da rodada em que caiu;
//   - perdeu a final: (rodada da última disputa) + 1; campeã: +1 sobre isso.
//   Na dupla eliminação quem cai na chave de vencedores vai para a de
//   perdedores e só é eliminada ao perder lá, então o que conta é a rodada da
//   chave de perdedores (e a grande final acima de todas).
//
// O ranking só existe quando o campeonato terminou (a final foi decidida);
// antes disso devolve `null`.

import type { Bracket, Match, PairId } from "./types";
import { rotuloDupla } from "../pairs/nome";

export interface LinhaRanking {
  pairId: PairId;
  /** Posição final (1 = campeã). Duplas empatadas dividem a mesma posição. */
  posicao: number;
  vitorias: number;
  pontosPro: number;
  /** Onde a dupla parou, em texto ("Campeã", "Eliminada na semifinal"...). */
  etapa: string;
}

/** A final do campeonato: grande final, ou a final da chave única. */
function acharFinal(matches: ReadonlyArray<Match>): Match | undefined {
  const gf = matches.find((m) => m.side === "grande-final");
  if (gf) return gf;
  const uppers = matches.filter(
    (m) => m.side === "upper" && !m.avancaVencedorPara && !m.encaminhaPerdedorPara,
  );
  return uppers.sort((a, b) => b.rodada - a.rodada)[0];
}

function etapaEliminadaNaChaveUnica(rodada: number, ultima: number): string {
  const faltam = ultima - rodada; // 0 = final
  if (faltam === 1) return "Eliminada na semifinal";
  if (faltam === 2) return "Eliminada nas quartas de final";
  if (faltam === 3) return "Eliminada nas oitavas de final";
  return `Eliminada na rodada ${rodada} do mata-mata`;
}

export function rankingFinal(bracket: Bracket): LinhaRanking[] | null {
  const final = acharFinal(bracket.matches);
  if (!final || final.vencedorId === null) return null;

  const mataMata = bracket.matches.filter((m) => m.side !== "grupo");
  const maxRodada = (side: Match["side"]): number =>
    Math.max(0, ...bracket.matches.filter((m) => m.side === side).map((m) => m.rodada));
  const ultimaUpper = maxRodada("upper");
  const ultimaLower = maxRodada("lower");

  /** `fase` de quem perde `m` e fica eliminada ali. */
  const faseDeQuemCai = (m: Match): number =>
    m.side === "grande-final" ? ultimaLower + 1 : m.rodada;

  const fase = new Map<PairId, number>();
  const etapa = new Map<PairId, string>();

  // Quem chegou ao mata-mata; as demais caíram na fase de grupos (se houver).
  for (const d of bracket.duplas) {
    fase.set(d.id, 0);
    etapa.set(d.id, bracket.grupos.length > 0 ? "Eliminada na fase de grupos" : "Eliminada");
  }
  for (const m of mataMata) {
    for (const p of [m.a.pairId, m.b.pairId]) {
      if (p !== null && fase.has(p) && fase.get(p) === 0) {
        fase.set(p, 0.5); // jogou o mata-mata, mas ainda sem saber onde caiu
      }
    }
  }

  // Quem perde um jogo sem "segunda chance" fica eliminada nele.
  for (const m of mataMata) {
    if (m.vencedorId === null) continue;
    const a = m.a.pairId;
    const b = m.b.pairId;
    if (a === null || b === null) continue; // walkover: não há perdedor
    const perdedor = m.vencedorId === a ? b : a;
    if (m.encaminhaPerdedorPara) continue; // cai para a chave de perdedores
    const ehFinal = m.id === final.id;
    fase.set(perdedor, faseDeQuemCai(m));
    etapa.set(
      perdedor,
      ehFinal
        ? "Vice-campeã"
        : m.side === "lower"
          ? `Eliminada na rodada ${m.rodada} da chave de perdedores`
          : etapaEliminadaNaChaveUnica(m.rodada, ultimaUpper),
    );
  }

  const campea = final.vencedorId;
  fase.set(campea, faseDeQuemCai(final) + 1);
  etapa.set(campea, "Campeã");

  // Vitórias e pontos feitos: só jogos disputados (as duas duplas presentes).
  const vitorias = new Map<PairId, number>();
  const pontos = new Map<PairId, number>();
  for (const m of bracket.matches) {
    const a = m.a.pairId;
    const b = m.b.pairId;
    if (a === null || b === null || m.vencedorId === null) continue;
    pontos.set(a, (pontos.get(a) ?? 0) + (m.placarA ?? 0));
    pontos.set(b, (pontos.get(b) ?? 0) + (m.placarB ?? 0));
    vitorias.set(m.vencedorId, (vitorias.get(m.vencedorId) ?? 0) + 1);
  }

  const nomes = new Map(bracket.duplas.map((d) => [d.id, rotuloDupla(d)]));
  const linhas = bracket.duplas.map((d) => ({
    pairId: d.id,
    fase: fase.get(d.id) ?? 0,
    vitorias: vitorias.get(d.id) ?? 0,
    pontosPro: pontos.get(d.id) ?? 0,
    etapa: etapa.get(d.id) ?? "",
  }));

  linhas.sort(
    (x, y) =>
      y.fase - x.fase ||
      y.vitorias - x.vitorias ||
      y.pontosPro - x.pontosPro ||
      (nomes.get(x.pairId) ?? "").localeCompare(nomes.get(y.pairId) ?? ""),
  );

  // Posição: quem empata nos três critérios divide a posição (1, 2, 3, 3, 5...).
  let posicao = 0;
  return linhas.map((l, i) => {
    const anterior = linhas[i - 1];
    const empate =
      anterior !== undefined &&
      anterior.fase === l.fase &&
      anterior.vitorias === l.vitorias &&
      anterior.pontosPro === l.pontosPro;
    if (!empate) posicao = i + 1;
    return {
      pairId: l.pairId,
      posicao,
      vitorias: l.vitorias,
      pontosPro: l.pontosPro,
      etapa: l.etapa,
    };
  });
}
