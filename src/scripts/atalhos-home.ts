// src/scripts/atalhos-home.ts
//
// Home: mostra o atalho "Organizar" nos cards dos eventos que a pessoa logada
// gerencia (administrador: todos; organizador: só os eventos em que é dono).
// Para visitantes e contas comuns nada muda, e o SDK do Supabase nem é carregado.
//
// A home é igual para todos (cache no CDN): o atalho é criado aqui, no navegador.
// É só conveniência; quem autoriza a organização é o banco (RLS) e a própria
// página de organizar.
//
// Contrato de DOM: cada card é `[data-evento][data-id]` com um `.event-card__corpo`.

import type { PapelGerenciar } from "../domain/auth/types";
import type { CampeonatoStore } from "../store/campeonatoStore";
import { hrefOrganizarCampeonato } from "../utils/url";
import { descobrirPapel } from "./papel-conta";

export interface DepsAtalhosHome {
  raiz?: ParentNode;
  /** Papel da pessoa logada (injetável em testes). */
  descobrir?: () => Promise<PapelGerenciar | null>;
  /** Cria a store de campeonatos só quando preciso (organizador). */
  criarCampeonatoStore?: () => CampeonatoStore | Promise<CampeonatoStore>;
}

const CLASSE = "event-card__organizar";

function adicionarAtalho(card: Element, id: string): void {
  const corpo = card.querySelector(".event-card__corpo");
  if (!corpo || corpo.querySelector(`.${CLASSE}`)) return; // idempotente
  const a = document.createElement("a");
  a.className = CLASSE;
  a.href = hrefOrganizarCampeonato(id);
  a.textContent = "Organizar";
  corpo.append(a);
}

export async function iniciarAtalhosHome(deps: DepsAtalhosHome = {}): Promise<void> {
  const raiz = deps.raiz ?? document;
  const cards = Array.from(raiz.querySelectorAll<HTMLElement>("[data-evento][data-id]"));
  if (cards.length === 0) return;

  try {
    const papel = await (deps.descobrir ?? (() => descobrirPapel()))();
    if (papel === null) return;

    // Administrador gerencia todos; organizador, só os eventos em que é dono.
    let meus: ReadonlySet<string> | null = null;
    if (papel === "organizador") {
      const criar =
        deps.criarCampeonatoStore ??
        (async () => (await import("../store/campeonatoStore")).criarCampeonatoStoreBrowser());
      const store = await criar();
      const r = await store.listarMeus({ incluirArquivados: true });
      if (!r.ok) return;
      meus = new Set(r.valor.map((c) => c.id));
    }

    for (const card of cards) {
      const id = card.dataset.id;
      if (!id) continue;
      if (meus === null || meus.has(id)) adicionarAtalho(card, id);
    }
  } catch {
    /* sem atalhos: a home segue igual */
  }
}
