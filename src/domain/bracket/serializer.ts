// src/domain/bracket/serializer.ts
//
// Bracket_Serializer: serializa o chaveamento em memória para uma forma JSON
// canônica e estável, e desserializa de volta, garantindo round-trip (R7.5).
//
// Função PURA — sem I/O, sem relógio, sem Math.random.
//
// ## Objetivos
//
// 1. **Forma JSON estável e canônica.** `serializar` produz um objeto
//    (`BracketJson`) cujas chaves são escritas numa ordem fixa e determinística
//    e cujos campos opcionais são tratados de forma explícita. Assim, o mesmo
//    bracket sempre gera a mesma estrutura JSON, e `JSON.stringify(serializar(b))`
//    é estável entre execuções — útil para comparação, hashing e persistência.
//
// 2. **Round-trip.** `desserializar(serializar(b))` devolve um Bracket
//    EQUIVALENTE a `b` (R7.5): mesmos matches na MESMA ordem da lista `matches`,
//    mesmos grupos, mesmas duplas e mesmos resultados. A equivalência é
//    estrutural — a forma JSON canônica pode reordenar as CHAVES dos objetos,
//    mas nunca a ordem SEMÂNTICA dos arrays (matches, grupos, duplas, jogos de
//    grupo), que é preservada exatamente.
//
// ## Preservação de campos opcionais (presença vs ausência)
//
// O grafo do bracket liga jogos por `matchId` (string), não por referência —
// logo a serialização é direta. O cuidado central é preservar EXATAMENTE os
// campos opcionais do domínio, inclusive a distinção entre "ausente" e
// "presente":
//
//   - `Participant.bye`              — `true` quando é um bye; ausente caso contrário.
//   - `Match.grupoId`               — presente só quando `side === "grupo"`.
//   - `Match.avancaVencedorPara`    — ligação de avanço do vencedor.
//   - `Match.encaminhaPerdedorPara` — ligação do perdedor (só upper → lower).
//
// A reconstrução só define esses campos quando presentes no JSON, de modo que
// `"avancaVencedorPara" in match` tem o mesmo valor antes e depois do round-trip.

import type {
  Bracket,
  BracketConfig,
  BracketSide,
  Format,
  Group,
  GroupId,
  Match,
  MatchId,
  Pair,
  PairId,
  Participant,
} from "./types";

/** Versão do schema de serialização. Independente da `versao` do Bracket. */
export const VERSAO_SERIALIZER = 1;

// ---------------------------------------------------------------------------
// Forma JSON canônica (espelha o Bracket, com chaves em ordem determinística)
// ---------------------------------------------------------------------------

export interface ParticipantJson {
  pairId: PairId | null;
  // `bye` só aparece quando é verdadeiro (preserva ausência vs presença).
  bye?: boolean;
}

export interface AvancoJson {
  matchId: MatchId;
  slot: "a" | "b";
}

export interface MatchJson {
  id: MatchId;
  side: BracketSide;
  rodada: number;
  ordem: number;
  a: ParticipantJson;
  b: ParticipantJson;
  vencedorId: PairId | null;
  registradoEm: string | null;
  ordemDisputa: number | null;
  // Campos opcionais: presentes apenas quando existirem no match de origem.
  grupoId?: GroupId;
  avancaVencedorPara?: AvancoJson;
  encaminhaPerdedorPara?: AvancoJson;
}

export interface GroupJson {
  id: GroupId;
  indice: number;
  duplas: PairId[];
  jogos: MatchId[];
}

export interface PairJson {
  id: PairId;
  nomeDupla: string;
  atletaA: string;
  atletaB: string;
  seed: number;
  criadoEm: string;
}

export interface BracketConfigJson {
  formato: Format;
  numeroDeGrupos?: number;
  classificadosPorGrupo?: number;
}

export interface BracketJson {
  /** Versão do schema desta forma JSON (canonicalização). */
  versaoSerializer: number;
  campeonatoId: string;
  categoriaId: string;
  formato: Format;
  config: BracketConfigJson;
  duplas: PairJson[];
  grupos: GroupJson[];
  matches: MatchJson[];
  campeaId: PairId | null;
  /** Versão do schema do Bracket (campo `versao` do domínio). */
  versao: number;
}

// ---------------------------------------------------------------------------
// serializar
// ---------------------------------------------------------------------------

/**
 * Serializa o bracket para uma forma JSON estável e canônica.
 *
 * Preserva identidade, ordem e vínculos entre grupos, chave de vencedores
 * (upper), chave de perdedores (lower), grande final, jogos, participantes e
 * resultados. Campos opcionais ausentes permanecem ausentes.
 */
export function serializar(bracket: Bracket): BracketJson {
  return {
    versaoSerializer: VERSAO_SERIALIZER,
    campeonatoId: bracket.campeonatoId,
    categoriaId: bracket.categoriaId,
    formato: bracket.formato,
    config: serializarConfig(bracket.config),
    duplas: bracket.duplas.map(serializarPair),
    grupos: bracket.grupos.map(serializarGroup),
    matches: bracket.matches.map(serializarMatch),
    campeaId: bracket.campeaId,
    versao: bracket.versao,
  };
}

