// src/scripts/organizar/fila.ts
//
// Seção "Próximos jogos": os jogos prontos para disputar (ao vivo primeiro, depois
// na ordem de disputa), com o botão "Lançar placar" a um toque. Mostra os 5
// primeiros; "Ver todos" abre o resto.
//
// Contrato de DOM (dentro de `secao`):
//   [data-fila] (a seção inteira, oculta sem chaveamento), [data-fila-lista],
//   [data-fila-ver-todos] (botão)
// DOM seguro: só textContent. Alvos de toque de 44px (estilo em OrganizarEstilos).

import type { Bracket } from "../../domain/bracket/types";
import { duplasDoJogo, proximosJogos, rotuloDoJogo, jogoAoVivo } from "../../domain/bracket/fila";
import { rotuloDupla } from "../../domain/pairs/nome";

export const LIMITE_FILA = 5;

export interface DepsFila {
  secao: HTMLElement;
  bracket(): Bracket | null;
  abrirPlacar(matchId: string): void;
}

export interface ControleFila {
  render(): void;
}

export function ligarFila(deps: DepsFila): ControleFila {
  const { secao } = deps;
  const bloco = secao.querySelector<HTMLElement>("[data-fila]");
  const lista = secao.querySelector<HTMLElement>("[data-fila-lista]");
  const verTodos = secao.querySelector<HTMLButtonElement>("[data-fila-ver-todos]");
  let abertaTudo = false;

  verTodos?.addEventListener("click", () => {
    abertaTudo = !abertaTudo;
    render();
  });

  function render(): void {
    if (!bloco || !lista) return;
    const bracket = deps.bracket();
    bloco.hidden = bracket === null;
    lista.replaceChildren();
    if (!bracket) return;

    const fila = proximosJogos(bracket);
    if (fila.length === 0) {
      const vazio = document.createElement("li");
      vazio.className = "org__fila-vazio";
      vazio.textContent = bracket.campeaId
        ? "Todos os jogos foram disputados."
        : "Nenhum jogo pronto agora. Novos jogos aparecem quando os anteriores terminam.";
      lista.append(vazio);
      if (verTodos) verTodos.hidden = true;
      return;
    }

    const visiveis = abertaTudo ? fila : fila.slice(0, LIMITE_FILA);
    for (const jogo of visiveis) {
      const duplas = duplasDoJogo(bracket, jogo);
      if (!duplas) continue;
      const li = document.createElement("li");
      li.className = "org__fila-item";
      li.dataset.matchId = jogo.id;

      const info = document.createElement("div");
      info.className = "org__fila-info";
      const rotulo = document.createElement("span");
      rotulo.className = "org__fila-jogo";
      rotulo.textContent = rotuloDoJogo(jogo);
      const nomes = document.createElement("span");
      nomes.className = "org__fila-duplas";
      nomes.textContent = `${rotuloDupla(duplas[0])} × ${rotuloDupla(duplas[1])}`;
      info.append(rotulo, nomes);
      if (jogoAoVivo(jogo)) {
        const vivo = document.createElement("span");
        vivo.className = "org__fila-vivo";
        vivo.textContent = `Ao vivo: ${jogo.placarA ?? 0} a ${jogo.placarB ?? 0}`;
        info.append(vivo);
      }

      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "org__botao org__fila-botao";
      botao.textContent = jogoAoVivo(jogo) ? "Continuar placar" : "Lançar placar";
      botao.setAttribute(
        "aria-label",
        `${botao.textContent}: ${rotuloDoJogo(jogo)}, ${nomes.textContent}`
      );
      botao.addEventListener("click", () => deps.abrirPlacar(jogo.id));

      li.append(info, botao);
      lista.append(li);
    }

    if (verTodos) {
      const restantes = fila.length - LIMITE_FILA;
      verTodos.hidden = restantes <= 0;
      verTodos.textContent = abertaTudo ? "Ver menos" : `Ver todos (mais ${restantes})`;
    }
  }

  return { render };
}
