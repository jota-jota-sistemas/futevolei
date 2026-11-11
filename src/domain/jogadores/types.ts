// src/domain/jogadores/types.ts
//
// Tipos de domínio do perfil de jogador. Tipos puros, sem I/O.
//
// O erro tem tipo PRÓPRIO (e não entra no `DomainError` do chaveamento) para
// não obrigar os consumidores daquele union, como o `switch` da tela de
// organização, a tratar casos que não lhes dizem respeito.

export type JogadorId = string;

export const GENEROS_JOGADOR = ["masculino", "feminino"] as const;
export type GeneroJogador = (typeof GENEROS_JOGADOR)[number];

/** Jogador como o resto do sistema o enxerga (já persistido). */
export interface Jogador {
  id: JogadorId;
  nome: string; // 1..80 (trim)
  apelido: string | null; // 1..40 quando presente
  genero: GeneroJogador | null;
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
  cidade?: string;
  uf?: string;
  instagram?: string;
}

/** Entrada validada e normalizada (vazio vira null; texto sem espaços nas pontas). */
export interface JogadorDados {
  nome: string;
  apelido: string | null;
  genero: GeneroJogador | null;
  cidade: string | null;
  uf: string | null;
  instagram: string | null;
}

export type JogadorErro =
  | { code: "NOME_JOGADOR_INVALIDO" } // 1..80 após trim
  | { code: "APELIDO_INVALIDO" } // 1..40 quando informado
  | { code: "GENERO_INVALIDO" }
  | { code: "CIDADE_INVALIDA" } // 1..80 quando informada
  | { code: "UF_INVALIDA" }
  | { code: "INSTAGRAM_INVALIDO" }
  | { code: "JOGADOR_NAO_ENCONTRADO" }
  | { code: "FALHA_PERSISTENCIA" } // erro de escrita
  | { code: "FALHA_LEITURA" }; // erro de leitura

export type ResultadoJogador<T> =
  | { ok: true; valor: T }
  | { ok: false; erro: JogadorErro };
