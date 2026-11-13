// src/components/bracket/telaChaveamento.ts
//
// Tela cheia do CHAVEAMENTO COMPLETO de uma categoria (grupos, tabela e
// mata-mata), para acompanhar em TV/projetor/celular. Rola nos dois sentidos
// quando o chaveamento é maior que a tela (o zoom do navegador também serve) e
// se redesenha a cada `atualizar(bracket)` sem perder a posição da rolagem.
//
// Helper de DOM PURO em relação a I/O: não conhece store nem Supabase.

import type { Bracket } from "../../domain/bracket/types";
import { renderBracketClient } from "./renderBracketClient";

export interface TelaChaveamento {
  /** Elemento raiz (em tela cheia): outras telas devem abrir DENTRO dele. */
  readonly raiz: HTMLElement;
  atualizar(bracket: Bracket): void;
  fechar(): void;
}

export interface OpcoesTelaChaveamento {
  bracket: Bracket;
  categoria: string;
  /**
   * Chamado ao tocar em "Ver jogo" num card. Quem trata deve abrir a tela do
   * jogo DENTRO de `dentroDe` (a tela cheia só mostra o que está dentro dela) e
   * chamar `aoFecharJogo` quando essa tela fechar (para o Esc voltar a valer
   * para o chaveamento).
   */
  aoAbrirJogo?: (
    matchId: string,
    contexto: { dentroDe: HTMLElement; aoFecharJogo: () => void },
  ) => void;
  aoFechar?: () => void;
}

export function abrirTelaChaveamento(opcoes: OpcoesTelaChaveamento): TelaChaveamento {
  const raiz = document.createElement("div");
  raiz.className = "tela-chaveamento";
  raiz.setAttribute("role", "dialog");
  raiz.setAttribute("aria-modal", "true");
  raiz.setAttribute("aria-label", `Chaveamento completo: ${opcoes.categoria}`);

  const topo = document.createElement("div");
  topo.className = "tela-chaveamento__topo";
  const titulo = document.createElement("h2");
  titulo.className = "tela-chaveamento__titulo";
  titulo.textContent = opcoes.categoria;
  const fechar = document.createElement("button");
  fechar.type = "button";
  fechar.className = "tela-chaveamento__fechar";
  fechar.textContent = "Fechar";
  fechar.setAttribute("aria-label", "Fechar o chaveamento em tela cheia");
  topo.append(titulo, fechar);

  const corpo = document.createElement("div");
  corpo.className = "tela-chaveamento__corpo";

  raiz.append(topo, corpo);
  document.body.append(raiz);
  document.body.classList.add("tela-jogo-aberta"); // trava a rolagem da página

  let fechada = false;
  let emTelaCheia = false;
  let jogoAberto = false; // a tela de um jogo está por cima

  const desenhar = (bracket: Bracket): void => {
    const { scrollLeft, scrollTop } = corpo;
    corpo.replaceChildren(
      renderBracketClient(bracket, {
        aoAbrirJogo: opcoes.aoAbrirJogo
          ? (matchId) => {
              jogoAberto = true;
              opcoes.aoAbrirJogo?.(matchId, {
                dentroDe: raiz,
                aoFecharJogo: () => {
                  jogoAberto = false;
                },
              });
            }
          : undefined,
      }),
    );
    corpo.scrollLeft = scrollLeft;
    corpo.scrollTop = scrollTop;
  };

  const aoMudarTelaCheia = (): void => {
    // Esc/botão do navegador sai da tela cheia: volta para a página.
    if (emTelaCheia && document.fullscreenElement !== raiz) fecharTela();
  };
  const aoTeclar = (e: KeyboardEvent): void => {
    // Com a tela de um jogo por cima, o Esc é dela.
    if (e.key === "Escape" && !jogoAberto) fecharTela();
  };

  function fecharTela(): void {
    if (fechada) return;
    fechada = true;
    document.removeEventListener("fullscreenchange", aoMudarTelaCheia);
    document.removeEventListener("keydown", aoTeclar);
    if (document.fullscreenElement === raiz) {
      void document.exitFullscreen?.().catch(() => {});
    }
    raiz.remove();
    document.body.classList.remove("tela-jogo-aberta");
    opcoes.aoFechar?.();
  }

  fechar.addEventListener("click", fecharTela);
  document.addEventListener("keydown", aoTeclar);
  document.addEventListener("fullscreenchange", aoMudarTelaCheia);

  desenhar(opcoes.bracket);
  fechar.focus();

  if (typeof raiz.requestFullscreen === "function") {
    raiz
      .requestFullscreen()
      .then(() => {
        emTelaCheia = true;
      })
      .catch(() => {});
  }

  return {
    raiz,
    atualizar(bracket) {
      if (!fechada) desenhar(bracket);
    },
    fechar: fecharTela,
  };
}
