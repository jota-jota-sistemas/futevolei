// src/domain/bracket/types.ts
//
// Tipos de domínio do chaveamento (bracket) de uma categoria.
// Conforme a seção "Data Models" do design.md. Tipos puros, sem I/O.

export type PairId = string;
export type MatchId = string;
export type GroupId = string;

export type Format = "fase de grupos" | "dupla eliminação";
export type BracketSide = "upper" | "lower" | "grande-final" | "grupo";

export interface Pair {
  id: PairId;
  nomeDupla: string; // 1..80 chars (trim), único por categoria case-insensitive
  atletaA: string; // 1..80
  atletaB: string; // 1..80
  seed: number; // 1..N consecutivo (padrão: alfabético — R3.4)
  criadoEm: string; // ISO; desempate de ordenação (R1.7) e de criação
}

export interface BracketConfig {
  formato: Format;
  // apenas quando formato === "fase de grupos":
  numeroDeGrupos?: number; // 1..floor(N/2)  (R2.5)
  classificadosPorGrupo?: number; // 1..(tamanho do menor grupo - 1) (R2.3)
}

export interface Participant {
  pairId: PairId | null; // null = indefinido (aguardando jogo anterior)
  bye?: boolean; // true quando é um "bye" (R4.6)
}

export interface Match {
  id: MatchId;
  side: BracketSide;
  rodada: number; // 1-based dentro do side
  ordem: number; // posição dentro da rodada (estável, determinística)
  a: Participant;
  b: Participant;
  vencedorId: PairId | null;
  registradoEm: string | null; // ISO (R6.1)
  grupoId?: GroupId; // quando side === "grupo"
  // Ligações de avanço (quem herda os slots deste jogo):
  avancaVencedorPara?: { matchId: MatchId; slot: "a" | "b" };
  encaminhaPerdedorPara?: { matchId: MatchId; slot: "a" | "b" }; // só upper -> lower
}

export interface Group {
  id: GroupId;
  indice: number; // 0-based, ordem determinística
  duplas: PairId[]; // membros do grupo
  jogos: MatchId[]; // round-robin do grupo
}

export interface Standing {
  pairId: PairId;
  vitorias: number;
  posicao: number; // 1 = primeiro colocado
}

export interface Bracket {
  campeonatoId: string;
  categoriaId: string;
  formato: Format;
  config: BracketConfig;
  duplas: Pair[]; // snapshot imutável usado na geração
  grupos: Group[]; // vazio quando formato === "dupla eliminação"
  matches: Match[]; // todos os jogos (grupo, upper, lower, grande final)
  campeaId: PairId | null; // definida ao concluir a grande final (R6.7)
  versao: number; // schema version do serializer
}

export type DomainError =
  | { code: "DUPLAS_INSUFICIENTES" } // R4.3
  | { code: "DUPLAS_EXCEDEM_LIMITE" } // R4.4
  | { code: "FORMATO_AUSENTE" } // R2.7
  | { code: "FORMATO_INVALIDO" } // R2.2
  | { code: "GRUPOS_INVALIDO" } // R2.6
  | { code: "CLASSIFICADOS_INVALIDO" } // R2.4
  | { code: "SEED_DUPLICADO"; posicao: number } // R3.2
  | { code: "SEED_FORA_INTERVALO"; posicao: number } // R3.3
  | { code: "SEED_LACUNA"; posicao: number } // R3.3
  | { code: "NOME_DUPLA_INVALIDO" } // R1.2
  | { code: "NOME_ATLETA_INVALIDO"; qual: "A" | "B" } // R1.3
  | { code: "NOME_DUPLICADO" } // R1.4
  | { code: "REMOCAO_BLOQUEADA" } // R1.6
  | { code: "VENCEDOR_INVALIDO" } // R6.2
  | { code: "JOGO_NAO_PRONTO" } // R6.3
  | { code: "FALHA_PERSISTENCIA" } // R7.2
  | { code: "FALHA_LEITURA" }; // R7.6
