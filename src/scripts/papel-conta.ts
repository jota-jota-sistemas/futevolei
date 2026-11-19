// src/scripts/papel-conta.ts
//
// Descobre se a pessoa logada é administradora ou organizadora, para as telas
// PÚBLICAS (home e página do evento) revelarem os atalhos de gerenciamento.
//
// Páginas públicas são iguais para todos (HTML em cache no CDN); o que muda por
// pessoa é decidido aqui, no navegador, e o banco continua sendo quem de fato
// autoriza qualquer escrita (RLS). Para quem nunca entrou neste navegador não
// carrega o SDK do Supabase: só olha se há sessão salva (como o menu do topo).
// Nunca lança: qualquer falha vira "sem papel" (nenhum atalho aparece).

import { temSessaoSalva } from "../utils/menu";
import type { PapelGerenciar } from "../domain/auth/types";
import type { AuthStore } from "../store/authStore";

export interface OpcoesPapel {
  /** Cria a store só quando preciso (evita carregar o SDK à toa). */
  criarStore?: () => AuthStore | Promise<AuthStore>;
  /** Chaves do armazenamento local (injetável em testes). */
  chavesStorage?: () => string[];
}

function chavesDoLocalStorage(): string[] {
  try {
    return Object.keys(window.localStorage);
  } catch {
    return [];
  }
}

/** `admin`, `organizador` ou `null` (visitante, conta comum ou falha). */
export async function descobrirPapel(opcoes: OpcoesPapel = {}): Promise<PapelGerenciar | null> {
  const chaves = (opcoes.chavesStorage ?? chavesDoLocalStorage)();
  if (!temSessaoSalva(chaves)) return null;

  try {
    const criar =
      opcoes.criarStore ??
      (async () => (await import("../store/authStore")).criarAuthStoreBrowser());
    const store = await criar();

    const sessao = await store.sessaoAtual();
    if (!sessao.ok || sessao.valor === null) return null;

    const admin = await store.eAdmin();
    if (admin.ok && admin.valor) return "admin";

    const organizador = await store.eOrganizador();
    if (organizador.ok && organizador.valor) return "organizador";
    return null;
  } catch {
    return null;
  }
}
