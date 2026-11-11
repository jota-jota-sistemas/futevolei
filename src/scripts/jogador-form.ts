// src/scripts/jogador-form.ts
//
// Helpers de DOM do formulário de jogador (`components/JogadorForm.astro`),
// compartilhados entre o cadastro (lista) e a edição (perfil). Só mexe no DOM:
// as regras de validação vivem em `domain/jogadores`.

import type { Jogador, JogadorErro, JogadorInput } from "../domain/jogadores/types";
import { campoDoErro, mensagemDoErro, type CampoJogador } from "../domain/jogadores/mensagens";

const CAMPOS: CampoJogador[] = ["nome", "apelido", "genero", "cidade", "uf", "instagram"];

type Campo = HTMLInputElement | HTMLSelectElement;

function campo(form: HTMLFormElement, nome: string): Campo | null {
  return form.querySelector<Campo>(`[name="${nome}"]`);
}

/** Lê os valores crus do formulário. */
export function lerFormulario(form: HTMLFormElement): JogadorInput {
  const valor = (nome: string) => campo(form, nome)?.value ?? "";
  return {
    nome: valor("nome"),
    apelido: valor("apelido"),
    genero: valor("genero"),
    cidade: valor("cidade"),
    uf: valor("uf"),
    instagram: valor("instagram"),
  };
}

/** Preenche o formulário com os dados de um jogador (campos ausentes ficam vazios). */
export function preencherFormulario(form: HTMLFormElement, jogador: Jogador): void {
  const definir = (nome: string, valor: string | null) => {
    const el = campo(form, nome);
    if (el) el.value = valor ?? "";
  };
  definir("nome", jogador.nome);
  definir("apelido", jogador.apelido);
  definir("genero", jogador.genero);
  definir("cidade", jogador.cidade);
  definir("uf", jogador.uf);
  definir("instagram", jogador.instagram ? `@${jogador.instagram}` : "");
}

/** Esvazia todos os campos e limpa mensagens. */
export function limparFormulario(form: HTMLFormElement): void {
  for (const nome of CAMPOS) {
    const el = campo(form, nome);
    if (el) el.value = "";
  }
  limparErros(form);
  esconderHomonimos(form);
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
  nome: CampoJogador,
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
export function mostrarErro(form: HTMLFormElement, erro: JogadorErro): void {
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

/**
 * Mostra o aviso de homônimo com links para os perfis já existentes. O usuário
 * escolhe entre "Salvar mesmo assim" e "Revisar" (botões do próprio markup).
 */
export function mostrarHomonimos(
  form: HTMLFormElement,
  homonimos: readonly { id: string; nome: string }[],
  hrefPerfil: (id: string) => string
): void {
  const caixa = form.querySelector<HTMLElement>("[data-homonimos]");
  const texto = form.querySelector<HTMLElement>("[data-homonimos-texto]");
  const lista = form.querySelector<HTMLElement>("[data-homonimos-lista]");
  if (!caixa || !texto || !lista) return;

  texto.textContent =
    homonimos.length === 1
      ? "Já existe um jogador com este nome. É a mesma pessoa?"
      : `Já existem ${homonimos.length} jogadores com este nome. É a mesma pessoa?`;

  lista.textContent = "";
  for (const h of homonimos) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = hrefPerfil(h.id);
    a.textContent = h.nome;
    a.target = "_blank";
    a.rel = "noopener";
    li.append(a);
    lista.append(li);
  }
  caixa.hidden = false;
}

export function esconderHomonimos(form: HTMLFormElement): void {
  const caixa = form.querySelector<HTMLElement>("[data-homonimos]");
  if (caixa) caixa.hidden = true;
}
