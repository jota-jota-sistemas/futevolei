// src/domain/categorias/types.ts
//
// Tipos de domínio das CATEGORIAS de um campeonato (Open, Feminino Iniciante…).
// Tipos puros, sem I/O. Erro próprio (não entra no `DomainError` do chaveamento).

export type CategoriaId = string;

/** Uma categoria do campeonato, com quantas duplas já estão inscritas nela. */
export interface CategoriaItem {
  id: CategoriaId;
  nome: string;
  duplas: number;
}

export type CategoriaErro =
  | { code: "NOME_INVALIDO" } // 1..60 após normalizar
  | { code: "CATEGORIA_NAO_ENCONTRADA" }
  | { code: "TEM_DUPLAS" } // não remove categoria com duplas (a cascata apagaria tudo)
  | { code: "SEM_PERMISSAO" } // o banco recusou: a conta não gerencia este campeonato
  | { code: "FALHA_PERSISTENCIA" } // erro de escrita
  | { code: "FALHA_LEITURA" }; // erro de leitura

export type ResultadoCategoria<T> =
  | { ok: true; valor: T }
  | { ok: false; erro: CategoriaErro };

/** O que `mesclarCategorias` decidiu fazer com uma lista de nomes novos. */
export interface MesclaCategorias {
  /** Nomes (normalizados) que ainda não existem e podem ser criados. */
  adicionar: string[];
  /** Nomes que já existem (ou repetem outro da própria lista): ignorados. */
  repetidas: string[];
  /** Nomes que não passam na validação. */
  invalidas: string[];
}
