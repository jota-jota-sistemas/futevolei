// src/scripts/campeonatos-lista.ts
//
// Tela /gerenciar_campeonatos ("Meus eventos"): lista com busca, filtros por
// situação (próximos, passados, arquivados), progresso de cada evento, atalhos
// contextuais (Criar categorias / Organizar / Continuar / Duplicar) e cadastro de
// novo campeonato. Recebe as stores por injeção (testável sem Supabase).
//
// Contrato de DOM (data-*), dentro de `raiz`:
//   [data-lista] ul · [data-estado-lista] · [data-busca] · [data-filtros-estado]
//   [data-contador-campeonatos] · [data-campeonato-form] (ver components/CampeonatoForm.astro)
//
// Só existe na área de gerenciamento (administradores e organizadores). Os dados
// são carregados UMA vez e filtrados em memória; o progresso (categorias, duplas,
// chaveamentos e jogos) chega depois, em lote, e só enriquece as linhas: se
// falhar, a lista continua funcionando.

import type { CampeonatoRegistro } from "../domain/campeonatos/types";
import { mensagemDoErro } from "../domain/campeonatos/mensagens";
import {
  FILTROS_ESTADO,
  PROGRESSO_VAZIO,
  acontecendoHoje,
  contarPorEstado,
  filtroInicial,
  filtrarPorEstado,
  ordenarParaGestao,
  resumirProgresso,
  rotuloProgresso,
  type DadosProgresso,
  type FiltroEstado,
} from "../domain/campeonatos/progresso";
import { filtrarCampeonatos, validarCampeonatoTodos } from "../domain/campeonatos/validation";
import type { CampeonatoStore } from "../store/campeonatoStore";
import type { ProgressoStore } from "../store/progressoStore";
import { hojeSaoPaulo } from "../utils/eventos-db";
import {
  formatarPeriodo,
  hrefOrganizarCampeonato,
  hrefOrganizarCategoria,
  slugCategoria,
} from "../utils/url";
import {
  definirEnviando,
  esconderStatus,
  lerFormulario,
  ligarResumoDetalhes,
  limparErros,
  limparFormulario,
  mostrarErro,
  mostrarErros,
  mostrarStatus,
} from "./campeonato-form";
import { gravarUltimoLocal, lerUltimoLocal, type ArmazenamentoSimples } from "./ultimo-local";
import { hrefGerenciarCampeonato } from "./rotas-gerenciar";

export interface DepsLista {
  store: CampeonatoStore;
  /** Progresso em lote (categorias, duplas, chaveamento, jogos). Sem ele, a lista só não mostra o progresso. */
  progressoStore?: ProgressoStore;
  raiz?: ParentNode;
  /** Link da edição de cada campeonato. Padrão: a página de edição do gerenciamento. */
  hrefEditar?: (id: string) => string;
  /**
   * Lista só os campeonatos da conta como dona (organizador). Padrão `false`:
   * administrador, que vê todos.
   */
  apenasMeus?: boolean;
  /** Navegação depois de criar (padrão: `window.location.assign`). */
  irPara?: (url: string) => void;
  /** Armazenamento do "último local" (injetável em testes); `null` desliga. */
  armazenamento?: ArmazenamentoSimples | null;
  /** "Hoje" (YYYY-MM-DD) injetável em testes. Padrão: hoje em São Paulo. */
  hoje?: () => string;
}

function plural(n: number, singular: string, pluralTxt: string): string {
  return `${n} ${n === 1 ? singular : pluralTxt}`;
}

/** Subtítulo do item: período · Cidade/UF (só o que existir). */
function subtituloDe(c: CampeonatoRegistro): string {
  const local = [c.cidade, c.uf].filter(Boolean).join("/");
  return [formatarPeriodo(c.data, c.dataFim ?? undefined), local].filter(Boolean).join(" · ");
}

function chip(texto: string, classe = ""): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = `cl-chip ${classe}`.trim();
  span.textContent = texto;
  return span;
}

/** Ação principal da linha, conforme a etapa do evento (um clique até o próximo passo). */
function acaoPrincipal(
  c: CampeonatoRegistro,
  progresso: DadosProgresso | undefined,
  hrefEditar: (id: string) => string
): { rotulo: string; href: string } {
  if (!progresso) return { rotulo: "Organizar", href: hrefOrganizarCampeonato(c.id) };
  const r = resumirProgresso(progresso);
  if (r.etapa === "sem_categorias") {
    return { rotulo: "Criar categorias", href: `${hrefEditar(c.id)}#categorias` };
  }
  const rotulo = r.etapa === "em_andamento" ? "Continuar" : "Organizar";
  // Uma categoria só: vai direto a ela, sem passar pelo índice.
  const href =
    r.nomesCategorias.length === 1
      ? hrefOrganizarCategoria(c.id, slugCategoria(r.nomesCategorias[0]))
      : hrefOrganizarCampeonato(c.id);
  return { rotulo, href };
}

