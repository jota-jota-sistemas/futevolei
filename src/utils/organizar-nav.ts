// src/utils/organizar-nav.ts
//
// Navegação das páginas de ORGANIZAÇÃO (índice e categoria): abas para trocar de
// categoria em um clique e atalhos para o resto do campeonato. Funções puras; os
// componentes `OrganizarAbas.astro` e `OrganizarAtalhos.astro` só renderizam.

import { hrefOrganizarCategoria, comBase, slugCategoria } from "./url";

export interface AbaCategoria {
  nome: string;
  href: string;
  /** É a categoria da página atual. */
  atual: boolean;
}

/**
 * Uma aba por categoria, na ordem recebida (o banco já devolve em ordem
 * alfabética). `atual` é o nome da categoria aberta; a comparação usa o slug da
 * rota, o mesmo critério que a página usa para achar a categoria.
 */
export function abasDeCategorias(
  campeonatoId: string,
  categorias: readonly string[],
  atual?: string
): AbaCategoria[] {
  const slugAtual = atual === undefined ? null : slugCategoria(atual);
  return categorias.map((nome) => ({
    nome,
    href: hrefOrganizarCategoria(campeonatoId, slugCategoria(nome)),
    atual: slugAtual !== null && slugCategoria(nome) === slugAtual,
  }));
}

export interface AtalhoOrganizar {
  rotulo: string;
  href: string;
}

export interface EntradaAtalhos {
  id: string;
  /** Só eventos listados têm página pública e "Acompanhar partidas". */
  listado: boolean;
  temCategorias: boolean;
  /** Link de edição do campeonato (a rota de gerenciar vem de quem chama). */
  hrefEditar: string;
}

/** Atalhos do campeonato: editar, ver a página pública e acompanhar as partidas. */
export function atalhosDeOrganizacao(e: EntradaAtalhos): AtalhoOrganizar[] {
  const atalhos: AtalhoOrganizar[] = [{ rotulo: "Editar campeonato", href: e.hrefEditar }];
  if (e.listado) {
    const publica = comBase(`/campeonatos/${encodeURIComponent(e.id)}`);
    atalhos.push({ rotulo: "Ver página pública", href: publica });
    if (e.temCategorias) atalhos.push({ rotulo: "Acompanhar partidas", href: `${publica}/acompanhar` });
  }
  return atalhos;
}
