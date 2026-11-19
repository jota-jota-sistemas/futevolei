// src/domain/bracket/ordenacao.ts
//
// Numeração dos jogos do torneio ("Jogo N"). Função PURA e DETERMINÍSTICA —
// sem I/O, sem relógio, sem Math.random.
//
// Duas regras, conforme o lado do jogo:
//  - FASE DE GRUPOS: fila única (uma quadra). Numera 1, 2, 3, … sugerindo uma
//    ordem que EVITE a mesma dupla em dois jogos consecutivos e reduza a espera
//    (prioriza quem está parado há mais tempo). Quando há conflito, PRIORIZA o
//    não-consecutivo sobre reduzir a espera.
//  - MATA-MATA (vencedores, perdedores, grande final): numeração atribuída já
//    na geração a TODOS os jogos disputáveis, inclusive os futuros (cujas duplas
//    ainda não estão definidas), para o público acompanhar "Vencedor do jogo 12"
//    desde o início. A ordem é uma fila que respeita a chave: um jogo só recebe
//    número depois dos jogos que o alimentam (a final é a última, as semifinais
//    as penúltimas, e a chave de perdedores começa assim que há perdedores, sem
//    esperar a de vencedores acabar). Entre os jogos prontos, evita que a mesma
//    dupla jogue duas vezes seguidas (jogo que depende do imediatamente anterior)
//    e prioriza quem descansou mais (jogos de origem numerados há mais tempo).
//    Jogos com BYE não são disputados e não recebem número.
//
// Estabilidade: um jogo já numerado NUNCA muda de número. Jogos ainda sem número
// entram no FIM, com números novos. A numeração só cresce. Com grupos seguidos
// de mata-mata, o mata-mata continua a contagem depois do último jogo de grupo.

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

  // Candidatos da fila gulosa: jogos de grupo elegíveis e ainda sem número.
  let candidatos = matches.filter(
    (m) => m.side === "grupo" && elegivel(m) && m.ordemDisputa === null,
  );

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

  // Mata-mata: fila que respeita a estrutura da chave (ver cabeçalho). Continua
  // do maior número já atribuído (inclusive o dos jogos de grupo).
  numerarMataMata(matches, proximo);
  return { ...bracket, matches };
}

/** Jogo de mata-mata que será de fato disputado (sem BYE). */
function disputavelMataMata(m: Match): boolean {
  return m.side !== "grupo" && m.a.bye !== true && m.b.bye !== true;
}
/**
 * Numera (in place) os jogos de mata-mata ainda sem número, a partir de
 * `ultimo + 1`. Escolha gulosa entre os jogos PRONTOS (todos os jogos que o
 * alimentam já numerados ou sem disputa):
 *  1) prefere o que NÃO depende do jogo imediatamente anterior (evita a mesma
 *     dupla em dois jogos seguidos); se todos dependem, relaxa;
 *  2) prefere o de maior descanso: menor número entre os jogos de origem, no
 *     pior caso (menor "gargalo" = origem mais antiga);
 *  3) desempate estável (lado, rodada, posição).
 */
function numerarMataMata(matches: Match[], ultimo: number): void {
  const alimentadores = new Map<string, Match[]>();
  for (const m of matches) {
    for (const alvo of [m.avancaVencedorPara, m.encaminhaPerdedorPara]) {
      if (!alvo) continue;
      const lista = alimentadores.get(alvo.matchId) ?? [];
      lista.push(m);
      alimentadores.set(alvo.matchId, lista);
    }
  }
  const origens = (m: Match): Match[] =>
    (alimentadores.get(m.id) ?? []).filter(disputavelMataMata);
  let pendentes = matches.filter(
    (m) => disputavelMataMata(m) && m.ordemDisputa === null,
  );
  let anterior: Match | undefined = matches.find(
    (m) => m.ordemDisputa === ultimo && ultimo > 0,
  );
  let proximo = ultimo;
  const gargalo = (m: Match): number =>
    Math.max(0, ...origens(m).map((o) => o.ordemDisputa ?? 0));
  while (pendentes.length > 0) {
    let prontos = pendentes.filter((m) =>
      origens(m).every((o) => o.ordemDisputa !== null),
    );
    // Defesa: ligações inconsistentes não podem travar a numeração.
    if (prontos.length === 0) prontos = pendentes;
    const dependeDoAnterior = (m: Match): boolean =>
      anterior !== undefined && origens(m).includes(anterior);
    const livres = prontos.filter((m) => !dependeDoAnterior(m));
    const pool = livres.length > 0 ? livres : prontos;
    const escolhido = [...pool].sort((x, y) => {
      const gx = gargalo(x);
      const gy = gargalo(y);
      return gx !== gy ? gx - gy : compararEstavel(x, y);
    })[0];
    proximo += 1;
    escolhido.ordemDisputa = proximo;
    anterior = escolhido;
    pendentes = pendentes.filter((m) => m !== escolhido);
  }
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
