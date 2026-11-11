// src/scripts/rotas-gerenciar.ts
//
// Rotas da ÁREA DE GERENCIAMENTO de jogadores (/gerenciar_jogadores).
//
// Este módulo só é importado pelos scripts das páginas de gerenciamento. Fica
// separado de utils/url.ts de propósito: assim o caminho não entra nos arquivos
// JavaScript carregados pelas páginas públicas.
//
// A área não aparece no menu nem em nenhum link das páginas públicas: só se
// chega nela digitando o endereço (decisão do MVP). Atenção: isso é discrição,
// NÃO controle de acesso. Enquanto não houver login, a escrita no banco segue
// liberada ao papel anônimo (RLS), então quem souber a URL, ou chamar a API do
// Supabase direto, ainda consegue alterar dados.

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
