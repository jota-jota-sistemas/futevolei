// Módulo cliente de filtragem de eventos (show/hide dos cards).
//
// Filtros suportados:
//  - Cidade  ([data-filtro="cidade"]): igualdade com cidadeDoLocal(data-local).
//  - Período ([data-filtro="preset"], hidden): preset de data convertido em
//    intervalo [data, dataAte] via intervaloDoPreset. Os chips [data-preset]
//    selecionam o preset (seleção única) e gravam o valor no input hidden.
//  - Nível ([data-filtro="nivel"]) e Gênero ([data-filtro="genero"], hidden):
//    classificação das categorias do card (data-categorias) em nível/gênero.
//    Os dois são avaliados na MESMA categoria (ver utils/categorias.ts). Os
//    chips [data-genero] selecionam o gênero (seleção única).
//
// A filtragem só ocorre no clique de "Buscar eventos" ([data-buscar]); os chips
// de período e de gênero apenas marcam a seleção (não filtram sozinhos). "Limpar filtros"
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

// Limite de cards exibidos no estado inicial (sem filtro e não expandido).
// Deve casar com LIMITE_INICIAL de EventsSection.astro, que marca os cards
// além desse índice com data-excedente.
const LIMITE_INICIAL = 8;

// Estado de expansão do feed: false = colapsado (mostra só os primeiros
// LIMITE_INICIAL quando não há filtro ativo); true = todos revelados ("Ver
// todos"). O limite só se aplica quando NÃO há filtro ativo.
let expandido = false;

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
    nivel: valorDoControle("nivel"),
    genero: valorDoControle("genero"),
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

/** Renderiza um chip removível por filtro ativo (cidade, período, nível, gênero). */
function renderizarChips(filtros: FiltrosEventos): void {
  const lista = document.querySelector<HTMLElement>("[data-chips]");
  if (!lista) return;
  lista.textContent = "";

  const ativos: { chave: string; icone: string; rotulo: string }[] = [];
  if (filtros.cidade) ativos.push({ chave: "cidade", icone: "📍", rotulo: filtros.cidade });
  const preset = valorDoControle("preset");
  if (preset) ativos.push({ chave: "preset", icone: "📅", rotulo: rotuloPreset(preset) });
  if (filtros.nivel) ativos.push({ chave: "nivel", icone: "🏷️", rotulo: filtros.nivel });
  if (filtros.genero) ativos.push({ chave: "genero", icone: "👥", rotulo: filtros.genero });

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

/** Há ao menos um filtro ativo (cidade, período, nível ou gênero)? */
function algumFiltroAtivo(filtros: FiltrosEventos): boolean {
  return Boolean(
    filtros.cidade ||
      filtros.data ||
      filtros.dataAte ||
      filtros.nivel ||
      filtros.genero
  );
}

/**
 * Lê os filtros, reavalia cards, estado vazio, contador, chips e o botão
 * "Ver todos". Combina DUAS dimensões de visibilidade:
 *  - correspondência ao filtro (corresponde);
 *  - limite inicial: quando NÃO há filtro ativo e o feed está colapsado,
 *    os cards marcados com data-excedente (além de LIMITE_INICIAL) ficam
 *    ocultos até o clique em "Ver todos".
 * Um card só aparece se corresponder ao filtro E não estiver sob o limite.
 */
function aplicarFiltros(): void {
  const filtros = filtrosAtuais();
  const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-evento]"));

  const temFiltro = algumFiltroAtivo(filtros);
  // O limite só vale no estado inicial: sem filtro ativo e feed colapsado.
  const limitar = !temFiltro && !expandido;

  let correspondentes = 0; // passam no filtro (ignorando o limite)
  let visiveis = 0; // de fato exibidos (filtro E limite)
  for (const card of cards) {
    const bate = corresponde(campeonatoDoCard(card) as Campeonato, filtros);
    if (bate) correspondentes += 1;

    const excedente = card.dataset.excedente === "true";
    const mostrar = bate && !(limitar && excedente);
    card.hidden = !mostrar;
    if (mostrar) visiveis += 1;
  }

  const vazioFiltro = document.querySelector<HTMLElement>("[data-vazio-filtro]");
  if (vazioFiltro) vazioFiltro.hidden = !(correspondentes === 0 && cards.length > 0);

  // Contador: no estado limitado, reflete "X de Y" (exibidos de total); com
  // filtro, reflete os correspondentes.
  atualizarContador(limitar ? visiveis : correspondentes, cards.length);
  renderizarChips(filtros);

  // Botão "Ver todos": visível apenas quando o limite está escondendo cards.
  const botao = document.querySelector<HTMLElement>("[data-ver-todos]");
  if (botao) botao.hidden = !(limitar && cards.length > LIMITE_INICIAL);

  const grid = document.querySelector<HTMLElement>("[data-grid-eventos]");
  if (grid) {
    // Sinaliza que o JS assumiu o controle da visibilidade: a partir daqui
    // cada card é mostrado/ocultado via [hidden], e a regra CSS de fallback
    // do estado colapsado (que usa data-excedente) deixa de atuar.
    grid.dataset.js = "true";
    grid.dataset.expandido = String(expandido);
  }
}

