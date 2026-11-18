// src/scripts/rotas-gerenciar.ts
//
// Rotas das ÁREAS DE GERENCIAMENTO: o painel (/gerenciar), os jogadores
// (/gerenciar_jogadores) e os campeonatos (/gerenciar_campeonatos).
//
// Este módulo só é importado pelos scripts das páginas de gerenciamento (e pelo
// menu/conta, que só o usam depois de saber que a pessoa é administradora).
// Fica separado de utils/url.ts de propósito: assim os caminhos não entram nos
// arquivos JavaScript carregados pelas páginas públicas.
//
// As áreas são restritas a administradores logados (scripts/guarda.ts + RLS com
// eh_admin()). O link só aparece no menu para quem é administrador (script do
// cabeçalho), nunca no HTML estático. Atenção: a guarda da tela é só de
// interface; a proteção real dos dados é o RLS do Supabase.

import { comBase } from "../utils/url";

/** Painel de gerenciamento (escolha entre jogadores e campeonatos). */
export function hrefGerenciar(): string {
  return comBase("/gerenciar");
}

// ---- Jogadores -------------------------------------------------------------

/** Lista de gerenciamento de jogadores. */
export function hrefGerenciarJogadores(): string {
  return comBase("/gerenciar_jogadores");
}

/** Edição de um jogador na área de gerenciamento (o id vai na query string). */
export function hrefGerenciarJogador(id: string): string {
  return `${comBase("/gerenciar_jogadores/editar")}?id=${encodeURIComponent(id)}`;
}

/** Navega para a lista de gerenciamento de jogadores (ex.: depois de excluir de vez). */
export function irParaGerenciarJogadores(): void {
  window.location.href = hrefGerenciarJogadores();
}

// ---- Campeonatos -----------------------------------------------------------

/** Lista de gerenciamento de campeonatos. */
export function hrefGerenciarCampeonatos(): string {
  return comBase("/gerenciar_campeonatos");
}

/** Edição de um campeonato na área de gerenciamento (o id vai na query string). */
export function hrefGerenciarCampeonato(id: string): string {
  return `${comBase("/gerenciar_campeonatos/editar")}?id=${encodeURIComponent(id)}`;
}

/** Navega para a lista de gerenciamento de campeonatos (ex.: depois de excluir de vez). */
export function irParaGerenciarCampeonatos(): void {
  window.location.href = hrefGerenciarCampeonatos();
}
