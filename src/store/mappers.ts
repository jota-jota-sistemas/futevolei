// src/store/mappers.ts
//
// Mappers PUROS entre as linhas das tabelas Supabase (snake_case) e os tipos de
// domínio do chaveamento (camelCase). Sem I/O: NÃO chamam Supabase — apenas
// transformam dados já carregados (direção linhas → domínio) e produzem linhas
// inseríveis a partir de um Bracket (direção domínio → linhas).
//
// Conforme a seção "Data Models / Esquema Supabase" do design.md e o schema em
// `supabase/schema.sql`.
//
// ## Identidade e o grafo de avanço
//
// O domínio liga jogos entre si por `MatchId` (string), e grupos por `GroupId`
// (string). Nas tabelas, cada linha tem um `id` próprio e as colunas
// `avanca_vencedor_para` / `encaminha_perdedor_para` dos jogos apontam para o
// `id` de OUTRA linha de `jogos`, materializando o grafo do bracket (ver nota
// de modelagem em schema.sql).
//
// Para que o round-trip seja DETERMINÍSTICO e sem ambiguidade, estes mappers
// adotam a convenção de que o `id` de cada linha É o identificador de domínio
// correspondente:
//   - `jogos.id`   === `Match.id`   (MatchId)
//   - `grupos.id`  === `Group.id`   (GroupId)
//   - `duplas.id`  === `Pair.id`    (PairId)
// Assim, reconstruir o grafo de avanço é direto e determinístico: o valor de
// `avanca_vencedor_para` já é o `MatchId` de destino, e `avanca_vencedor_slot`
// o slot. Nenhuma tabela de tradução uuid↔string é necessária e a ordem de
// entrada das linhas não altera a saída (as listas são sempre reordenadas por
// chave estável).
//
// A camada `Bracket_Store` (tarefa 14.2) é a dona da estratégia de `id` ao
// persistir; estes mappers apenas preservam o `id` que receberem/produzirem.

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
} from "../domain/bracket/types";

// ---------------------------------------------------------------------------
// Tipos "Row" — espelham as colunas do schema (snake_case)
// ---------------------------------------------------------------------------

/** Linha da tabela `duplas`. */
export interface DuplaRow {
  id: string;
  categoria_id: string;
  nome_dupla: string;
  atleta_a: string;
  atleta_b: string;
  /** 1..N; `null` até o seeding ser definido. */
  seed: number | null;
  /** ISO timestamp. */
  criado_em: string;
}

/** Linha da tabela `chaveamentos`. */
export interface ChaveamentoRow {
  id: string;
  categoria_id: string;
  formato: string;
  /** Snapshot da `BracketConfig` (jsonb). */
  config_json: BracketConfig;
  campea_id: string | null;
  /** ISO timestamp. */
  atualizado_em: string;
}

/** Linha da tabela `grupos`. */
export interface GrupoRow {
  id: string;
  chaveamento_id: string;
  /** 0-based, ordem determinística. */
  indice: number;
}

/** Linha da tabela `grupo_duplas` (associação grupo ↔ dupla). */
export interface GrupoDuplaRow {
  grupo_id: string;
  dupla_id: string;
}

/** Slot de destino de uma ligação de avanço. */
export type JogoSlot = "a" | "b";

/** Linha da tabela `jogos`. */
export interface JogoRow {
  id: string;
  chaveamento_id: string;
  side: string;
  /** Preenchido quando `side === 'grupo'`. */
  grupo_id: string | null;
  rodada: number;
  ordem: number;
  /** `null` = participante indefinido. */
  dupla_a: string | null;
  dupla_b: string | null;
  a_bye: boolean;
  b_bye: boolean;
  vencedor_id: string | null;
  /** ISO timestamp ou `null`. */
  registrado_em: string | null;
  /** Ordem de disputa (número do jogo) na fila do torneio; `null` se não numerado. */
  ordem_disputa: number | null;
  /** Placar da partida (pontos de a e de b); `null` se ainda não disputada. */
  placar_a: number | null;
  placar_b: number | null;
  avanca_vencedor_para: string | null;
  avanca_vencedor_slot: JogoSlot | null;
  encaminha_perdedor_para: string | null;
  encaminha_perdedor_slot: JogoSlot | null;
}

/**
 * Conjunto completo de linhas de UM chaveamento (uma categoria), como lidas do
 * banco. Entrada de `linhasParaBracket` e saída de `bracketParaLinhas`.
 */
export interface ChaveamentoLinhas {
  chaveamento: ChaveamentoRow;
  duplas: DuplaRow[];
  grupos: GrupoRow[];
  grupoDuplas: GrupoDuplaRow[];
  jogos: JogoRow[];
}

