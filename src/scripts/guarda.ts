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

  const acesso = acessoGerenciar(sessao.valor, admin?.ok ? admin.valor : false);

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

  if (status) status.hidden = true;
  if (negado) negado.hidden = true;
  if (protegido) protegido.hidden = false;

  // Se a sessão acabar (sair em outra aba), volta a esconder e vai para o login.
  store.aoMudarSessao((nova) => {
    if (nova === null) {
      if (protegido) protegido.hidden = true;
      irPara(hrefEntrar(caminhoAtual()));
    }
  });
  return true;
}
