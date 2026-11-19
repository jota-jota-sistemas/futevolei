// src/scripts/campeonatos-lista.ts
//
// Tela /gerenciar_campeonatos: lista com busca, filtro de arquivados e cadastro
// de novo campeonato. Recebe a store por injeção (testável sem Supabase).
//
// Contrato de DOM (data-*), dentro de `raiz`:
//   [data-lista] ul · [data-estado-lista] · [data-busca] · [data-mostrar-arquivados]
//   [data-contador-campeonatos] · [data-campeonato-form] (ver components/CampeonatoForm.astro)
//
// Só existe na área de gerenciamento (administradores): lista também os
// arquivados e permite cadastrar. Os dados são carregados UMA vez e filtrados em
// memória; criar um campeonato atualiza a lista local sem nova leitura.

import type { CampeonatoRegistro } from "../domain/campeonatos/types";
import { mensagemDoErro } from "../domain/campeonatos/mensagens";
import {
  filtrarCampeonatos,
  ordenarCampeonatos,
  validarCampeonato,
} from "../domain/campeonatos/validation";
import type { CampeonatoStore } from "../store/campeonatoStore";
import { formatarPeriodo } from "../utils/url";
import {
  definirEnviando,
  esconderStatus,
  lerFormulario,
  limparErros,
  limparFormulario,
  mostrarErro,
  mostrarStatus,
} from "./campeonato-form";
import { hrefGerenciarCampeonato } from "./rotas-gerenciar";

export interface DepsLista {
  store: CampeonatoStore;
  raiz?: ParentNode;
  /** Link da edição de cada campeonato. Padrão: a página de edição do gerenciamento. */
  hrefEditar?: (id: string) => string;
  /**
   * Lista só os campeonatos da conta como dona (organizador). Padrão `false`:
   * administrador, que vê todos.
   */
  apenasMeus?: boolean;
}

function plural(n: number, singular: string, pluralTxt: string): string {
  return `${n} ${n === 1 ? singular : pluralTxt}`;
}

/** Subtítulo do item: período · Cidade/UF (só o que existir). */
function subtituloDe(c: CampeonatoRegistro): string {
  const local = [c.cidade, c.uf].filter(Boolean).join("/");
  return [formatarPeriodo(c.data, c.dataFim ?? undefined), local].filter(Boolean).join(" · ");
}

function chip(texto: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "cl-chip";
  span.textContent = texto;
  return span;
}

/** Monta o item da lista com DOM seguro (textContent; nunca innerHTML). */
function itemDe(c: CampeonatoRegistro, hrefEditar: (id: string) => string): HTMLLIElement {
  const li = document.createElement("li");
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
  a.append(info);

  const chips = document.createElement("span");
  chips.className = "cl-chips";
  if (!c.ativo) chips.append(chip("Arquivado"));
  if (!c.listado) chips.append(chip("Oculto na home"));
  if (chips.childElementCount > 0) a.append(chips);

  li.append(a);
  return li;
}

export async function iniciarLista({
  store,
  raiz = document,
  hrefEditar = hrefGerenciarCampeonato,
  apenasMeus = false,
}: DepsLista): Promise<void> {
  const q = <T extends Element>(seletor: string) => raiz.querySelector<T>(seletor);
  const lista = q<HTMLElement>("[data-lista]");
  const estado = q<HTMLElement>("[data-estado-lista]");
  const busca = q<HTMLInputElement>("[data-busca]");
  const arquivados = q<HTMLInputElement>("[data-mostrar-arquivados]");
  const contador = q<HTMLElement>("[data-contador-campeonatos]");
  const form = q<HTMLFormElement>("[data-campeonato-form]");
  if (!lista || !estado) return;

  // O organizador vê só os dele: o título da lista acompanha.
  if (apenasMeus) {
    const titulo = q<HTMLElement>("#lista-campeonatos-titulo");
    if (titulo) titulo.textContent = "Meus campeonatos";
  }

  let todos: CampeonatoRegistro[] = [];

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

  function render(): void {
    // Arquivados só aparecem se o filtro estiver marcado.
    const base = arquivados?.checked ? todos : todos.filter((c) => c.ativo);
    const filtrados = filtrarCampeonatos(base, busca?.value ?? "");

    lista!.textContent = "";
    for (const c of filtrados) lista!.append(itemDe(c, hrefEditar));

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
    } else if (filtrados.length === 0) {
      mostrarEstado("Nenhum campeonato encontrado para os filtros atuais.");
    } else {
      estado!.hidden = true;
    }
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
    todos = ordenarCampeonatos(r.valor);
    render();
  }

  busca?.addEventListener("input", render);
  arquivados?.addEventListener("change", render);

  if (form) {
    const formulario = form;

    async function submeter(): Promise<void> {
      limparErros(formulario);
      esconderStatus(formulario);
      const entrada = lerFormulario(formulario);

      const validado = validarCampeonato(entrada);
      if (!validado.ok) {
        mostrarErro(formulario, validado.erro);
        return;
      }

      definirEnviando(formulario, true);
      const r = await store.criar(entrada);
      definirEnviando(formulario, false);

      if (!r.ok) {
        mostrarErro(formulario, r.erro);
        return;
      }
      todos = ordenarCampeonatos([...todos, r.valor]);
      render();
      limparFormulario(formulario);
      mostrarStatus(formulario, `${r.valor.nome} foi cadastrado.`);
    }

    formulario.addEventListener("submit", (evento) => {
      evento.preventDefault();
      void submeter();
    });
  }

  await carregar();
}