// ---------------------------------------------------------------------------
// Validação de formato (string do banco → Format)
// ---------------------------------------------------------------------------

const FORMATOS_VALIDOS: ReadonlySet<string> = new Set<Format>([
  "fase de grupos",
  "dupla eliminação",
]);

function comoFormato(valor: string): Format {
  if (!FORMATOS_VALIDOS.has(valor)) {
    throw new Error(`Formato inválido na linha de chaveamento: "${valor}"`);
  }
  return valor as Format;
}

const SIDES_VALIDOS: ReadonlySet<string> = new Set<BracketSide>([
  "upper",
  "lower",
  "grande-final",
  "grupo",
]);

// ===========================================================================
// Prefixo de identidade por chaveamento
// ===========================================================================
//
// Os MatchId/GroupId do domínio (ex.: "upper-r1-j0", "grupo-0", "grupo-0-s1-s4")
// são únicos apenas DENTRO de um bracket — não globalmente. Como `jogos.id` e
// `grupos.id` são PRIMARY KEY globais, duas categorias do mesmo campeonato
// colidiriam (o jogo "upper-r1-j0" de uma bateria com o da outra). Para manter
// o domínio com ids limpos e, ao mesmo tempo, ter unicidade global no banco,
// prefixamos os ids persistidos com o id do chaveamento: `{chaveamentoId}::{id}`.
// Na leitura, removemos o prefixo e reconstruímos o id de domínio original.
const SEP = "::";

/** Prefixa um id de domínio com o id do chaveamento, para unicidade global. */
function prefixar(chaveamentoId: string, idDominio: string): string {
  return `${chaveamentoId}${SEP}${idDominio}`;
}

/**
 * Remove o prefixo `{chaveamentoId}::` de um id persistido, devolvendo o id de
 * domínio original. Tolerante: se o id não tiver o prefixo esperado (dados
 * antigos ou gravados por outro caminho), devolve o valor como veio.
 */
function desprefixar(valorPersistido: string): string {
  const i = valorPersistido.indexOf(SEP);
  return i === -1 ? valorPersistido : valorPersistido.slice(i + SEP.length);
}

function comoSide(valor: string): BracketSide {
  if (!SIDES_VALIDOS.has(valor)) {
    throw new Error(`Side inválido na linha de jogo: "${valor}"`);
  }
  return valor as BracketSide;
}

// ===========================================================================
// Direção: LINHAS Supabase → DOMÍNIO
// ===========================================================================

/** Converte uma linha de `duplas` em `Pair`. */
export function duplaRowParaPair(row: DuplaRow): Pair {
  return {
    id: row.id,
    nomeDupla: row.nome_dupla,
    atletaA: row.atleta_a,
    atletaB: row.atleta_b,
    // `seed` é 1..N no domínio; no banco pode ser null antes do seeding. Ao
    // reconstruir um bracket já gerado, o seed sempre existe; usamos 0 como
    // sentinela defensivo caso a coluna esteja ausente.
    seed: row.seed ?? 0,
    criadoEm: row.criado_em,
  };
}

/**
 * Reconstrói o participante de um slot (a ou b) de um jogo a partir das colunas
 * `dupla_x` / `x_bye`. Só marca `bye: true` quando a coluna é `true`, de modo a
 * casar com o serializer (preserva ausência vs presença de `bye`).
 */
function participanteDoSlot(duplaId: string | null, bye: boolean): Participant {
  const p: Participant = { pairId: duplaId };
  if (bye === true) {
    p.bye = true;
  }
  return p;
}

/**
 * Reconstrói o grafo de avanço de UM jogo de forma determinística a partir das
 * colunas `avanca_vencedor_para`/`_slot` e `encaminha_perdedor_para`/`_slot`.
 * A ligação só é definida quando a coluna `*_para` não é `null`.
 */
