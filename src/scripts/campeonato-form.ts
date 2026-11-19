// src/scripts/campeonato-form.ts
//
// Helpers de DOM do formulário de campeonato (`components/CampeonatoForm.astro`),
// compartilhados entre o cadastro (lista) e a edição. Só mexe no DOM: as regras
// de validação vivem em `domain/campeonatos`.

import type {
  CampeonatoErro,
  CampeonatoInput,
  CampeonatoRegistro,
} from "../domain/campeonatos/types";
import {
  campoDoErro,
  mensagemDoErro,
  type CampoCampeonato,
} from "../domain/campeonatos/mensagens";

const CAMPOS: CampoCampeonato[] = [
  "nome",
  "data",
  "dataFim",
  "cidade",
  "uf",
  "endereco",
  "preco",
  "precoTexto",
  "inscricao",
  "instagram",
  "descricao",
];

type Campo = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function campo(form: HTMLFormElement, nome: string): Campo | null {
  return form.querySelector<Campo>(`[name="${nome}"]`);
}

/** Lê os valores crus do formulário. */
export function lerFormulario(form: HTMLFormElement): CampeonatoInput {
  const valor = (nome: string) => campo(form, nome)?.value ?? "";
  const listado = campo(form, "listado") as HTMLInputElement | null;
  return {
    nome: valor("nome"),
    data: valor("data"),
    dataFim: valor("dataFim"),
    cidade: valor("cidade"),
    uf: valor("uf"),
    endereco: valor("endereco"),
    preco: valor("preco"),
    precoTexto: valor("precoTexto"),
    inscricao: valor("inscricao"),
    instagram: valor("instagram"),
    descricao: valor("descricao"),
    listado: listado ? listado.checked : true,
  };
}

/** Texto do preço para o campo: "160,5" (vírgula decimal), ou "" sem preço. */
function precoParaCampo(preco: number | null): string {
  return preco === null ? "" : String(preco).replace(".", ",");
}

/** Preenche o formulário com os dados de um campeonato (campos ausentes ficam vazios). */
export function preencherFormulario(form: HTMLFormElement, c: CampeonatoRegistro): void {
  const definir = (nome: string, valor: string | null) => {
    const el = campo(form, nome);
    if (el) el.value = valor ?? "";
  };
  definir("nome", c.nome);
  definir("data", c.data);
  definir("dataFim", c.dataFim);
  definir("cidade", c.cidade);
  definir("uf", c.uf);
  definir("endereco", c.endereco);
  definir("preco", precoParaCampo(c.preco));
  definir("precoTexto", c.precoTexto);
  definir("inscricao", c.inscricao);
  definir("instagram", c.instagram);
  definir("descricao", c.descricao);
  const listado = campo(form, "listado") as HTMLInputElement | null;
  if (listado) listado.checked = c.listado;
}

/** Esvazia todos os campos (listado volta a ligado) e limpa mensagens. */
export function limparFormulario(form: HTMLFormElement): void {
  for (const nome of CAMPOS) {
    const el = campo(form, nome);
    if (el) el.value = "";
  }
  const listado = campo(form, "listado") as HTMLInputElement | null;
  if (listado) listado.checked = true;
  limparErros(form);
  esconderStatus(form);
}

/** Remove as mensagens de erro de campo e o estado inválido. */
export function limparErros(form: HTMLFormElement): void {
  for (const p of form.querySelectorAll<HTMLElement>("[data-erro]")) {
    p.textContent = "";
    p.hidden = true;
  }
  for (const nome of CAMPOS) campo(form, nome)?.removeAttribute("aria-invalid");
}

/** Mostra a mensagem de um campo e o marca como inválido. */
export function mostrarErroCampo(
  form: HTMLFormElement,
  nome: CampoCampeonato,
  mensagem: string
): void {
  const p = form.querySelector<HTMLElement>(`[data-erro="${nome}"]`);
  if (p) {
    p.textContent = mensagem;
    p.hidden = false;
  }
  campo(form, nome)?.setAttribute("aria-invalid", "true");
}

/** Mensagem geral do formulário (sucesso ou erro). `role=status` anuncia a leitores de tela. */
export function mostrarStatus(
  form: HTMLFormElement,
  texto: string,
  tipo: "ok" | "erro" = "ok"
): void {
  const el = form.querySelector<HTMLElement>("[data-status]");
  if (!el) return;
  el.textContent = texto;
  el.dataset.tipo = tipo;
  el.hidden = false;
}

/**
 * Mensagem de sucesso seguida de links de ação (ex.: "Editar", "Organizar"),
 * para a pessoa seguir em um clique. DOM seguro: só `textContent` e `href`.
 */
export function mostrarStatusComLinks(
  form: HTMLFormElement,
  texto: string,
  links: readonly { rotulo: string; href: string }[]
): void {
  const el = form.querySelector<HTMLElement>("[data-status]");
  if (!el) return;
  el.textContent = `${texto} `;
  el.dataset.tipo = "ok";
  for (const l of links) {
    const a = document.createElement("a");
    a.className = "cf__link";
    a.href = l.href;
    a.textContent = l.rotulo;
    el.append(a);
  }
  el.hidden = false;
}

export function esconderStatus(form: HTMLFormElement): void {
  const el = form.querySelector<HTMLElement>("[data-status]");
  if (!el) return;
  el.textContent = "";
  el.hidden = true;
}

/**
 * Exibe um erro de domínio: no campo correspondente (com foco) quando houver;
 * caso contrário, como mensagem geral.
 */
export function mostrarErro(form: HTMLFormElement, erro: CampeonatoErro): void {
  const nome = campoDoErro(erro);
  if (nome) {
    mostrarErroCampo(form, nome, mensagemDoErro(erro));
    campo(form, nome)?.focus();
  } else {
    mostrarStatus(form, mensagemDoErro(erro), "erro");
  }
}

/** Habilita/desabilita o envio enquanto há uma requisição em andamento. */
export function definirEnviando(form: HTMLFormElement, enviando: boolean): void {
  const botao = form.querySelector<HTMLButtonElement>("[data-enviar]");
  if (botao) botao.disabled = enviando;
}