/** Grupos de chips de seleção única; a chave é também o [data-filtro] do hidden. */
type GrupoChips = "preset" | "genero";

/** Marca o chip ativo do grupo (aria-pressed) e grava o valor no hidden. */
function selecionarChip(grupo: GrupoChips, valor: string): void {
  const hidden = controle(grupo);
  if (hidden) hidden.value = valor;
  for (const btn of document.querySelectorAll<HTMLElement>(`[data-${grupo}]`)) {
    btn.setAttribute("aria-pressed", String(btn.dataset[grupo] === valor));
  }
}

/**
 * Zera dimensões específicas (cidade/preset/nivel/genero) e reaplica. Quando
 * `recolher` é true (uso do "Limpar filtros"), também volta o feed ao estado
 * colapsado, de modo que a home retorne a mostrar apenas os primeiros
 * LIMITE_INICIAL cards. Na remoção de um chip individual, `recolher` é false.
 */
function limpar(chaves: string[], recolher = false): void {
  for (const chave of chaves) {
    if (chave === "preset" || chave === "genero") {
      selecionarChip(chave, "");
    } else {
      const el = controle(chave);
      if (el) el.value = "";
    }
  }
  if (recolher) expandido = false;
  aplicarFiltros();
}

/** Expande o feed (revela todos os cards) e reaplica. */
function verTodos(): void {
  expandido = true;
  aplicarFiltros();
}

// Guard de idempotência: evita anexar o listener mais de uma vez caso o módulo
// seja importado/avaliado novamente (ex.: HMR, re-import em testes). Em produção
// o módulo carrega uma vez; aqui garantimos no máximo um handler no document.
interface ComFlag { __filtrosClienteRegistrado?: boolean }
const docFlag = document as unknown as ComFlag;

// Delegação única de clique: chips de período/gênero, Buscar, Limpar e remoção de chip.
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
    selecionarChip("preset", atual === novo ? "" : novo); // reclicar desmarca
    return;
  }

  // Chip de gênero (mesmo comportamento: seleção única, reclicar desmarca).
  const generoBtn = alvo.closest<HTMLElement>("[data-genero]");
  if (generoBtn) {
    const atual = valorDoControle("genero");
    const novo = generoBtn.dataset.genero ?? "";
    selecionarChip("genero", atual === novo ? "" : novo);
    return;
  }

  // Remoção de um filtro ativo via "x" do chip.
  const chipRem = alvo.closest<HTMLElement>("[data-chip-remover]");
  if (chipRem) {
    limpar([chipRem.dataset.chipRemover!]);
    return;
  }

  // "Ver todos os eventos": expande o feed na própria página.
  if (alvo.closest("[data-ver-todos]")) {
    verTodos();
    return;
  }

  if (alvo.closest("[data-buscar]")) {
    aplicarFiltros();
  } else if (alvo.closest("[data-limpar]")) {
    limpar(["cidade", "preset", "nivel", "genero"], true);
  }
  });

  // Sincroniza o estado inicial assim que o módulo carrega: aplica o limite
  // colapsado (sem filtro ainda) e passa o controle de visibilidade ao JS.
  // A partir daqui, a regra CSS de fallback do colapso não é mais necessária.
  aplicarFiltros();
}
