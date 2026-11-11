// src/domain/auth/validation.ts
//
// Regras puras de autenticação: e-mail, decisão de acesso e retorno seguro
// após o login. Nada aqui acessa rede, relógio ou DOM.

import type { AcessoGerenciar, Sessao } from "./types";

const EMAIL_MAX = 254;
// Forma simples: algo@dominio.tld, sem espaços. A validação de verdade é do
// provedor (o link só chega a um e-mail real).
const EMAIL_FORMA = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** E-mail em minúsculas e sem espaços nas pontas (formato guardado em `administradores`). */
export function normalizarEmail(texto: string): string {
  return (texto ?? "").trim().toLowerCase();
}

/** Devolve o e-mail normalizado se tiver forma válida, senão null. */
export function validarEmail(texto: string): string | null {
  const email = normalizarEmail(texto);
  if (email === "" || email.length > EMAIL_MAX) return null;
  return EMAIL_FORMA.test(email) ? email : null;
}

/**
 * Decide o acesso à área de gerenciamento. `admin` é o resultado da consulta
 * ao banco (eh_admin()); sem sessão ninguém é admin, mesmo que `admin` venha true.
 */
export function acessoGerenciar(sessao: Sessao | null, admin: boolean): AcessoGerenciar {
  if (sessao === null) return "visitante";
  return admin ? "admin" : "sem_permissao";
}

/** Só administradores logados podem gerenciar. */
export function podeGerenciar(sessao: Sessao | null, admin: boolean): boolean {
  return acessoGerenciar(sessao, admin) === "admin";
}

/**
 * Valida o parâmetro `volta` (para onde ir depois do login) contra open
 * redirect. Aceita apenas caminhos internos: começam com uma única "/", sem
 * "//", sem barra invertida, sem caracteres de controle e sem esquema. Qualquer
 * outra coisa vira `padrao`.
 */
export function caminhoSeguro(volta: string | null | undefined, padrao = "/"): string {
  if (typeof volta !== "string" || volta === "") return padrao;
  if (!volta.startsWith("/") || volta.startsWith("//")) return padrao;
  if (volta.includes("\\")) return padrao;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(volta)) return padrao;
  // Descodifica uma vez para pegar "/%2F..." e "/%5C...", que alguns
  // navegadores tratariam como "//" ou "\".
  try {
    const dec = decodeURIComponent(volta);
    if (dec.startsWith("//") || dec.includes("\\")) return padrao;
  } catch {
    return padrao;
  }
  return volta;
}
