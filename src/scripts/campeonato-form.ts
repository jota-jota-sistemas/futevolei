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
import { PRECO_A_CONFIRMAR, interpretarPreco, precoParaTexto } from "../domain/campeonatos/validation";

const CAMPOS: CampoCampeonato[] = [
  "nome",
  "data",
  "dataFim",
  "cidade",
  "uf",
  "endereco",
  "preco",
  "inscricao",
  "instagram",
  "descricao",
];

type Campo = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function campo(form: HTMLFormElement, nome: string): Campo | null {
  return form.querySelector<Campo>(`[name="${nome}"]`);
}

const ehAConfirmar = (texto: string | null | undefined): boolean =>
  (texto ?? "").trim().toLowerCase() === PRECO_A_CONFIRMAR.toLowerCase();

/**
 * Lê os valores crus do formulário. O preço é UM campo só: o texto exibível
 * (`precoTexto`) é derivado dele ("160" -> "R$ 160,00"), ou "Valor a confirmar"
 * quando a caixa está marcada. Na edição, um texto livre que já existia (ex.:
 * "Gratuito", "R$ 160 por dupla") é preservado enquanto o preço não mudar.
 */
export function lerFormulario(form: HTMLFormElement): CampeonatoInput {
  const valor = (nome: string) => campo(form, nome)?.value ?? "";
  const listado = campo(form, "listado") as HTMLInputElement | null;
  const aConfirmar = (campo(form, "precoAConfirmar") as HTMLInputElement | null)?.checked === true;

  let preco = valor("preco");
  let precoTexto = "";
  const precoOriginal = form.dataset.precoOriginal ?? "";
  const textoOriginal = form.dataset.precoTextoOriginal ?? "";
  if (aConfirmar) {
    preco = "";
    precoTexto = PRECO_A_CONFIRMAR;
  } else {
    const n = interpretarPreco(preco);
    if (typeof n === "number") {
      const mesmoPreco = precoOriginal !== "" && Number(precoOriginal) === n;
      precoTexto = mesmoPreco && textoOriginal !== "" ? textoOriginal : precoParaTexto(n);
    } else if (n === null && precoOriginal === "" && !ehAConfirmar(textoOriginal)) {
      // Sem preço e sem ter tido preço: mantém o texto livre que já existia.
      precoTexto = textoOriginal;
    }
    // n === undefined: preço inválido; a validação aponta o campo.
  }

  return {
    nome: valor("nome"),
    data: valor("data"),
    dataFim: valor("dataFim"),
    cidade: valor("cidade"),
    uf: valor("uf"),
    endereco: valor("endereco"),
    preco,
    precoTexto,
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
  // Guarda o preço e o texto originais: o texto só é regerado se o preço mudar.
  form.dataset.precoOriginal = c.preco === null ? "" : String(c.preco);
  form.dataset.precoTextoOriginal = c.precoTexto ?? "";
  const aConfirmar = campo(form, "precoAConfirmar") as HTMLInputElement | null;
  if (aConfirmar) aConfirmar.checked = c.preco === null && ehAConfirmar(c.precoTexto);
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
  const aConfirmar = campo(form, "precoAConfirmar") as HTMLInputElement | null;
  if (aConfirmar) aConfirmar.checked = false;
  delete form.dataset.precoOriginal;
  delete form.dataset.precoTextoOriginal;
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
  const el = campo(form, nome);
  el?.setAttribute("aria-invalid", "true");
  // Campo dentro de "Mais detalhes" fechado: abre para a pessoa ver o erro.
  const detalhes = el?.closest("details");
  if (detalhes) detalhes.open = true;
}

/**
 * Mostra TODOS os erros de uma vez (cada um no seu campo) e foca o primeiro campo
 * com erro. Erro sem campo na tela (ou sem campo) vira mensagem geral.
 */
export function mostrarErros(form: HTMLFormElement, erros: readonly CampeonatoErro[]): void {
  let primeiro: CampoCampeonato | null = null;
  const gerais: string[] = [];
  for (const erro of erros) {
    const nome = campoDoErro(erro);
    if (nome && form.querySelector(`[data-erro="${nome}"]`)) {
      mostrarErroCampo(form, nome, mensagemDoErro(erro));
      primeiro ??= nome;
    } else {
      gerais.push(mensagemDoErro(erro));
    }
  }
  if (gerais.length > 0) mostrarStatus(form, gerais.join(" "), "erro");
  if (primeiro) campo(form, primeiro)?.focus();
}

/**
 * Resumo ao lado de "Mais detalhes" (ex.: "(Santos/SP)"), para quem preenche
 * cidade/UF sem abrir o bloco (inclusive os lembrados do último evento) ver o
 * que está valendo. Atualiza ao digitar.
 */
export function ligarResumoDetalhes(form: HTMLFormElement): void {
  const alvo = form.querySelector<HTMLElement>("[data-detalhes-resumo]");
  if (!alvo) return;
  const atualizar = () => {
    const local = [campo(form, "cidade")?.value.trim(), campo(form, "uf")?.value]
      .filter(Boolean)
      .join("/");
    alvo.textContent = local ? `(${local})` : "";
  };
  for (const nome of ["cidade", "uf"]) {
    campo(form, nome)?.addEventListener("input", atualizar);
    campo(form, nome)?.addEventListener("change", atualizar);
  }
  atualizar();
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
