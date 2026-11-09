// src/domain/bracket/ordenacao.ts
//
// Ordenação e numeração dos jogos na "fila única" do torneio (uma quadra).
// Função PURA e DETERMINÍSTICA — sem I/O, sem relógio, sem Math.random.
//
// Objetivos (alinhados com o organizador):
//  - Numerar cada jogo com um número de disputa global contínuo (1, 2, 3, …),
//    exibido na UI ("Jogo N").
//  - Sugerir uma ordem que EVITE uma mesma dupla jogar dois jogos consecutivos
//    e reduza a espera (prioriza quem está parado há mais tempo). Quando há
//    conflito, PRIORIZA o não-consecutivo sobre reduzir a espera.
//  - Intercalar os grupos (a escolha gulosa por "maior descanso" já faz isso
//    naturalmente, pois alterna entre duplas/grupos diferentes).
//
// Estabilidade: um jogo já numerado NUNCA muda de número. Jogos que só ficam
// elegíveis depois (confrontos futuros do mata-mata, quando as duas duplas
// passam a estar definidas após resultados) entram no FIM da fila com números
// novos. A numeração só cresce.

import type { Bracket, Match, PairId } from "./types";

/** Ordem canônica de desempate entre sides (estável e determinística). */
const ORDEM_SIDE: Record<Match["side"], number> = {
  grupo: 0,
  upper: 1,
  lower: 2,
  "grande-final": 3,
};

/**
 * Um jogo está ELEGÍVEL para numeração quando é um confronto real já conhecido:
 * ambas as duplas definidas (pairId não-nulo) e nenhuma é bye. Isso garante que
 * jogos futuros do mata-mata só sejam numerados quando suas duplas existirem
 * (respeitando as rodadas), e que walkovers (dupla×bye) não entrem na fila.
 */
function elegivel(m: Match): boolean {
  return (
    m.a.pairId !== null &&
    m.b.pairId !== null &&
    m.a.bye !== true &&
    m.b.bye !== true
  );
}

/** Comparador determinístico estável de jogos (para desempates). */
function compararEstavel(a: Match, b: Match): number {
  const sa = ORDEM_SIDE[a.side];
  const sb = ORDEM_SIDE[b.side];
  if (sa !== sb) return sa - sb;
  if (a.rodada !== b.rodada) return a.rodada - b.rodada;
  if (a.ordem !== b.ordem) return a.ordem - b.ordem;
  return a.id.localeCompare(b.id);
}

/**
 * Atribui `ordemDisputa` aos jogos elegíveis AINDA SEM número, preservando os
 * já numerados. Devolve um NOVO bracket (não muta a entrada).
 *
 * Algoritmo guloso:
 *  - `ultimoNumeroDaDupla[pairId]` = maior número de jogo em que a dupla já
 *    aparece (considerando os já numerados). Quem nunca jogou tem 0.
 *  - A cada passo, entre os candidatos restantes, escolhe:
 *      1) preferencialmente um que NÃO contenha nenhuma dupla do jogo
 *         imediatamente anterior (não-consecutivo);
 *      2) entre esses, o de MAIOR descanso — menor `ultimoNumero` entre as suas
 *         duas duplas (quem está parado há mais tempo joga primeiro);
 *      3) desempate determinístico por `compararEstavel`.
 *    Se TODOS os candidatos contiverem alguma dupla do jogo anterior (conflito
 *    inevitável), a regra (1) é relaxada e vale só (2)+(3) — priorizando o
 *    não-consecutivo sempre que possível.
 */
export function numerarJogos(bracket: Bracket): Bracket {
  const matches = bracket.matches.map((m) => ({ ...m }));

  // Estado inicial a partir dos jogos JÁ numerados (estabilidade).
  const ultimoNumero = new Map<PairId, number>();
  let proximo = 0;
  for (const m of matches) {
    if (m.ordemDisputa !== null) {
      proximo = Math.max(proximo, m.ordemDisputa);
      registrarAparicao(ultimoNumero, m, m.ordemDisputa);
    }
  }

  // Candidatos: elegíveis e ainda sem número.
  let candidatos = matches.filter((m) => elegivel(m) && m.ordemDisputa === null);

  // Duplas do último jogo numerado (para a regra do não-consecutivo). Começa
  // com as duplas do maior número já atribuído, se houver.
  let duplasAnterior = duplasDoUltimo(matches, proximo);

  while (candidatos.length > 0) {
    const escolhido = escolher(candidatos, ultimoNumero, duplasAnterior);
    proximo += 1;
    escolhido.ordemDisputa = proximo;
    registrarAparicao(ultimoNumero, escolhido, proximo);
    duplasAnterior = new Set<PairId>([
      escolhido.a.pairId as PairId,
      escolhido.b.pairId as PairId,
    ]);
    candidatos = candidatos.filter((c) => c !== escolhido);
  }

  return { ...bracket, matches };
}

/** Marca que as duas duplas do jogo apareceram no número `n` (se maior). */
function registrarAparicao(
  ultimo: Map<PairId, number>,
  m: Match,
  n: number,
): void {
  for (const pid of [m.a.pairId, m.b.pairId]) {
    if (pid !== null) {
      ultimo.set(pid, Math.max(ultimo.get(pid) ?? 0, n));
    }
  }
}

/** Conjunto de duplas do jogo cujo `ordemDisputa` é exatamente `n` (ou vazio). */
function duplasDoUltimo(matches: Match[], n: number): Set<PairId> {
  if (n <= 0) return new Set();
  const ult = matches.find((m) => m.ordemDisputa === n);
  if (!ult) return new Set();
  const s = new Set<PairId>();
  if (ult.a.pairId !== null) s.add(ult.a.pairId);
  if (ult.b.pairId !== null) s.add(ult.b.pairId);
  return s;
}

/** Escolhe o próximo jogo pela política gulosa descrita em `numerarJogos`. */
function escolher(
  candidatos: Match[],
  ultimo: Map<PairId, number>,
  duplasAnterior: Set<PairId>,
): Match {
  const conflita = (m: Match): boolean =>
    (m.a.pairId !== null && duplasAnterior.has(m.a.pairId)) ||
    (m.b.pairId !== null && duplasAnterior.has(m.b.pairId));

  // (1) Prefere os que NÃO conflitam; se todos conflitam, usa todos.
  const naoConflitantes = candidatos.filter((m) => !conflita(m));
  const pool = naoConflitantes.length > 0 ? naoConflitantes : candidatos;

  // (2) Maior descanso = menor `ultimoNumero` entre as duas duplas. Entre os
  // empatados por descanso, (3) desempate estável.
  const descanso = (m: Match): number => {
    const ua = ultimo.get(m.a.pairId as PairId) ?? 0;
    const ub = ultimo.get(m.b.pairId as PairId) ?? 0;
    // O "mais parado" é quem tem o MENOR último número. Priorizamos o jogo cuja
    // dupla mais recente ainda assim está parada há mais tempo: usamos o MAIOR
    // dos dois últimos (o gargalo) e queremos minimizá-lo.
    return Math.max(ua, ub);
  };

  return [...pool].sort((a, b) => {
    const da = descanso(a);
    const db = descanso(b);
    if (da !== db) return da - db; // menor gargalo primeiro (mais descanso)
    return compararEstavel(a, b);
  })[0];
}
