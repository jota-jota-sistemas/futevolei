// src/components/bracket/telaJogo.ts
//
// Tela cheia de UM jogo, para acompanhar em detalhe (TV, projetor ou celular):
// duplas, placar grande, situação (aguardando / ao vivo / encerrado) e contexto
// (grupo ou fase, rodada, número do jogo, para onde segue o vencedor).
//
// Helper de DOM PURO em relação a I/O: não conhece store nem Supabase. Quem o
// usa (página pública) chama `atualizar(bracket)` sempre que chegam dados novos
// pelo tempo real; a tela se redesenha sem fechar.

import type { Bracket, Match } from "../../domain/bracket/types";
import { rotuloDupla } from "../../domain/pairs/nome";

export interface TelaJogo {
  /** Redesenha com o chaveamento mais recente (fecha se o jogo não existir mais). */
  atualizar(bracket: Bracket): void;
  fechar(): void;
}

export interface OpcoesTelaJogo {
  bracket: Bracket;
  matchId: string;
  /** Nome da categoria (exibido no topo). */
  categoria: string;
  aoFechar?: () => void;
}

type Situacao = "aguardando" | "aovivo" | "encerrado";

function situacaoDe(m: Match): Situacao {
  if (m.vencedorId !== null) return "encerrado";
  if (m.placarA !== null) return "aovivo";
  return "aguardando";
}

const ROTULO_SITUACAO: Record<Situacao, string> = {
  aguardando: "Aguardando início",
  aovivo: "Ao vivo",
  encerrado: "Encerrado",
};

/** "Grupo 2", "Chave de vencedores · Rodada 3", "Grande final"... */
function contextoDe(bracket: Bracket, m: Match): string {
  if (m.side === "grupo") {
    const grupo = bracket.grupos.find((g) => g.id === m.grupoId);
    return grupo ? `Fase de grupos · Grupo ${grupo.indice + 1}` : "Fase de grupos";
  }
  if (m.side === "grande-final") return "Grande final";
  const unica = bracket.formato !== "dupla eliminação";
  const fase = unica
    ? "Mata-mata"
    : m.side === "upper"
      ? "Chave de vencedores"
      : "Chave de perdedores";
  return `${fase} · Rodada ${m.rodada}`;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classe: string,
  texto?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

export function abrirTelaJogo(opcoes: OpcoesTelaJogo): TelaJogo {
  const raiz = el("div", "tela-jogo");
  raiz.setAttribute("role", "dialog");
  raiz.setAttribute("aria-modal", "true");
  raiz.setAttribute("aria-label", "Acompanhar jogo");

  const topo = el("div", "tela-jogo__topo");
  const titulos = el("div", "tela-jogo__titulos");
  const categoria = el("p", "tela-jogo__categoria", opcoes.categoria);
  const contexto = el("p", "tela-jogo__contexto");
  const numero = el("p", "tela-jogo__numero");
  titulos.append(categoria, contexto, numero);
  const fechar = el("button", "tela-jogo__fechar", "Fechar");
  fechar.type = "button";
  fechar.setAttribute("aria-label", "Fechar a tela do jogo");
  topo.append(titulos, fechar);

  const situacao = el("p", "tela-jogo__situacao");
  situacao.setAttribute("role", "status");

  const placar = el("div", "tela-jogo__placar");
  placar.setAttribute("aria-live", "polite");
  const lados = (["a", "b"] as const).map((lado) => {
    const caixa = el("div", `tela-jogo__lado tela-jogo__lado--${lado}`);
    const nome = el("p", "tela-jogo__nome");
    const pontos = el("p", "tela-jogo__pontos");
    const selo = el("p", "tela-jogo__selo");
    caixa.append(nome, pontos, selo);
    return { caixa, nome, pontos, selo };
  });
  const x = el("p", "tela-jogo__x", "×");
  x.setAttribute("aria-hidden", "true");
  placar.append(lados[0].caixa, x, lados[1].caixa);

  const rodape = el("p", "tela-jogo__rodape");

  raiz.append(topo, situacao, placar, rodape);
  document.body.append(raiz);
  document.body.classList.add("tela-jogo-aberta");

  let fechada = false;
  let emTelaCheia = false;

  const desenhar = (bracket: Bracket): void => {
    const jogo = bracket.matches.find((m) => m.id === opcoes.matchId);
    if (!jogo) {
      fecharTela();
      return;
    }
    const nomeDe = (pairId: string | null): string => {
      const d = pairId ? bracket.duplas.find((x) => x.id === pairId) : undefined;
      return d ? rotuloDupla(d) : "A definir";
    };
    const estado = situacaoDe(jogo);

    contexto.textContent = contextoDe(bracket, jogo);
    numero.textContent = jogo.ordemDisputa !== null ? `Jogo ${jogo.ordemDisputa}` : "";
    raiz.dataset.situacao = estado;
    situacao.textContent = ROTULO_SITUACAO[estado];

    const dados = [
      { pairId: jogo.a.pairId, pontos: jogo.placarA },
      { pairId: jogo.b.pairId, pontos: jogo.placarB },
    ];
    dados.forEach((d, i) => {
      lados[i].nome.textContent = nomeDe(d.pairId);
      lados[i].pontos.textContent = d.pontos !== null ? String(d.pontos) : "–";
      const venceu = jogo.vencedorId !== null && jogo.vencedorId === d.pairId;
      lados[i].caixa.classList.toggle("tela-jogo__lado--vencedora", venceu);
      lados[i].selo.textContent = venceu ? "Vencedora" : "";
    });

    // Para onde o vencedor segue (quando já há número de jogo no destino).
    const destino = jogo.avancaVencedorPara
      ? bracket.matches.find((m) => m.id === jogo.avancaVencedorPara?.matchId)
      : undefined;
    rodape.textContent =
      destino && destino.ordemDisputa !== null
        ? `O vencedor segue para o Jogo ${destino.ordemDisputa}`
        : destino
          ? "O vencedor avança no chaveamento"
          : jogo.side === "grupo"
            ? "Jogo da fase de grupos"
            : "";
  };

  const aoMudarTelaCheia = (): void => {
    // Esc (ou o botão do navegador) sai da tela cheia: volta para o chaveamento.
    if (emTelaCheia && document.fullscreenElement !== raiz) fecharTela();
  };
  const aoTeclar = (e: KeyboardEvent): void => {
    if (e.key === "Escape") fecharTela();
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

  // Tela cheia de verdade quando o navegador permite (precisa do gesto do
  // toque que abriu a tela). Sem suporte (ex.: iPhone), a tela ocupa a janela.
  if (typeof raiz.requestFullscreen === "function") {
    raiz
      .requestFullscreen()
      .then(() => {
        emTelaCheia = true;
      })
      .catch(() => {});
  }

  return {
    atualizar(bracket) {
      if (!fechada) desenhar(bracket);
    },
    fechar: fecharTela,
  };
}