/** Monta o item da lista com DOM seguro (textContent; nunca innerHTML). */
function itemDe(
  c: CampeonatoRegistro,
  hrefEditar: (id: string) => string,
  progresso: DadosProgresso | undefined,
  hoje: string
): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "cl-linha";
  const a = document.createElement("a");
  a.className = "cl-item";
  a.href = hrefEditar(c.id);

  const info = document.createElement("span");
  info.className = "cl-info";
  const nome = document.createElement("span");
  nome.className = "cl-nome";
  nome.textContent = c.nome;
  info.append(nome);
  const sub = subtituloDe(c);
  if (sub) {
    const s = document.createElement("span");
    s.className = "cl-sub";
    s.textContent = sub;
    info.append(s);
  }
  if (progresso) {
    const p = document.createElement("span");
    p.className = "cl-progresso";
    p.textContent = rotuloProgresso(resumirProgresso(progresso));
    info.append(p);
  }
  a.append(info);

  const chips = document.createElement("span");
  chips.className = "cl-chips";
  if (!c.ativo) chips.append(chip("Arquivado"));
  if (c.ativo && acontecendoHoje(c, hoje)) chips.append(chip("Hoje", "cl-chip--hoje"));
  if (!c.listado) chips.append(chip("Oculto na home"));
  if (chips.childElementCount > 0) a.append(chips);

  li.append(a);

  const acoes = document.createElement("div");
  acoes.className = "cl-acoes";
  // Arquivado não tem página de organizar (ela só existe para campeonatos ativos).
  if (c.ativo) {
    const principal = acaoPrincipal(c, progresso, hrefEditar);
    const organizar = document.createElement("a");
    organizar.className = "cl-organizar";
    organizar.href = principal.href;
    organizar.textContent = principal.rotulo;
    organizar.setAttribute("aria-label", `${principal.rotulo} ${c.nome}`);
    acoes.append(organizar);
  }
  const duplicar = document.createElement("a");
  duplicar.className = "cl-duplicar";
  duplicar.href = `${hrefEditar(c.id)}#duplicar`;
  duplicar.textContent = "Duplicar";
  duplicar.setAttribute("aria-label", `Duplicar ${c.nome}`);
  acoes.append(duplicar);
  li.append(acoes);
  return li;
}