function serializarConfig(config: BracketConfig): BracketConfigJson {
  const json: BracketConfigJson = { formato: config.formato };
  if (config.numeroDeGrupos !== undefined) {
    json.numeroDeGrupos = config.numeroDeGrupos;
  }
  if (config.classificadosPorGrupo !== undefined) {
    json.classificadosPorGrupo = config.classificadosPorGrupo;
  }
  return json;
}

function serializarPair(pair: Pair): PairJson {
  return {
    id: pair.id,
    nomeDupla: pair.nomeDupla,
    atletaA: pair.atletaA,
    atletaB: pair.atletaB,
    seed: pair.seed,
    criadoEm: pair.criadoEm,
  };
}

function serializarGroup(group: Group): GroupJson {
  return {
    id: group.id,
    indice: group.indice,
    // Cópias dos arrays: preserva a ordem semântica sem compartilhar referência.
    duplas: [...group.duplas],
    jogos: [...group.jogos],
  };
}

function serializarParticipant(p: Participant): ParticipantJson {
  const json: ParticipantJson = { pairId: p.pairId };
  // `bye` só é escrito quando presente (preserva ausência vs presença).
  if (p.bye !== undefined) {
    json.bye = p.bye;
  }
  return json;
}

function serializarMatch(match: Match): MatchJson {
  const json: MatchJson = {
    id: match.id,
    side: match.side,
    rodada: match.rodada,
    ordem: match.ordem,
    a: serializarParticipant(match.a),
    b: serializarParticipant(match.b),
    vencedorId: match.vencedorId,
    registradoEm: match.registradoEm,
    ordemDisputa: match.ordemDisputa,
  };
  if (match.grupoId !== undefined) {
    json.grupoId = match.grupoId;
  }
  if (match.avancaVencedorPara !== undefined) {
    json.avancaVencedorPara = {
      matchId: match.avancaVencedorPara.matchId,
      slot: match.avancaVencedorPara.slot,
    };
  }
  if (match.encaminhaPerdedorPara !== undefined) {
    json.encaminhaPerdedorPara = {
      matchId: match.encaminhaPerdedorPara.matchId,
      slot: match.encaminhaPerdedorPara.slot,
    };
  }
  return json;
}

// ---------------------------------------------------------------------------
// desserializar
// ---------------------------------------------------------------------------

/**
 * Reconstrói o Bracket a partir do JSON.
 *
 * Round-trip: `desserializar(serializar(b))` é equivalente a `b` (R7.5) —
 * mesmos matches na mesma ordem, mesmos grupos, mesmas duplas e resultados,
 * com os campos opcionais exatamente como estavam (ausência vs presença).
 */
export function desserializar(json: BracketJson): Bracket {
  return {
    campeonatoId: json.campeonatoId,
    categoriaId: json.categoriaId,
    formato: json.formato,
    config: desserializarConfig(json.config),
    duplas: json.duplas.map(desserializarPair),
    grupos: json.grupos.map(desserializarGroup),
    matches: json.matches.map(desserializarMatch),
    campeaId: json.campeaId,
    versao: json.versao,
  };
}

function desserializarConfig(json: BracketConfigJson): BracketConfig {
  const config: BracketConfig = { formato: json.formato };
  if (json.numeroDeGrupos !== undefined) {
    config.numeroDeGrupos = json.numeroDeGrupos;
  }
  if (json.classificadosPorGrupo !== undefined) {
    config.classificadosPorGrupo = json.classificadosPorGrupo;
  }
  return config;
}

function desserializarPair(json: PairJson): Pair {
  return {
    id: json.id,
    nomeDupla: json.nomeDupla,
    atletaA: json.atletaA,
    atletaB: json.atletaB,
    seed: json.seed,
    criadoEm: json.criadoEm,
  };
}

function desserializarGroup(json: GroupJson): Group {
  return {
    id: json.id,
    indice: json.indice,
    duplas: [...json.duplas],
    jogos: [...json.jogos],
  };
}

function desserializarParticipant(json: ParticipantJson): Participant {
  const p: Participant = { pairId: json.pairId };
  if (json.bye !== undefined) {
    p.bye = json.bye;
  }
  return p;
}

function desserializarMatch(json: MatchJson): Match {
  const match: Match = {
    id: json.id,
    side: json.side,
    rodada: json.rodada,
    ordem: json.ordem,
    a: desserializarParticipant(json.a),
    b: desserializarParticipant(json.b),
    vencedorId: json.vencedorId,
    registradoEm: json.registradoEm,
    ordemDisputa: json.ordemDisputa ?? null,
  };
  if (json.grupoId !== undefined) {
    match.grupoId = json.grupoId;
  }
  if (json.avancaVencedorPara !== undefined) {
    match.avancaVencedorPara = {
      matchId: json.avancaVencedorPara.matchId,
      slot: json.avancaVencedorPara.slot,
    };
  }
  if (json.encaminhaPerdedorPara !== undefined) {
    match.encaminhaPerdedorPara = {
      matchId: json.encaminhaPerdedorPara.matchId,
      slot: json.encaminhaPerdedorPara.slot,
    };
  }
  return match;
}
