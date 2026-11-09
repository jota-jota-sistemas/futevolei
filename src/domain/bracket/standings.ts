// src/domain/bracket/standings.ts
//
// Group_Standings: classificação determinística de um grupo da fase de grupos.
// Função PURA e DETERMINÍSTICA — sem I/O, sem relógio, sem Math.random.
//
// Regra de desempate (R5.3), aplicada nesta ordem:
//   1) número de vitórias dentro do grupo (desc);
//   2) confronto direto entre as duplas empatadas (mini-tabela de vitórias
//      considerando APENAS os jogos entre as empatadas);
//   3) melhor cabeça de chave (seed menor) como critério final.
//
// A classificação final só é produzida quando TODOS os jogos do grupo têm
// vencedor registrado (R5.3 — "WHEN todos os jogos de um grupo têm vencedor
// registrado"). Enquanto houver jogo pendente, `classificarGrupo` devolve
// `null` (classificação indefinida). Isso mantém o contrato explícito e
// previsível para quem consome (ex.: a transição grupos→mata-mata, R5.4).
//
// Assinatura adaptada do contrato do design (`classificarGrupo(grupo): Standing[]`):
// como a função é pura, recebe tudo que precisa por parâmetro — o grupo, os
// jogos do grupo e um índice de seed por dupla —, sem buscar nada de I/O.
//
// Cobre:
//   - R5.3  ordenação por vitórias → confronto direto → seed; determinística
//   - R5.4  seleção dos X melhores por grupo (classificados)

import type { Group, Match, PairId, Standing } from "./types";

/**
 * Índice de seed por dupla: `pairId -> seed` (1-based, menor = melhor cabeça).
 * Pode ser construído a partir de `Pair[]` com `indiceDeSeed(duplas)`.
 */
export type SeedIndex = ReadonlyMap<PairId, number>;

/**
 * Constrói um `SeedIndex` a partir de uma lista de duplas (usa `id` e `seed`).
 * Conveniência para quem tem `Pair[]` em mãos (ex.: `bracket.duplas`).
 */
export function indiceDeSeed(
  duplas: ReadonlyArray<{ id: PairId; seed: number }>,
): SeedIndex {
  const mapa = new Map<PairId, number>();
  for (const d of duplas) mapa.set(d.id, d.seed);
  return mapa;
}

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
  const porId = new Map<PairId, Match>();
  for (const j of jogos) porId.set(j.id, j);
  for (const matchId of grupo.jogos) {
    const jogo = porId.get(matchId);
    // Jogo ausente ou sem vencedor registrado ⇒ grupo incompleto.
    if (!jogo || jogo.vencedorId === null) return false;
  }
  return true;
}

/**
 * Classifica as duplas de um grupo de forma determinística (R5.3).
 *
 * Retorna `Standing[]` ordenado (posicao 1 = primeiro colocado) quando TODOS
 * os jogos do grupo têm vencedor registrado; caso contrário retorna `null`
 * (classificação ainda indefinida — não há classificação "parcial").
 *
 * Critérios de ordenação, nesta ordem:
 *   1) vitórias no grupo (desc);
 *   2) confronto direto entre as duplas empatadas (mini-tabela restrita aos
 *      jogos entre elas — resolve empates duplos e triplos de forma uniforme);
 *   3) menor seed (melhor cabeça de chave) — critério final que sempre
 *      desempata, pois os seeds são únicos por categoria.
 *
 * @param grupo      O grupo a classificar (usa `duplas` e `jogos`).
 * @param jogos      Jogos do grupo (ao menos os referenciados em `grupo.jogos`).
 * @param seedIndex  Mapa `pairId -> seed` para o critério final de desempate.
 */
export function classificarGrupo(
  grupo: Group,
  jogos: ReadonlyArray<Match>,
  seedIndex: SeedIndex,
): Standing[] | null {
  if (!grupoCompleto(grupo, jogos)) return null;

  const porId = new Map<PairId, Match>();
  for (const j of jogos) porId.set(j.id, j);

  // Jogos efetivos do grupo (na ordem de `grupo.jogos`, para determinismo).
  const jogosDoGrupo: Match[] = [];
  for (const matchId of grupo.jogos) {
    const jogo = porId.get(matchId);
    if (jogo) jogosDoGrupo.push(jogo);
  }

  // Vitórias totais de cada dupla no grupo.
  const vitorias = new Map<PairId, number>();
  for (const pairId of grupo.duplas) vitorias.set(pairId, 0);
  for (const jogo of jogosDoGrupo) {
    const vId = jogo.vencedorId;
    if (vId !== null && vitorias.has(vId)) {
      vitorias.set(vId, (vitorias.get(vId) as number) + 1);
    }
  }

  const seedDe = (pairId: PairId): number =>
    seedIndex.get(pairId) ?? Number.POSITIVE_INFINITY;

  /**
   * Vitórias de `pairId` considerando SOMENTE os jogos entre as duplas do
   * conjunto `entre` (confronto direto / mini-tabela). Determinística.
   */
  const vitoriasDiretas = (pairId: PairId, entre: ReadonlySet<PairId>): number => {
    let total = 0;
    for (const jogo of jogosDoGrupo) {
      if (jogo.vencedorId !== pairId) continue;
      const a = jogo.a.pairId;
      const b = jogo.b.pairId;
      if (a === null || b === null) continue;
      // Ambas as duplas do jogo precisam estar no conjunto empatado.
      if (entre.has(a) && entre.has(b)) total += 1;
    }
    return total;
  };

  // Ordena por vitórias totais (desc); empates resolvidos por confronto direto
  // (desc) dentro do grupo de empatados; e, por fim, por seed (asc).
  const duplasOrdenadas = [...grupo.duplas];

  duplasOrdenadas.sort((x, y) => {
    const vx = vitorias.get(x) ?? 0;
    const vy = vitorias.get(y) ?? 0;
    if (vx !== vy) return vy - vx; // mais vitórias primeiro

    // Empate em vitórias totais: monta o conjunto das duplas empatadas (mesmo
    // número de vitórias que x e y) e compara pela mini-tabela de confronto
    // direto. Isso trata empates duplos e triplos+ de forma consistente.
    const empatadas = new Set<PairId>();
    for (const pairId of grupo.duplas) {
      if ((vitorias.get(pairId) ?? 0) === vx) empatadas.add(pairId);
    }

    const dx = vitoriasDiretas(x, empatadas);
    const dy = vitoriasDiretas(y, empatadas);
    if (dx !== dy) return dy - dx; // mais vitórias no confronto direto primeiro

    // Persistindo o empate: melhor cabeça de chave (seed menor) decide.
    return seedDe(x) - seedDe(y);
  });

  return duplasOrdenadas.map((pairId, indice) => ({
    pairId,
    vitorias: vitorias.get(pairId) ?? 0,
    posicao: indice + 1,
  }));
}

/**
 * Seleciona os X melhores colocados de um grupo (os Classificados), usados na
 * transição grupos→mata-mata (R5.4).
 *
 * Retorna os primeiros `quantidade` `Standing` da classificação (já ordenada),
 * ou `null` se o grupo ainda não está completo. Se `quantidade` exceder o
 * número de duplas, devolve todas; se for ≤ 0, devolve lista vazia.
 */
export function selecionarClassificados(
  grupo: Group,
  jogos: ReadonlyArray<Match>,
  seedIndex: SeedIndex,
  quantidade: number,
): Standing[] | null {
  const classificacao = classificarGrupo(grupo, jogos, seedIndex);
  if (classificacao === null) return null;
  if (quantidade <= 0) return [];
  return classificacao.slice(0, quantidade);
}
