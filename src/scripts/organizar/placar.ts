// src/scripts/organizar/placar.ts
//
// Tela de placar de um jogo (janela modal). Pensada para o celular, com uma mão:
//   - ao abrir, o campo do primeiro lado já está selecionado, com teclado numérico;
//   - Enter no primeiro campo vai para o segundo; Enter no segundo encerra a partida;
//   - +1 e −1 de 44px ou mais; cada toque grava o placar ao vivo (o público vê);
//   - "Partida encerrada" fica desabilitada em empate, com a dica na tela;
//   - fechar sem encerrar avisa que o placar parcial ficou salvo.
// Jogo já encerrado abre em modo correção: nada é gravado até "Salvar correção".
//
// Dependências injetadas: a página fornece a gravação real; os testes, falsas.
// DOM seguro: só textContent. Estilos `.placar-tela*` na página.

import type { Bracket } from "../../domain/bracket/types";
import { rotuloDupla } from "../../domain/pairs/nome";
import { duplasDoJogo } from "../../domain/bracket/fila";
import type { OpcoesToast } from "./toast";

export interface DepsPlacar {
  bracket(): Bracket | null;
  /** Grava o placar parcial. Devolve a mensagem de erro, ou null se deu certo. */
  salvarAoVivo(matchId: string, placarA: number, placarB: number): Promise<string | null>;
  /** Encerra o jogo com este placar. Devolve a mensagem de erro, ou null. */
  registrar(matchId: string, placarA: number, placarB: number): Promise<string | null>;
  avisar(opcoes: OpcoesToast): void;
  /** Elemento onde o diálogo vive (padrão: o body). Em tela cheia, o elemento em tela cheia. */
  dentroDe?: HTMLElement;
  /** Depois que a janela fechou (por qualquer motivo). */
  aoFechar?(): void;
}

/** A tela de placar está aberta? Verifica no DOM (a tela cheia pode levá-la embora sem evento). */
export const telaPlacarAberta = (): boolean => document.querySelector(".placar-tela") !== null;

export const DICA_EMPATE = "Empate: uma das duplas precisa ter mais pontos para encerrar.";