export async function iniciarLista({
  store,
  progressoStore,
  raiz = document,
  hrefEditar = hrefGerenciarCampeonato,
  apenasMeus = false,
  irPara = (url: string) => window.location.assign(url),
  armazenamento,
  hoje = hojeSaoPaulo,
}: DepsLista): Promise<void> {
  const q = <T extends Element>(seletor: string) => raiz.querySelector<T>(seletor);
  const lista = q<HTMLElement>("[data-lista]");
  const estado = q<HTMLElement>("[data-estado-lista]");
  const busca = q<HTMLInputElement>("[data-busca]");
  const filtros = q<HTMLElement>("[data-filtros-estado]");
  const contador = q<HTMLElement>("[data-contador-campeonatos]");
  const form = q<HTMLFormElement>("[data-campeonato-form]");
  if (!lista || !estado) return;

  // O organizador vê só os dele: o título da lista acompanha.
  if (apenasMeus) {
    const titulo = q<HTMLElement>("#lista-campeonatos-titulo");
    if (titulo) titulo.textContent = "Meus campeonatos";
  }

  let todos: CampeonatoRegistro[] = [];
  let progresso: Record<string, DadosProgresso> = {};
  let filtro: FiltroEstado = "proximos";

  function mostrarEstado(texto: string, comRetentar = false): void {
    estado!.textContent = texto;
    estado!.hidden = false;
    if (comRetentar) {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "cl-retentar";
      botao.textContent = "Tentar novamente";
      botao.addEventListener("click", () => void carregar());
      estado!.append(" ", botao);
    }
  }

  /** Chips de filtro com a contagem de cada um (botões de alternância, 44px). */
  function renderFiltros(): void {
    if (!filtros) return;
    const contagens = contarPorEstado(todos, hoje());
    filtros.textContent = "";
    for (const f of FILTROS_ESTADO) {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "cl-filtro";
      botao.dataset.filtro = f.valor;
      botao.setAttribute("aria-pressed", String(f.valor === filtro));
      botao.textContent = `${f.rotulo} (${contagens[f.valor]})`;
      botao.addEventListener("click", () => {
        filtro = f.valor;
        render();
      });
      filtros.append(botao);
    }
  }

  function render(): void {
    const h = hoje();
    renderFiltros();
    const base = filtrarPorEstado(todos, filtro, h);
    const filtrados = ordenarParaGestao(filtrarCampeonatos(base, busca?.value ?? ""), h);

    lista!.textContent = "";
    for (const c of filtrados) lista!.append(itemDe(c, hrefEditar, progresso[c.id], h));

    if (contador) {
      contador.textContent =
        filtrados.length === base.length
          ? plural(base.length, "campeonato", "campeonatos")
          : `${filtrados.length} de ${plural(base.length, "campeonato", "campeonatos")}`;
    }

    if (todos.length === 0) {
      mostrarEstado(
        apenasMeus
          ? "Você ainda não tem campeonatos. Cadastre o primeiro ao lado."
          : "Nenhum campeonato cadastrado ainda. Cadastre o primeiro ao lado."
      );
    } else if (base.length === 0) {
      const rotulo = FILTROS_ESTADO.find((f) => f.valor === filtro)?.rotulo ?? "";
      mostrarEstado(`Nenhum campeonato em “${rotulo}”. Escolha outro filtro acima.`);
    } else if (filtrados.length === 0) {
      mostrarEstado("Nenhum campeonato encontrado para os filtros atuais.");
    } else {
      estado!.hidden = true;
    }
  }

  /** Progresso de todos os campeonatos ativos, em lote. Falha = lista sem progresso. */
  async function carregarProgresso(): Promise<void> {
    if (!progressoStore) return;
    const ids = todos.filter((c) => c.ativo).map((c) => c.id);
    const r = await progressoStore.carregar(ids);
    if (!r.ok) return;
    progresso = { ...progresso, ...r.valor };
    render();
  }

  async function carregar(): Promise<void> {
    mostrarEstado("Carregando campeonatos…");
    const r = apenasMeus
      ? await store.listarMeus({ incluirArquivados: true })
      : await store.listar({ incluirArquivados: true });
    if (!r.ok) {
      lista!.textContent = "";
      mostrarEstado(mensagemDoErro(r.erro), true);
      return;
    }
    todos = r.valor;
    filtro = filtroInicial(todos, hoje());
    render();
    void carregarProgresso();
  }

  busca?.addEventListener("input", render);

  if (form) {
    const formulario = form;

    // Cidade e UF do último evento criado já vêm preenchidas (só se estiverem vazias).
    const lembrado = armazenamento === undefined ? lerUltimoLocal() : lerUltimoLocal(armazenamento);
    if (lembrado) {
      const cidade = formulario.querySelector<HTMLInputElement>('[name="cidade"]');
      const uf = formulario.querySelector<HTMLSelectElement>('[name="uf"]');
      if (cidade && cidade.value === "") cidade.value = lembrado.cidade;
      if (uf && uf.value === "") uf.value = lembrado.uf;
    }
    ligarResumoDetalhes(formulario);

    async function submeter(): Promise<void> {
      limparErros(formulario);
      esconderStatus(formulario);
      const entrada = lerFormulario(formulario);

      // Todos os erros de uma vez (cada um no seu campo), em vez de um por tentativa.
      const erros = validarCampeonatoTodos(entrada);
      if (erros.length > 0) {
        mostrarErros(formulario, erros);
        return;
      }

      definirEnviando(formulario, true);
      const r = await store.criar(entrada);
      definirEnviando(formulario, false);

      if (!r.ok) {
        mostrarErro(formulario, r.erro);
        return;
      }
      // Próximo passo natural: escolher as categorias. Vai direto à edição do
      // evento novo (âncora #categorias), em vez de deixar a pessoa na lista.
      if (armazenamento === undefined) gravarUltimoLocal(r.valor);
      else gravarUltimoLocal(r.valor, armazenamento);
      todos = [...todos, r.valor];
      progresso = { ...progresso, [r.valor.id]: { ...PROGRESSO_VAZIO, nomesCategorias: [] } };
      render();
      limparFormulario(formulario);
      mostrarStatus(formulario, `${r.valor.nome} foi cadastrado. Abrindo as categorias…`);
      irPara(`${hrefEditar(r.valor.id)}#categorias`);
    }

    formulario.addEventListener("submit", (evento) => {
      evento.preventDefault();
      void submeter();
    });
  }

  await carregar();
}