export function jogoRowParaMatch(row: JogoRow): Match {
  const match: Match = {
    id: desprefixar(row.id),
    side: comoSide(row.side),
    rodada: row.rodada,
    ordem: row.ordem,
    a: participanteDoSlot(row.dupla_a, row.a_bye),
    b: participanteDoSlot(row.dupla_b, row.b_bye),
    vencedorId: row.vencedor_id,
    registradoEm: row.registrado_em,
    ordemDisputa: row.ordem_disputa ?? null,
    placarA: row.placar_a ?? null,
    placarB: row.placar_b ?? null,
  };

  // `grupoId` só quando side === "grupo".
  if (match.side === "grupo" && row.grupo_id !== null) {
    match.grupoId = desprefixar(row.grupo_id);
  }

  // Ligação de avanço do vencedor: definida só quando a coluna não é null.
  if (row.avanca_vencedor_para !== null) {
    match.avancaVencedorPara = {
      matchId: desprefixar(row.avanca_vencedor_para),
      slot: slotObrigatorio(row.avanca_vencedor_slot, "avanca_vencedor_slot"),
    };
  }

  // Ligação de encaminhamento do perdedor: idem.
  if (row.encaminha_perdedor_para !== null) {
    match.encaminhaPerdedorPara = {
      matchId: desprefixar(row.encaminha_perdedor_para),
      slot: slotObrigatorio(
        row.encaminha_perdedor_slot,
        "encaminha_perdedor_slot",
      ),
    };
  }

  return match;
}

/**
 * Garante que, quando há um destino de avanço (`*_para` não-null), o slot
 * correspondente também exista — o schema casa ambos, mas validamos aqui para
 * reconstruir o grafo sem ambiguidade.
 */
function slotObrigatorio(slot: JogoSlot | null, coluna: string): JogoSlot {
  if (slot !== "a" && slot !== "b") {
    throw new Error(
      `Ligação de avanço sem slot válido na coluna "${coluna}": ${String(slot)}`,
    );
  }
  return slot;
}

/**
 * Reconstrói os `Group` do domínio a partir das linhas `grupos` e das
 * associações `grupo_duplas`, anexando os ids dos jogos de grupo de cada grupo.
 *
 * Determinismo:
 *  - grupos ordenados por `indice` asc;
 *  - duplas de cada grupo ordenadas pelo seed da dupla (asc), com desempate
 *    estável por id — espelha a ordem com que o gerador monta `Group.duplas`;
 *  - jogos de cada grupo ordenados por (rodada, ordem) asc.
 */
function reconstruirGrupos(
  gruposRows: ReadonlyArray<GrupoRow>,
  grupoDuplasRows: ReadonlyArray<GrupoDuplaRow>,
  jogosRows: ReadonlyArray<JogoRow>,
  seedPorDupla: ReadonlyMap<PairId, number>,
): Group[] {
  // duplas por grupo
  const duplasPorGrupo = new Map<GroupId, PairId[]>();
  for (const assoc of grupoDuplasRows) {
    const lista = duplasPorGrupo.get(assoc.grupo_id) ?? [];
    lista.push(assoc.dupla_id);
    duplasPorGrupo.set(assoc.grupo_id, lista);
  }

  // jogos de grupo por grupo, em ordem (rodada, ordem)
  const jogosPorGrupo = new Map<GroupId, JogoRow[]>();
  for (const jogo of jogosRows) {
    if (jogo.side === "grupo" && jogo.grupo_id !== null) {
      const lista = jogosPorGrupo.get(jogo.grupo_id) ?? [];
      lista.push(jogo);
      jogosPorGrupo.set(jogo.grupo_id, lista);
    }
  }

  const ordenarPorSeed = (a: PairId, b: PairId): number => {
    const sa = seedPorDupla.get(a) ?? 0;
    const sb = seedPorDupla.get(b) ?? 0;
    if (sa !== sb) return sa - sb;
    return a.localeCompare(b);
  };

  const ordenarJogos = (a: JogoRow, b: JogoRow): number => {
    if (a.rodada !== b.rodada) return a.rodada - b.rodada;
    if (a.ordem !== b.ordem) return a.ordem - b.ordem;
    return a.id.localeCompare(b.id);
  };

  return [...gruposRows]
    .sort((a, b) => a.indice - b.indice)
    .map((grupoRow) => {
      const duplas = [...(duplasPorGrupo.get(grupoRow.id) ?? [])].sort(
        ordenarPorSeed,
      );
      const jogos = [...(jogosPorGrupo.get(grupoRow.id) ?? [])]
        .sort(ordenarJogos)
        .map((j) => desprefixar(j.id));
      return {
        // `Group.id` de domínio sem o prefixo de chaveamento (ver `prefixar`).
        id: desprefixar(grupoRow.id),
        indice: grupoRow.indice,
        duplas,
        jogos,
      } satisfies Group;
    });
}

/**
 * Ordem canônica dos lados (sides) na lista `Bracket.matches`:
 * upper → lower → grande-final → grupo. Espelha a ordem em que o gerador emite
 * os jogos (mata-mata antes dos grupos quando convivem).
 */
const ORDEM_SIDE: Record<BracketSide, number> = {
  upper: 0,
  lower: 1,
  "grande-final": 2,
  grupo: 3,
};

