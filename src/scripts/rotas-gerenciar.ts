// src/scripts/rotas-gerenciar.ts
//
// Rotas da ÁREA DE GERENCIAMENTO de jogadores (/gerenciar_jogadores).
//
// Este módulo só é importado pelos scripts das páginas de gerenciamento. Fica
// separado de utils/url.ts de propósito: assim o caminho não entra nos arquivos
// JavaScript carregados pelas páginas públicas.
//
// A área é restrita a administradores logados (scripts/guarda.ts + RLS com
// eh_admin()). O link só aparece no menu para quem é administrador (script do
// cabeçalho), nunca no HTML estático. Atenção: a guarda da tela é só de
// interface; a proteção real dos dados é o RLS do Supabase.

import { comBase } from "../utils/url";

/** Lista de gerenciamento. */
export function hrefGerenciar(): string {
  return comBase("/gerenciar_jogadores");
}

/** Edição de um jogador na área de gerenciamento (o id vai na query string). */
export function hrefGerenciarJogador(id: string): string {
  return `${comBase("/gerenciar_jogadores/editar")}?id=${encodeURIComponent(id)}`;
}

/** Navega para a lista de gerenciamento (ex.: depois de excluir de vez). */
export function irParaGerenciar(): void {
  window.location.href = hrefGerenciar();
}
