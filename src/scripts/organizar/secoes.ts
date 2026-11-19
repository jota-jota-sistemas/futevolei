// src/scripts/organizar/secoes.ts
//
// Barra de seções da página de organização (Duplas · Formato · Chaveamento ·
// Jogos): marca a seção que está na tela (`aria-current="true"`) enquanto a
// pessoa rola. Sem `IntersectionObserver` a barra continua funcionando como
// âncoras, só sem a marcação.
//
// Contrato de DOM: links `[data-secao-link]` com `href="#id-da-secao"`.

export interface DepsSecoes {
  raiz?: ParentNode;
  /** Injetável em testes. */
  criarObservador?: (aoMudar: (visiveis: Set<string>) => void, alvos: Element[]) => () => void;
}

/** Observa os alvos e informa, a cada mudança, quais ids estão cruzando a faixa do topo. */
function observadorPadrao(aoMudar: (visiveis: Set<string>) => void, alvos: Element[]): () => void {
  if (typeof IntersectionObserver === "undefined") return () => undefined;
  const visiveis = new Set<string>();
  const obs = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        if (e.isIntersecting) visiveis.add(e.target.id);
        else visiveis.delete(e.target.id);
      }
      aoMudar(visiveis);
    },
    // Faixa estreita logo abaixo da barra: a seção "atual" é a que cruza essa linha.
    { rootMargin: "-120px 0px -65% 0px", threshold: 0 }
  );
  for (const a of alvos) obs.observe(a);
  return () => obs.disconnect();
}

export function ligarSecoes({ raiz = document, criarObservador = observadorPadrao }: DepsSecoes = {}): void {
  const links = Array.from(raiz.querySelectorAll<HTMLAnchorElement>("[data-secao-link]"));
  if (links.length === 0) return;

  const idDe = (a: HTMLAnchorElement): string => (a.getAttribute("href") ?? "").replace(/^#/, "");
  const alvos = links
    .map((a) => raiz.querySelector(`[id="${idDe(a).replace(/"/g, "")}"]`))
    .filter((el): el is Element => el !== null);
  if (alvos.length === 0) return;

  const marcar = (visiveis: Set<string>): void => {
    // A seção atual é a primeira (na ordem da barra) que está na faixa do topo.
    const atual = links.find((a) => visiveis.has(idDe(a)));
    for (const a of links) {
      if (a === atual) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    }
  };
  criarObservador(marcar, alvos);
}
