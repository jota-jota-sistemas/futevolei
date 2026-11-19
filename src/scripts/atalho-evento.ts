// src/scripts/atalho-evento.ts
//
// Página pública do evento (/campeonatos/[id]): revela os botões "Organizar" e
// "Editar campeonato" para quem gerencia o evento (administrador, ou organizador
// que é dono dele). Para os demais nada muda, e o SDK do Supabase nem é carregado
// para quem não tem sessão salva.
//
// A página é igual para todos (cache no CDN) e não traz os caminhos de gerenciar
// no HTML: o bloco nasce oculto e os links são preenchidos aqui. É só
// conveniência; quem autoriza é o banco (RLS) e as próprias páginas de destino.
//
// Contrato de DOM: `[data-gestao][data-campeonato-id]` com `[data-gestao-organizar]`
// e `[data-gestao-editar]` (links).

import type { PapelGerenciar } from "../domain/auth/types";
import type { CampeonatoStore } from "../store/campeonatoStore";
import { hrefOrganizarCampeonato } from "../utils/url";
import { descobrirPapel } from "./papel-conta";
import { hrefGerenciarCampeonato } from "./rotas-gerenciar";

export interface DepsAtalhoEvento {
  raiz?: ParentNode;
  /** Papel da pessoa logada (injetável em testes). */
  descobrir?: () => Promise<PapelGerenciar | null>;
  /** Cria a store de campeonatos só quando preciso (organizador). */
  criarCampeonatoStore?: () => CampeonatoStore | Promise<CampeonatoStore>;
}

export async function iniciarAtalhoEvento(deps: DepsAtalhoEvento = {}): Promise<void> {
  const raiz = deps.raiz ?? document;
  const bloco = raiz.querySelector<HTMLElement>("[data-gestao]");
  const id = bloco?.dataset.campeonatoId;
  if (!bloco || !id) return;

  try {
    const papel = await (deps.descobrir ?? (() => descobrirPapel()))();
    if (papel === null) return;

    // Administrador gerencia todos; organizador, só os eventos em que é dono
    // (o banco responde, o mesmo que as páginas de destino conferem).
    if (papel === "organizador") {
      const criar =
        deps.criarCampeonatoStore ??
        (async () => (await import("../store/campeonatoStore")).criarCampeonatoStoreBrowser());
      const store = await criar();
      const posse = await store.podeGerenciar(id);
      if (!posse.ok || !posse.valor) return;
    }

    const organizar = bloco.querySelector<HTMLAnchorElement>("[data-gestao-organizar]");
    const editar = bloco.querySelector<HTMLAnchorElement>("[data-gestao-editar]");
    if (organizar) organizar.href = hrefOrganizarCampeonato(id);
    if (editar) editar.href = hrefGerenciarCampeonato(id);
    bloco.hidden = false;
  } catch {
    /* sem atalhos: a página segue igual */
  }
}
