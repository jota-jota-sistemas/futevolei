// src/domain/auth/mensagens.ts
//
// Mensagens pt-BR e mapeamento dos erros do Supabase Auth. Pura.

import type { AuthErro, AuthErroCode } from "./types";

/** Forma mínima do erro do SDK (AuthError / PostgrestError). */
export interface ErroBruto {
  message?: string;
  status?: number;
  code?: string;
  name?: string;
}

/** Código do Postgres para violação de unicidade. */
const PG_UNIQUE_VIOLATION = "23505";

/**
 * Traduz um erro do Supabase Auth em um código do domínio. Nunca devolve o
 * texto bruto (pode conter detalhes internos).
 */
export function mapearErroAuth(erro: ErroBruto | null | undefined): AuthErro {
  if (!erro) return { code: "FALHA_AUTENTICACAO" };
  const msg = (erro.message ?? "").toLowerCase();
  const codigo = (erro.code ?? "").toLowerCase();
  if (
    erro.status === 429 ||
    codigo.includes("rate_limit") ||
    msg.includes("rate limit") ||
    msg.includes("too many")
  ) {
    return { code: "LIMITE_ENVIOS" };
  }
  if (codigo === "validation_failed" || codigo === "email_address_invalid" || msg.includes("invalid email")) {
    return { code: "EMAIL_INVALIDO" };
  }
  if (erro.name === "AuthRetryableFetchError" || msg.includes("fetch") || msg.includes("network")) {
    return { code: "FALHA_REDE" };
  }
  return { code: "FALHA_AUTENTICACAO" };
}

/** Violação de unicidade do Postgres (jogador já vinculado a outra conta). */
export function ehViolacaoUnicidade(erro: ErroBruto | null | undefined): boolean {
  return erro?.code === PG_UNIQUE_VIOLATION;
}

const MENSAGENS: Record<AuthErroCode, string> = {
  EMAIL_INVALIDO: "Informe um e-mail válido.",
  LIMITE_ENVIOS: "Muitos pedidos em pouco tempo. Aguarde alguns minutos e tente de novo.",
  FALHA_REDE: "Sem conexão com o servidor. Verifique sua internet e tente de novo.",
  FALHA_AUTENTICACAO: "Não foi possível entrar. Tente novamente em instantes.",
  NAO_AUTENTICADO: "Entre na sua conta para continuar.",
  JOGADOR_JA_VINCULADO: "Esse jogador já está vinculado a outra conta.",
  JOGADOR_NAO_ENCONTRADO: "Jogador não encontrado.",
  FALHA_PERSISTENCIA: "Falha ao salvar. Tente novamente em instantes.",
  FALHA_LEITURA: "Não foi possível carregar os dados. Tente novamente em instantes.",
};

export function mensagemAuth(erro: AuthErro): string {
  return MENSAGENS[erro.code];
}
