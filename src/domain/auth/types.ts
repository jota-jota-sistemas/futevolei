// src/domain/auth/types.ts
//
// Tipos do domínio de autenticação. Puro: sem I/O e sem dependência do SDK.

/** Sessão mínima que o site precisa conhecer. */
export interface Sessao {
  userId: string;
  /** E-mail verificado pelo provedor (Google ou link mágico), se houver. */
  email: string | null;
}

/** Perfil da conta (tabela `perfis`). */
export interface Perfil {
  id: string;
  nome: string | null;
  avatarUrl: string | null;
  /** Jogador cadastrado ao qual a conta está vinculada, se houver. */
  jogadorId: string | null;
}

export type AuthErroCode =
  | "EMAIL_INVALIDO"
  | "LIMITE_ENVIOS"
  | "FALHA_REDE"
  | "FALHA_AUTENTICACAO"
  | "NAO_AUTENTICADO"
  | "JOGADOR_JA_VINCULADO"
  | "JOGADOR_NAO_ENCONTRADO"
  | "FALHA_PERSISTENCIA"
  | "FALHA_LEITURA";

export interface AuthErro {
  code: AuthErroCode;
}

export type ResultadoAuth<T> =
  | { ok: true; valor: T }
  | { ok: false; erro: AuthErro };

/** Estado de acesso às telas de gerenciamento. */
export type AcessoGerenciar = "visitante" | "sem_permissao" | "admin";
