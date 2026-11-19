// src/scripts/criar-evento-home.ts
//
// Home: revela o botão "Criar evento" no hero para quem está logado como
// administrador ou organizador. Visitantes e contas comuns não veem nada, e o SDK
// do Supabase nem é carregado para quem nunca entrou neste navegador.
//
// A home é igual para todos (cache no CDN): o botão nasce oculto e SEM link no HTML
// estático; o link é posto aqui, no navegador. É só conveniência: quem autoriza a
// criação do evento é o banco (RLS) e a própria página de gerenciamento.
//
// Contrato de DOM: um `<a data-criar-evento hidden>`.

import type { PapelGerenciar } from "../domain/auth/types";
import { descobrirPapel } from "./papel-conta";
import { hrefGerenciarCampeonatos } from "./rotas-gerenciar";

/** Âncora do cartão "Novo campeonato" na lista de gerenciamento. */
export const ANCORA_NOVO_CAMPEONATO = "novo-campeonato";

export interface DepsCriarEventoHome {
  raiz?: ParentNode;
  /** Papel da pessoa logada (injetável em testes). */
  descobrir?: () => Promise<PapelGerenciar | null>;
}

export async function iniciarCriarEventoHome(deps: DepsCriarEventoHome = {}): Promise<void> {
  const raiz = deps.raiz ?? document;
  const botao = raiz.querySelector<HTMLAnchorElement>("[data-criar-evento]");
  if (!botao) return;

  try {
    const papel = await (deps.descobrir ?? (() => descobrirPapel()))();
    if (papel !== "admin" && papel !== "organizador") return;
    botao.href = `${hrefGerenciarCampeonatos()}#${ANCORA_NOVO_CAMPEONATO}`;
    botao.hidden = false;
  } catch {
    /* sem botão: a home segue igual */
  }
}
