// src/scripts/topo.ts
//
// Ajuste do link "Voltar" da faixa de topo (components/PaginaTopo.astro) depois
// que o papel da pessoa é conhecido. Ex.: o organizador não usa o painel
// /gerenciar (só tem os campeonatos), então o "Voltar" da lista dele vai ao início.

/** Troca o destino e o texto do link `[data-voltar]`, mantendo a seta decorativa. */
export function trocarVoltar(raiz: ParentNode, href: string, texto: string): void {
  const a = raiz.querySelector<HTMLAnchorElement>("[data-voltar]");
  if (!a) return;
  a.href = href;
  a.textContent = "";
  const seta = document.createElement("span");
  seta.setAttribute("aria-hidden", "true");
  seta.textContent = "←";
  a.append(seta, ` ${texto}`);
}
