// src/scripts/guarda.ts
//
// Guarda das telas de GERENCIAMENTO (jogadores e organização de campeonatos).
//
// Fluxo: o conteúdo protegido nasce oculto (componente GuardaAcesso). Este
// módulo confere a sessão e a permissão e então:
//   - visitante          -> vai para /entrar?volta=<página atual>;
//   - logado sem permissão -> mostra "Acesso restrito";
//   - administrador      -> revela o conteúdo e devolve true.
// Os scripts das telas só devem iniciar quando `guardarAcesso` devolver true.
//
// ATENÇÃO: isto é uma guarda de INTERFACE. O HTML estático da tela continua
// baixável por qualquer pessoa; quem protege os dados é o RLS do Supabase
// (escrita só com eh_admin()). Esta guarda evita confusão e esconde as telas.

import type { AuthStore } from "../store/authStore";
import type { PapelGerenciar } from "../domain/auth/types";
import { acessoGerenciar } from "../domain/auth/validation";
import { mensagemAuth } from "../domain/auth/mensagens";
import { hrefEntrar } from "./rotas-auth";

export interface OpcoesGuarda {
  store: AuthStore;
  /** Raiz onde procurar os elementos da guarda (padrão: document). */
  raiz?: ParentNode;
  /** Troca de página (injetável em testes). */
  irPara?: (url: string) => void;
  /** Caminho atual (pathname + search), para o `?volta=`. */
  caminhoAtual?: () => string;
  /**
   * Papéis que podem ver a tela. Padrão: só administradores. Com "organizador"
   * a guarda também consulta eh_organizador(); quem tem o papel mas não está na
   * lista vê "Acesso restrito". A posse de um evento específico é conferida pela
   * tela (campeonatoStore.podeGerenciar), não aqui.
   */
  permitir?: readonly PapelGerenciar[];
  /** Chamada quando o acesso é liberado, com o papel da pessoa. */
  aoLiberar?: (papel: PapelGerenciar) => void;
  /**
   * Verificação extra ANTES de revelar o conteúdo (ex.: posse de um evento).
   * `true` libera; `false` mostra "Acesso restrito"; um texto é mostrado como
   * mensagem de erro (ex.: falha ao consultar o banco) e nada é revelado.
   */
  verificar?: (papel: PapelGerenciar) => Promise<boolean | string>;
}

function achar<T extends HTMLElement>(raiz: ParentNode, seletor: string): T | null {
  return raiz.querySelector<T>(seletor);
}

/**
 * Confere o acesso. Devolve true só quando o conteúdo protegido foi liberado
 * (administrador). Nunca lança.
 */
export async function guardarAcesso(opcoes: OpcoesGuarda): Promise<boolean> {
  const { store } = opcoes;
  const raiz = opcoes.raiz ?? document;
  const irPara = opcoes.irPara ?? ((url: string) => window.location.replace(url));
  const caminhoAtual =
    opcoes.caminhoAtual ?? (() => window.location.pathname + window.location.search);

  const permitir: readonly PapelGerenciar[] = opcoes.permitir ?? ["admin"];

  const status = achar(raiz, "[data-guarda-status]");
  const negado = achar(raiz, "[data-guarda-negado]");
  const protegido = achar(raiz, "[data-protegido]");

  const mostrarStatus = (texto: string) => {
    if (status) {
      status.hidden = false;
      status.textContent = texto;
    }
  };

  const sessao = await store.sessaoAtual();
  if (!sessao.ok) {
    mostrarStatus(mensagemAuth(sessao.erro));
    return false;
  }

  const admin = sessao.valor ? await store.eAdmin() : null;
  if (admin && !admin.ok) {
    mostrarStatus(mensagemAuth(admin.erro));
    return false;
  }

  const ehAdmin = admin?.ok ? admin.valor : false;

  // Só consulta o papel de organizador quando a tela o aceita e a pessoa não é admin.
  let ehOrganizador = false;
  if (sessao.valor && !ehAdmin && permitir.includes("organizador")) {
    const organizador = await store.eOrganizador();
    if (!organizador.ok) {
      mostrarStatus(mensagemAuth(organizador.erro));
      return false;
    }
    ehOrganizador = organizador.valor;
  }

  const papel = acessoGerenciar(sessao.valor, ehAdmin, ehOrganizador);
  // Papel que a tela não aceita (ex.: organizador em tela só de admin) = sem permissão.
  const acesso =
    (papel === "admin" || papel === "organizador") && !permitir.includes(papel)
      ? "sem_permissao"
      : papel;

  if (acesso === "visitante") {
    mostrarStatus("Redirecionando para o login…");
    irPara(hrefEntrar(caminhoAtual()));
    return false;
  }

  if (acesso === "sem_permissao") {
    if (status) status.hidden = true;
    if (negado) negado.hidden = false;
    return false;
  }

  if (opcoes.verificar) {
    let veredito: boolean | string;
    try {
      veredito = await opcoes.verificar(acesso);
    } catch {
      veredito = false;
    }
    if (typeof veredito === "string") {
      mostrarStatus(veredito);
      return false;
    }
    if (!veredito) {
      if (status) status.hidden = true;
      if (negado) negado.hidden = false;
      return false;
    }
  }

  if (status) status.hidden = true;
  if (negado) negado.hidden = true;
  if (protegido) protegido.hidden = false;
  opcoes.aoLiberar?.(acesso);

  // Se a sessão acabar (sair em outra aba), volta a esconder e vai para o login.
  store.aoMudarSessao((nova) => {
    if (nova === null) {
      if (protegido) protegido.hidden = true;
      irPara(hrefEntrar(caminhoAtual()));
    }
  });
  return true;
}
