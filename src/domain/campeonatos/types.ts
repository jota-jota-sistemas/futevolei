// src/domain/campeonatos/types.ts
//
// Tipos de domínio do GERENCIAMENTO de campeonatos (eventos). Tipos puros, sem I/O.
//
// Campeonato e evento são a mesma coisa (tabela `campeonatos`). Estes tipos são
// os da área de gerenciamento; o tipo `Campeonato` de `src/types.ts` continua
// sendo o que as páginas públicas conhecem.
//
// O erro tem tipo PRÓPRIO (como o de jogadores): não entra no `DomainError` do
// chaveamento.

export type CampeonatoId = string;

/** Campeonato como o gerenciamento o enxerga (já persistido). */
export interface CampeonatoRegistro {
  id: CampeonatoId;
  nome: string; // 1..120 (trim)
  data: string; // ISO YYYY-MM-DD (início)
  dataFim: string | null; // ISO; >= data quando presente
  cidade: string | null;
  uf: string | null; // sigla de 2 letras maiúsculas
  endereco: string | null;
  preco: number | null; // valor numérico (>= 0) quando informado
  precoTexto: string | null; // texto exibível (ex.: "R$ 160,00" ou "A confirmar")
  inscricao: string | null; // URL http/https
  instagram: string | null; // "@usuario" ou URL do instagram.com
  descricao: string | null;
  /** Aparece na home e tem página de detalhe. */
  listado: boolean;
  /** false = arquivado (some de tudo no site). */
  ativo: boolean;
  /** Origem do registro: "manual" para os criados na área de gerenciamento. */
  fonte: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

/** Nomes das categorias do campeonato (leitura). */
export interface CampeonatoDetalhe extends CampeonatoRegistro {
  categorias: string[];
}

/**
 * Entrada crua, como vem de um formulário: tudo texto, campos opcionais podem
 * estar ausentes ou vazios. É o que `validarCampeonato` recebe.
 */
export interface CampeonatoInput {
  nome: string;
  data: string;
  dataFim?: string;
  cidade?: string;
  uf?: string;
  endereco?: string;
  preco?: string;
  precoTexto?: string;
  inscricao?: string;
  instagram?: string;
  descricao?: string;
  /** Padrão: true (aparece na home). */
  listado?: boolean;
}

/** Entrada validada e normalizada (vazio vira null; texto sem espaços nas pontas). */
export interface CampeonatoDados {
  nome: string;
  data: string;
  dataFim: string | null;
  cidade: string | null;
  uf: string | null;
  endereco: string | null;
  preco: number | null;
  precoTexto: string | null;
  inscricao: string | null;
  instagram: string | null;
  descricao: string | null;
  listado: boolean;
}

export type CampeonatoErro =
  | { code: "NOME_INVALIDO" } // 1..120 após trim
  | { code: "DATA_INVALIDA" } // obrigatória, ISO e existente no calendário
  | { code: "DATA_FIM_INVALIDA" } // ISO válida e >= data
  | { code: "CIDADE_INVALIDA" }
  | { code: "UF_INVALIDA" }
  | { code: "ENDERECO_INVALIDO" }
  | { code: "PRECO_INVALIDO" }
  | { code: "PRECO_TEXTO_INVALIDO" }
  | { code: "INSCRICAO_INVALIDA" } // URL http/https
  | { code: "INSTAGRAM_INVALIDO" }
  | { code: "DESCRICAO_INVALIDA" }
  | { code: "CAMPEONATO_NAO_ENCONTRADO" }
  | { code: "FALHA_PERSISTENCIA" } // erro de escrita
  | { code: "FALHA_LEITURA" }; // erro de leitura

export type ResultadoCampeonato<T> =
  | { ok: true; valor: T }
  | { ok: false; erro: CampeonatoErro };
