// src/domain/jogadores/types.ts
//
// Tipos de domínio do perfil de jogador. Tipos puros, sem I/O.
//
// O erro tem tipo PRÓPRIO (e não entra no `DomainError` do chaveamento) para
// não obrigar os consumidores daquele union, como o `switch` da tela de
// organização, a tratar casos que não lhes dizem respeito.

import { NIVEIS, type Nivel } from "../../utils/categorias";

export type JogadorId = string;

export const GENEROS_JOGADOR = ["masculino", "feminino"] as const;
export type GeneroJogador = (typeof GENEROS_JOGADOR)[number];

/**
 * Categoria (nível) do jogador. Reaproveita o vocabulário de Nível do filtro de
 * eventos (utils/categorias.ts), sem "Outros", que não descreve um jogador. Assim
 * a categoria do jogador e a do evento falam a mesma língua.
 */
export type CategoriaJogador = Exclude<Nivel, "Outros">;

export const CATEGORIAS_JOGADOR: readonly CategoriaJogador[] = NIVEIS.filter(
  (nivel): nivel is CategoriaJogador => nivel !== "Outros"
);

/** Jogador como o resto do sistema o enxerga (já persistido). */
export interface Jogador {
  id: JogadorId;
  nome: string; // 1..80 (trim)
  apelido: string | null; // 1..40 quando presente
  genero: GeneroJogador | null;
  categoria: CategoriaJogador | null;
  cidade: string | null; // 1..80 quando presente
  uf: string | null; // sigla de 2 letras maiúsculas
  instagram: string | null; // só o @usuario, sem "@", minúsculo
  ativo: boolean; // false = arquivado
  criadoEm: string; // ISO
  atualizadoEm: string; // ISO
}

/**
 * Entrada crua, como vem de um formulário: tudo texto, campos opcionais
 * podem estar ausentes ou vazios. É o que `validarJogador` recebe.
 */
export interface JogadorInput {
  nome: string;
  apelido?: string;
  genero?: string;
  categoria?: string;
  cidade?: string;
  uf?: string;
  instagram?: string;
}

/** Entrada validada e normalizada (vazio vira null; texto sem espaços nas pontas). */
export interface JogadorDados {
  nome: string;
  apelido: string | null;
  genero: GeneroJogador | null;
  categoria: CategoriaJogador | null;
  cidade: string | null;
  uf: string | null;
  instagram: string | null;
}

/**
 * Uma inscrição em dupla da qual o jogador participou. Vem de `duplas`
 * (vinculada por `jogador_a_id`/`jogador_b_id`) com a categoria e o evento.
 * Os nomes são os GRAVADOS na inscrição (foto do momento), não o cadastro atual.
 */
export interface ParticipacaoDupla {
  duplaId: string;
  atletaA: string;
  atletaB: string;
  /** Lugar do jogador na dupla. */
  posicao: "A" | "B";
  /** Perfil do parceiro, quando ele também está vinculado a um jogador. */
  parceiroJogadorId: string | null;
  /** Nome da categoria na qual a dupla foi inscrita (ex.: "Open"). */
  categoria: string | null;
  campeonato: { id: string; nome: string; data: string } | null;
  inscritaEm: string; // ISO
}

export type JogadorErro =
  | { code: "NOME_JOGADOR_INVALIDO" } // 1..80 após trim
  | { code: "APELIDO_INVALIDO" } // 1..40 quando informado
  | { code: "GENERO_INVALIDO" }
  | { code: "CATEGORIA_INVALIDA" } // fora do vocabulário de níveis
  | { code: "CIDADE_INVALIDA" } // 1..80 quando informada
  | { code: "UF_INVALIDA" }
  | { code: "INSTAGRAM_INVALIDO" }
  | { code: "JOGADOR_NAO_ENCONTRADO" }
  | { code: "FALHA_PERSISTENCIA" } // erro de escrita
  | { code: "FALHA_LEITURA" }; // erro de leitura

export type ResultadoJogador<T> =
  | { ok: true; valor: T }
  | { ok: false; erro: JogadorErro };
