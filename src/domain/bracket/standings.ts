// src/domain/bracket/standings.ts
//
// Group_Standings: classificação determinística de um grupo da fase de grupos.
// Função PURA e DETERMINÍSTICA — sem I/O, sem relógio, sem Math.random.
//
// Pontuação: cada VITÓRIA vale 3 pontos e a derrota 0 (não há empate — o
// vencedor é quem tem o maior placar).
//
// Critérios de classificação, nesta ordem:
//   1) pontos (3 por vitória);
//   2) saldo de pontos (pontos feitos − pontos sofridos, somando as partidas);
//   3) confronto direto entre as duplas empatadas em (1) e (2) — mini-tabela de
//      vitórias considerando APENAS os jogos entre elas;
//   4) pontos feitos (pontosPro);
//   5) ordem estável pelo id da dupla — apenas para a tabela ter posições
//      únicas quando TUDO acima empata. O SEEDING NÃO é critério de desempate.
//
// Classificação PARCIAL: a tabela é calculada a cada partida concluída, sem
// esperar o grupo inteiro. Partidas sem vencedor ainda não contam. Quem ainda
// não jogou aparece com zeros.
//
// Cobre:
//   - R5.3  ordenação determinística
//   - R5.4  seleção dos X melhores por grupo (classificados) — essa, sim, só
//           existe quando o grupo está COMPLETO.

import type { Group, Match, PairId, Standing } from "./types";

/** Pontos por vitória. */
export const PONTOS_POR_VITORIA = 3;

/**
 * Verdadeiro sse TODOS os jogos do grupo têm vencedor registrado.
 *
 * `jogos` deve conter os jogos cujo id aparece em `grupo.jogos`. Jogos de fora
 * do grupo são ignorados. Um grupo sem jogos (degenerado) é considerado
 * completo (não há nada pendente).
 */
export function grupoCompleto(
  grupo: Group,
  jogos: ReadonlyArray<Match>,
): boolean {
  const porId = new Map<string, Match>();
  for (const j of jogos) porId.set(j.id, j);
  for (const matchId of grupo.jogos) {
    const jogo = porId.get(matchId);
    // Jogo ausente ou sem vencedor registrado ⇒ grupo incompleto.
    if (!jogo || jogo.vencedorId === null) return false;
  }
  return true;
}

/**
 * Classifica as duplas de um grupo (R5.3), considerando apenas as partidas JÁ
 * decididas. Sempre devolve a tabela completa, ordenada, com `posicao` 1..g —
 * inclusive quando o grupo ainda está em andamento (classificação parcial).
 *
 * @param grupo  O grupo a classificar (usa `duplas` e `jogos`).
 * @param jogos  Jogos do grupo (ao menos os referenciados em `grupo.jogos`).
 */
export function classificarGrupo(
  grupo: Group,
  jogos: ReadonlyArray<Match>,
): Standing[] {
  const porId = new Map<string, Match>();
  for (const j of jogos) porId.set(j.id, j);

  // Jogos efetivos do grupo JÁ decididos (na ordem de `grupo.jogos`).
  const decididos: Match[] = [];
  for (const matchId of grupo.jogos) {
    const jogo = porId.get(matchId);
    if (jogo && jogo.vencedorId !== null) decididos.push(jogo);
  }

  // Métricas por dupla.
  interface Metricas {
    jogos: number;
    vitorias: number;
    pontos: number;
    pontosPro: number;
    pontosContra: number;
  }
  const metricas = new Map<PairId, Metricas>();
  for (const pairId of grupo.duplas) {
    metricas.set(pairId, {
      jogos: 0,
      vitorias: 0,
      pontos: 0,
      pontosPro: 0,
      pontosContra: 0,
    });
  }

  for (const jogo of decididos) {
    const a = jogo.a.pairId;
    const b = jogo.b.pairId;
    if (a === null || b === null) continue;
    const ma = metricas.get(a);
    const mb = metricas.get(b);
    if (!ma || !mb) continue;

    ma.jogos += 1;
    mb.jogos += 1;

    if (jogo.placarA !== null && jogo.placarB !== null) {
      ma.pontosPro += jogo.placarA;
      ma.pontosContra += jogo.placarB;
      mb.pontosPro += jogo.placarB;
      mb.pontosContra += jogo.placarA;
    }

    const vencedor = jogo.vencedorId === a ? ma : jogo.vencedorId === b ? mb : null;
    if (vencedor) {
      vencedor.vitorias += 1;
      vencedor.pontos += PONTOS_POR_VITORIA;
    }
  }

  const saldoDe = (pairId: PairId): number => {
    const m = metricas.get(pairId) as Metricas;
    return m.pontosPro - m.pontosContra;
  };

  /**
   * Vitórias de `pairId` considerando SOMENTE os jogos entre as duplas do
   * conjunto `entre` (confronto direto / mini-tabela). Determinística.
   */
  const vitoriasDiretas = (pairId: PairId, entre: ReadonlySet<PairId>): number => {
    let total = 0;
    for (const jogo of decididos) {
      if (jogo.vencedorId !== pairId) continue;
      const a = jogo.a.pairId;
      const b = jogo.b.pairId;
      if (a === null || b === null) continue;
      if (entre.has(a) && entre.has(b)) total += 1;
    }
    return total;
  };

  const ordenadas = [...grupo.duplas].sort((x, y) => {
    const mx = metricas.get(x) as Metricas;
    const my = metricas.get(y) as Metricas;

    // 1) pontos
    if (mx.pontos !== my.pontos) return my.pontos - mx.pontos;

    // 2) saldo de pontos
    const sx = saldoDe(x);
    const sy = saldoDe(y);
    if (sx !== sy) return sy - sx;

    // 3) confronto direto entre as empatadas em (1) e (2)
    const empatadas = new Set<PairId>();
    for (const pairId of grupo.duplas) {
      if (
        (metricas.get(pairId) as Metricas).pontos === mx.pontos &&
        saldoDe(pairId) === sx
      ) {
        empatadas.add(pairId);
      }
    }
    const dx = vitoriasDiretas(x, empatadas);
    const dy = vitoriasDiretas(y, empatadas);
    if (dx !== dy) return dy - dx;

    // 4) pontos feitos
    if (mx.pontosPro !== my.pontosPro) return my.pontosPro - mx.pontosPro;

    // 5) ordem estável (NÃO é seeding): só garante posições únicas.
    return x.localeCompare(y);
  });

  return ordenadas.map((pairId, indice) => {
    const m = metricas.get(pairId) as Metricas;
    return {
      pairId,
      jogos: m.jogos,
      vitorias: m.vitorias,
      pontos: m.pontos,
      pontosPro: m.pontosPro,
      saldo: m.pontosPro - m.pontosContra,
      posicao: indice + 1,
    };
  });
}

/**
 * Seleciona os X melhores colocados de um grupo (os Classificados), usados na
 * transição grupos→mata-mata (R5.4).
 *
 * Os classificados só são definitivos quando o grupo está COMPLETO: retorna
 * `null` se ainda há jogo sem vencedor. Se `quantidade` exceder o número de
 * duplas, devolve todas; se for ≤ 0, devolve lista vazia.
 */
export function selecionarClassificados(
  grupo: Group,
  jogos: ReadonlyArray<Match>,
  quantidade: number,
): Standing[] | null {
  if (!grupoCompleto(grupo, jogos)) return null;
  if (quantidade <= 0) return [];
  return classificarGrupo(grupo, jogos).slice(0, quantidade);
}
