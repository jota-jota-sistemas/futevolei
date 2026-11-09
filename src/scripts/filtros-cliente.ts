// Módulo cliente de filtragem de eventos (show/hide dos cards).
//
// Filtros suportados:
//  - Cidade  ([data-filtro="cidade"]): igualdade com cidadeDoLocal(data-local).
//  - Período ([data-filtro="preset"], hidden): preset de data convertido em
//    intervalo [data, dataAte] via intervaloDoPreset. Os chips [data-preset]
//    selecionam o preset (seleção única) e gravam o valor no input hidden.
//  - Categoria ([data-filtro="categoria"]): pertencimento em data-categorias.
//
// A filtragem só ocorre no clique de "Buscar eventos" ([data-buscar]); os chips
// de período apenas marcam a seleção (não filtram sozinhos). "Limpar filtros"
// ([data-limpar]) zera tudo. O "x" de um chip ativo ([data-chip-remover])
// limpa aquela dimensão. Delegação única de clique no document (robusto a HMR).
//
// Reutiliza as funções PURAS de ../utils/eventos (mesma regra nos testes e no
// navegador): corresponde, cidadeDoLocal, intervaloDoPreset.

import type { Campeonato } from "../types";
import {
  corresponde,
  cidadeDoLocal,
  intervaloDoPreset,
  type FiltrosEventos,
} from "../utils/eventos";

/** Controle (select/input) por chave [data-filtro], ou null. */
function controle(chave: string): HTMLInputElement | HTMLSelectElement | null {
  return document.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[data-filtro="${chave}"]`
  );
}

/** Valor atual de um controle, normalizado (trim), ou "". */
function valorDoControle(chave: string): string {
  return (controle(chave)?.value ?? "").trim();
}

/** "Hoje" em ISO YYYY-MM-DD (data local), para presets relativos. */
function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Monta os filtros atuais a partir dos controles (preset → intervalo). */
function filtrosAtuais(): FiltrosEventos {
  const preset = valorDoControle("preset");
  const { de, ate } = intervaloDoPreset(preset, hojeISO());
  return {
    cidade: valorDoControle("cidade"),
    data: de,
    dataAte: ate,
    categoria: valorDoControle("categoria"),
  };
}

/** Reconstrói o Campeonato parcial de um card a partir dos data-*. */
function campeonatoDoCard(
  card: HTMLElement
): Pick<Campeonato, "local" | "data" | "categorias"> {
  return {
    local: card.dataset.local ?? "",
    data: card.dataset.data ?? "",
    categorias: (card.dataset.categorias ?? "").split("|").filter((c) => c !== ""),
  };
}

/** Rótulo pt-BR do chip de período a partir do botão ativo (ou do valor). */
function rotuloPreset(preset: string): string {
  const btn = document.querySelector<HTMLElement>(`[data-preset="${preset}"]`);
  return btn?.textContent?.trim() || preset;
}

/** Atualiza o contador de resultados (singular/plural + "X de Y"). */
function atualizarContador(visiveis: number, total: number): void {
  const el = document.querySelector<HTMLElement>("[data-contador]");
  if (!el) return;
  const plural = visiveis === 1 ? "evento" : "eventos";
  el.textContent =
    visiveis === total ? `${total} ${plural}` : `${visiveis} de ${total} ${plural}`;
}

/** Renderiza um chip removível por filtro ativo (cidade, período, categoria). */
function renderizarChips(filtros: FiltrosEventos): void {
  const lista = document.querySelector<HTMLElement>("[data-chips]");
  if (!lista) return;
  lista.textContent = "";

  const ativos: { chave: string; icone: string; rotulo: string }[] = [];
  if (filtros.cidade) ativos.push({ chave: "cidade", icone: "📍", rotulo: filtros.cidade });
  const preset = valorDoControle("preset");
  if (preset) ativos.push({ chave: "preset", icone: "📅", rotulo: rotuloPreset(preset) });
  if (filtros.categoria) ativos.push({ chave: "categoria", icone: "🏷️", rotulo: filtros.categoria });

  for (const { chave, icone, rotulo } of ativos) {
    const li = document.createElement("li");
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "eventos__chip";
    chip.dataset.chipRemover = chave;
    chip.setAttribute("aria-label", `Remover filtro ${rotulo}`);

    const texto = document.createElement("span");
    texto.textContent = `${icone} ${rotulo}`;
    const x = document.createElement("span");
    x.className = "eventos__chip-x";
    x.setAttribute("aria-hidden", "true");
    x.textContent = "✕";

    chip.append(texto, x);
    li.append(chip);
    lista.append(li);
  }
}

/** Lê os filtros, reavalia cards, estado vazio, contador e chips. */
function aplicarFiltros(): void {
  const filtros = filtrosAtuais();
  const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-evento]"));

  let visiveis = 0;
  for (const card of cards) {
    const bate = corresponde(campeonatoDoCard(card) as Campeonato, filtros);
    card.hidden = !bate;
    if (bate) visiveis += 1;
  }

  const vazioFiltro = document.querySelector<HTMLElement>("[data-vazio-filtro]");
  if (vazioFiltro) vazioFiltro.hidden = !(visiveis === 0 && cards.length > 0);

  atualizarContador(visiveis, cards.length);
  renderizarChips(filtros);
}

/** Marca visualmente o chip de período ativo (aria-pressed) e grava o hidden. */
function selecionarPreset(valor: string): void {
  const hidden = controle("preset");
  if (hidden) hidden.value = valor;
  for (const btn of document.querySelectorAll<HTMLElement>("[data-preset]")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.preset === valor));
  }
}

/** Zera dimensões específicas (cidade/preset/categoria) e reaplica. */
function limpar(chaves: string[]): void {
  for (const chave of chaves) {
    if (chave === "preset") {
      selecionarPreset("");
    } else {
      const el = controle(chave);
      if (el) el.value = "";
    }
  }
  aplicarFiltros();
}

// Guard de idempotência: evita anexar o listener mais de uma vez caso o módulo
// seja importado/avaliado novamente (ex.: HMR, re-import em testes). Em produção
// o módulo carrega uma vez; aqui garantimos no máximo um handler no document.
interface ComFlag { __filtrosClienteRegistrado?: boolean }
const docFlag = document as unknown as ComFlag;

// Delegação única de clique: presets, Buscar, Limpar e remoção de chip.
if (!docFlag.__filtrosClienteRegistrado) {
  docFlag.__filtrosClienteRegistrado = true;
  document.addEventListener("click", (evento) => {
  const alvo = evento.target as Element | null;
  if (!alvo) return;

  // Chip de período (toggle de seleção única). Não filtra sozinho.
  const presetBtn = alvo.closest<HTMLElement>("[data-preset]");
  if (presetBtn) {
    const atual = valorDoControle("preset");
    const novo = presetBtn.dataset.preset ?? "";
    selecionarPreset(atual === novo ? "" : novo); // reclicar desmarca
    return;
  }

  // Remoção de um filtro ativo via "x" do chip.
  const chipRem = alvo.closest<HTMLElement>("[data-chip-remover]");
  if (chipRem) {
    limpar([chipRem.dataset.chipRemover!]);
    return;
  }

  if (alvo.closest("[data-buscar]")) {
    aplicarFiltros();
  } else if (alvo.closest("[data-limpar]")) {
    limpar(["cidade", "preset", "categoria"]);
  }
});
}
