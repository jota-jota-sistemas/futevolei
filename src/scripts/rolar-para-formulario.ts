// src/scripts/rolar-para-formulario.ts
//
// Chegada por link com âncora (ex.: o botão "Criar evento" da home leva à lista
// de campeonatos já na âncora do cartão "Novo campeonato"). A página de gerenciamento só revela o
// conteúdo depois que a guarda de acesso libera, no navegador; o salto automático
// do navegador acontece antes e erra. Por isso, depois de liberado, esta função
// rola até o cartão e põe o cursor no primeiro campo.

export interface OpcoesRolar {
  /** `location.hash` (com ou sem "#"). */
  hash: string;
  /** Id do cartão a mostrar (sem "#"). */
  idCartao: string;
  /** Id do campo que recebe o foco. */
  idCampo: string;
  raiz?: Pick<Document, "getElementById">;
  /** Respeitar "reduzir movimento" (rola sem animação). */
  reduzirMovimento?: boolean;
}

/** Devolve true se rolou. Nunca lança. */
export function rolarParaFormularioSeHash(opcoes: OpcoesRolar): boolean {
  try {
    if (opcoes.hash.replace(/^#/, "") !== opcoes.idCartao) return false;
    const raiz = opcoes.raiz ?? document;
    const cartao = raiz.getElementById(opcoes.idCartao);
    if (!cartao) return false;
    cartao.scrollIntoView?.({
      block: "start",
      behavior: opcoes.reduzirMovimento ? "auto" : "smooth",
    });
    // preventScroll: a rolagem acima já posicionou o cartão.
    raiz.getElementById(opcoes.idCampo)?.focus({ preventScroll: true });
    return true;
  } catch {
    return false;
  }
}

/** "Reduzir movimento" ligado no sistema? */
export function prefereMenosMovimento(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