/**
 * Comparador determinístico para montar `Bracket.matches`.
 *
 * Agrupa por `side` (ordem canônica acima). Dentro de cada side não-grupo,
 * ordena por (rodada, ordem). Para jogos de GRUPO, o `ordem` reinicia em 0 a
 * cada grupo, então o critério primário é o ÍNDICE do grupo (não o `grupo_id`
 * lexical, que falharia para ≥10 grupos) e só depois (rodada, ordem). Isso
 * mantém os jogos agrupados grupo-a-grupo, como o gerador os produz.
 */
function compararJogos(
  sideA: BracketSide,
  rodadaA: number,
  ordemA: number,
  grupoIndiceA: number,
  idA: string,
  sideB: BracketSide,
  rodadaB: number,
  ordemB: number,
  grupoIndiceB: number,
  idB: string,
): number {
  const sa = ORDEM_SIDE[sideA];
  const sb = ORDEM_SIDE[sideB];
  if (sa !== sb) return sa - sb;
  if (sideA === "grupo" && grupoIndiceA !== grupoIndiceB) {
    return grupoIndiceA - grupoIndiceB;
  }
  if (rodadaA !== rodadaB) return rodadaA - rodadaB;
  if (ordemA !== ordemB) return ordemA - ordemB;
  return idA.localeCompare(idB);
}

/** Comparador de `JogoRow` usando um mapa grupo_id → índice. */
function ordenarJogosRow(
  indicePorGrupoId: ReadonlyMap<string, number>,
): (a: JogoRow, b: JogoRow) => number {
  return (a, b) =>
    compararJogos(
      comoSide(a.side),
      a.rodada,
      a.ordem,
      a.grupo_id !== null ? (indicePorGrupoId.get(a.grupo_id) ?? 0) : 0,
      a.id,
      comoSide(b.side),
      b.rodada,
      b.ordem,
      b.grupo_id !== null ? (indicePorGrupoId.get(b.grupo_id) ?? 0) : 0,
      b.id,
    );
}

/**
 * Converte o conjunto de linhas de um chaveamento (uma categoria) no `Bracket`
 * de domínio, reconstruindo grupos, jogos e o grafo de avanço de forma
 * determinística (independente da ordem das linhas de entrada).
 */
export function linhasParaBracket(linhas: ChaveamentoLinhas): Bracket {
  const { chaveamento, duplas, grupos, grupoDuplas, jogos } = linhas;

  const formato = comoFormato(chaveamento.formato);

  // Duplas ordenadas por seed (asc), desempate por id — ordem estável do
  // snapshot `Bracket.duplas`.
  const pares = [...duplas]
    .map(duplaRowParaPair)
    .sort((a, b) => (a.seed !== b.seed ? a.seed - b.seed : a.id.localeCompare(b.id)));

  const seedPorDupla = new Map<PairId, number>();
  for (const p of pares) seedPorDupla.set(p.id, p.seed);

  const gruposDominio = reconstruirGrupos(
    grupos,
    grupoDuplas,
    jogos,
    seedPorDupla,
  );

  const indicePorGrupoId = new Map<string, number>();
  for (const g of grupos) indicePorGrupoId.set(g.id, g.indice);

  const matches = [...jogos]
    .sort(ordenarJogosRow(indicePorGrupoId))
    .map(jogoRowParaMatch);

  return {
    campeonatoId: "", // preenchido pela store a partir do CategoryRef
    categoriaId: chaveamento.categoria_id,
    formato,
    config: { ...chaveamento.config_json },
    duplas: pares,
    grupos: gruposDominio,
    matches,
    campeaId: chaveamento.campea_id,
    versao: 1,
  };
}

// ===========================================================================
// Direção: DOMÍNIO → LINHAS Supabase (inseríveis)
// ===========================================================================

/**
 * Transforma um `Bracket` nas linhas inseríveis de todas as tabelas de um
 * chaveamento (chaveamento, grupos, grupo_duplas, jogos). Determinístico: a
 * mesma entrada produz as mesmas linhas, na mesma ordem.
 *
 * - `chaveamentoId` é o `id` da linha de `chaveamentos` a que os jogos/grupos
 *   pertencem (gerado/escolhido pela store).
 * - `chaveamentoRowId` default = `chaveamentoId`.
 *
 * As linhas de `duplas` NÃO são produzidas aqui: duplas são gerenciadas
 * independentemente do chaveamento (R1) e já existem no banco quando o
 * chaveamento é salvo. A store usa os `Pair.id` do snapshot como chaves
 * estrangeiras.
 */