export function abrirTelaPlacar(deps: DepsPlacar, matchId: string): void {
  const bracket = deps.bracket();
  const jogo = bracket?.matches.find((m) => m.id === matchId);
  if (!bracket || !jogo || telaPlacarAberta()) return;
  const duplas = duplasDoJogo(bracket, jogo);
  if (!duplas) return;
  const [duplaA, duplaB] = duplas;

  const correcao = jogo.vencedorId !== null;
  const estado = { a: jogo.placarA ?? 0, b: jogo.placarB ?? 0 };
  let ultimoEnviado = jogo.placarA !== null ? `${jogo.placarA}x${jogo.placarB}` : "";
  let cadeia: Promise<unknown> = Promise.resolve();
  let encerrado = false;
  let encerrando = false;

  const dialog = document.createElement("dialog");
  dialog.className = "placar-tela";
  dialog.setAttribute("aria-labelledby", "placar-tela-titulo");

  const titulo = document.createElement("h2");
  titulo.id = "placar-tela-titulo";
  titulo.className = "placar-tela__titulo";
  titulo.textContent = jogo.ordemDisputa !== null ? `Jogo ${jogo.ordemDisputa}` : "Placar";

  const subtitulo = document.createElement("p");
  subtitulo.className = "placar-tela__sub";
  subtitulo.textContent = correcao
    ? "Jogo encerrado: ajuste o placar e salve a correção."
    : "Toque em +1 a cada ponto (o público acompanha em tempo real) ou digite o placar final.";

  const lados = document.createElement("div");
  lados.className = "placar-tela__lados";

  const msg = document.createElement("p");
  msg.className = "placar-tela__msg";
  msg.setAttribute("role", "status");

  const dica = document.createElement("p");
  dica.className = "placar-tela__dica";
  dica.setAttribute("aria-live", "polite");

  const pontos: Record<"a" | "b", HTMLInputElement> = {
    a: document.createElement("input"),
    b: document.createElement("input"),
  };
  const lerCampo = (lado: "a" | "b"): number => {
    const n = Math.floor(Number(pontos[lado].value));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const encerrar = document.createElement("button");
  encerrar.type = "button";
  encerrar.className = "org__botao org__botao--primario placar-tela__encerrar";
  encerrar.textContent = correcao ? "Salvar correção" : "Partida encerrada";

  /** Empate não encerra: desabilita o botão e explica o porquê. */
  const atualizarEncerrar = (): void => {
    const empate = estado.a === estado.b;
    encerrar.disabled = empate || encerrando;
    dica.textContent = empate ? DICA_EMPATE : "";
  };

  const enviarAoVivo = (): void => {
    if (correcao) return;
    cadeia = cadeia.then(async () => {
      const chave = `${estado.a}x${estado.b}`;
      if (chave === ultimoEnviado) return;
      ultimoEnviado = chave;
      const erro = await deps.salvarAoVivo(matchId, estado.a, estado.b);
      msg.textContent = erro ?? "";
      if (erro) ultimoEnviado = ""; // força reenvio no próximo toque
    });
  };

  const mudar = (lado: "a" | "b", delta: number): void => {
    estado[lado] = Math.max(0, estado[lado] + delta);
    pontos[lado].value = String(estado[lado]);
    atualizarEncerrar();
    enviarAoVivo();
  };

  const tentarEncerrar = (): void => {
    estado.a = lerCampo("a");
    estado.b = lerCampo("b");
    atualizarEncerrar();
    if (estado.a === estado.b) {
      msg.textContent = DICA_EMPATE;
      return;
    }
    encerrar.click();
  };

  const montarLado = (lado: "a" | "b", nome: string): HTMLElement => {
    const caixa = document.createElement("div");
    caixa.className = "placar-tela__lado";
    const n = document.createElement("p");
    n.className = "placar-tela__nome";
    n.textContent = nome;
    const campo = pontos[lado];
    campo.className = "placar-tela__pontos";
    campo.type = "number";
    campo.min = "0";
    campo.step = "1";
    campo.inputMode = "numeric";
    campo.enterKeyHint = lado === "a" ? "next" : "done";
    campo.setAttribute("aria-label", `Placar de ${nome}`);
    campo.value = String(estado[lado]);
    // Enquanto digita, só guarda o valor (sem gravar "1" a caminho de "15").
    campo.addEventListener("input", () => {
      estado[lado] = lerCampo(lado);
      atualizarEncerrar();
    });
    // Ao terminar de digitar (sai do campo), normaliza e grava ao vivo.
    campo.addEventListener("change", () => {
      estado[lado] = lerCampo(lado);
      campo.value = String(estado[lado]);
      atualizarEncerrar();
      enviarAoVivo();
    });
    campo.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (lado === "a") pontos.b.focus();
      else tentarEncerrar();
    });
    campo.addEventListener("focus", () => campo.select());

    const botao = (classe: string, rotulo: string, aria: string, delta: number): HTMLButtonElement => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = classe;
      b.textContent = rotulo;
      b.setAttribute("aria-label", aria);
      b.addEventListener("click", () => mudar(lado, delta));
      return b;
    };
    caixa.append(
      n,
      campo,
      botao("placar-tela__mais", "+1", `Mais um ponto para ${nome}`, 1),
      botao("placar-tela__menos", "−1", `Tirar um ponto de ${nome}`, -1)
    );
    return caixa;
  };
  lados.append(montarLado("a", rotuloDupla(duplaA)), montarLado("b", rotuloDupla(duplaB)));

  const acoes = document.createElement("div");
  acoes.className = "placar-tela__acoes";
  const fechar = document.createElement("button");
  fechar.type = "button";
  fechar.className = "org__botao";
  fechar.textContent = "Fechar";
  acoes.append(encerrar, fechar);

  dialog.append(titulo, subtitulo, lados, dica, msg, acoes);
  (deps.dentroDe ?? document.body).append(dialog);

  dialog.addEventListener("close", () => {
    dialog.remove();
    if (!correcao && !encerrado && (estado.a > 0 || estado.b > 0)) {
      // Espera as gravações em andamento antes de dizer que ficou salvo.
      void cadeia.then(() => {
        if (!msg.textContent) deps.avisar({ texto: "Placar parcial salvo (ao vivo)." });
      });
    }
    deps.aoFechar?.();
  });
  fechar.addEventListener("click", () => dialog.close());

  encerrar.addEventListener("click", async () => {
    if (encerrando) return;
    encerrando = true;
    msg.textContent = "";
    estado.a = lerCampo("a");
    estado.b = lerCampo("b");
    atualizarEncerrar();
    await cadeia; // espera os toques em andamento gravarem
    const erro = await deps.registrar(matchId, estado.a, estado.b);
    encerrando = false;
    if (erro) {
      msg.textContent = erro;
      atualizarEncerrar();
      return;
    }
    encerrado = true;
    dialog.close();
  });

  atualizarEncerrar();
  dialog.showModal();
  // Primeiro campo pronto para digitar (teclado numérico no celular).
  pontos.a.focus();
}