export function bracketParaLinhas(
  bracket: Bracket,
  chaveamentoId: string,
): Omit<ChaveamentoLinhas, "duplas"> {
  const chaveamento: ChaveamentoRow = {
    id: chaveamentoId,
    categoria_id: bracket.categoriaId,
    formato: bracket.formato,
    config_json: { ...bracket.config },
    campea_id: bracket.campeaId,
    // `atualizado_em` é gerado pelo banco (default now()); a store pode
    // sobrescrever. Aqui emitimos string vazia como placeholder determinístico.
    atualizado_em: "",
  };

  // Grupos ordenados por índice (determinístico).
  const gruposOrdenados = [...bracket.grupos].sort(
    (a, b) => a.indice - b.indice,
  );

  const grupos: GrupoRow[] = gruposOrdenados.map((g) => ({
    id: prefixar(chaveamentoId, g.id),
    chaveamento_id: chaveamentoId,
    indice: g.indice,
  }));

  // Associações grupo ↔ dupla, na ordem dos grupos e das duplas dentro de cada
  // grupo (ambas já determinísticas).
  const grupoDuplas: GrupoDuplaRow[] = [];
  for (const g of gruposOrdenados) {
    for (const duplaId of g.duplas) {
      grupoDuplas.push({ grupo_id: prefixar(chaveamentoId, g.id), dupla_id: duplaId });
    }
  }

  // Jogos na mesma ordem canônica usada na reconstrução.
  const indicePorGrupoId = new Map<string, number>();
  for (const g of bracket.grupos) indicePorGrupoId.set(g.id, g.indice);

  const jogos: JogoRow[] = [...bracket.matches]
    .sort(ordenarMatch(indicePorGrupoId))
    .map((m) => matchParaJogoRow(m, chaveamentoId));

  return { chaveamento, grupos, grupoDuplas, jogos };
}

/** Comparador de `Match` usando um mapa GroupId → índice. */
function ordenarMatch(
  indicePorGrupoId: ReadonlyMap<string, number>,
): (a: Match, b: Match) => number {
  return (a, b) =>
    compararJogos(
      a.side,
      a.rodada,
      a.ordem,
      a.grupoId !== undefined ? (indicePorGrupoId.get(a.grupoId) ?? 0) : 0,
      a.id,
      b.side,
      b.rodada,
      b.ordem,
      b.grupoId !== undefined ? (indicePorGrupoId.get(b.grupoId) ?? 0) : 0,
      b.id,
    );
}

/** Converte um `Match` do domínio na linha inserível de `jogos`. */
export function matchParaJogoRow(match: Match, chaveamentoId: string): JogoRow {
  // Todos os ids que participam do PK/grafo (id, grupo_id e as ligações de
  // avanço, que referenciam `jogos.id`) recebem o prefixo do chaveamento para
  // unicidade global — ver `prefixar`/`desprefixar`.
  const pref = (id: string): string => prefixar(chaveamentoId, id);
  return {
    id: pref(match.id),
    chaveamento_id: chaveamentoId,
    side: match.side,
    grupo_id:
      match.side === "grupo" && match.grupoId !== undefined
        ? pref(match.grupoId)
        : null,
    rodada: match.rodada,
    ordem: match.ordem,
    dupla_a: match.a.pairId,
    dupla_b: match.b.pairId,
    a_bye: match.a.bye === true,
    b_bye: match.b.bye === true,
    vencedor_id: match.vencedorId,
    registrado_em: match.registradoEm,
    ordem_disputa: match.ordemDisputa,
    placar_a: match.placarA,
    placar_b: match.placarB,
    avanca_vencedor_para: match.avancaVencedorPara
      ? pref(match.avancaVencedorPara.matchId)
      : null,
    avanca_vencedor_slot: match.avancaVencedorPara?.slot ?? null,
    encaminha_perdedor_para: match.encaminhaPerdedorPara
      ? pref(match.encaminhaPerdedorPara.matchId)
      : null,
    encaminha_perdedor_slot: match.encaminhaPerdedorPara?.slot ?? null,
  };
}

/**
 * Converte um `Pair` do domínio na linha inserível de `duplas`. Útil para a
 * store ao criar/atualizar duplas; não é usado por `bracketParaLinhas` (que
 * assume as duplas já persistidas).
 */
export function pairParaDuplaRow(pair: Pair, categoriaId: string): DuplaRow {
  return {
    id: pair.id,
    categoria_id: categoriaId,
    nome_dupla: pair.nomeDupla,
    atleta_a: pair.atletaA,
    atleta_b: pair.atletaB,
    seed: pair.seed,
    criado_em: pair.criadoEm,
  };
}
