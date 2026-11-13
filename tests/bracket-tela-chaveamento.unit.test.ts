// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import type { Bracket, Pair } from "../src/domain/bracket/types";
import { gerarChaveamento } from "../src/domain/bracket/generator";
import { numerarJogos } from "../src/domain/bracket/ordenacao";
import { atualizarPlacarAoVivo } from "../src/domain/bracket/progression";
import { abrirTelaChaveamento } from "../src/components/bracket/telaChaveamento";
import { abrirTelaJogo } from "../src/components/bracket/telaJogo";

const duplas: Pair[] = Array.from({ length: 6 }, (_, i) => ({
  id: `d${i + 1}`,
  nomeDupla: `D${i + 1}`,
  atletaA: `A${i + 1}`,
  atletaB: `B${i + 1}`,
  seed: i + 1,
  criadoEm: `2025-01-01T00:00:0${i}.000Z`,
}));

function inicial(): Bracket {
  const r = gerarChaveamento({ duplas, config: { formato: "dupla eliminação" } });
  if (!r.ok) throw new Error(r.erro.code);
  return numerarJogos(r.bracket);
}

afterEach(() => {
  document.body.innerHTML = "";
  document.body.className = "";
});

describe("tela cheia do chaveamento completo", () => {
  it("mostra a categoria e o chaveamento inteiro", () => {
    abrirTelaChaveamento({ bracket: inicial(), categoria: "Masculino Estreante" });
    expect(document.querySelector(".tela-chaveamento__titulo")?.textContent).toBe("Masculino Estreante");
    expect(document.querySelectorAll(".tela-chaveamento__corpo .match-card").length).toBeGreaterThan(5);
    expect(document.body.classList.contains("tela-jogo-aberta")).toBe(true);
  });

  it("atualiza ao vivo sem fechar", () => {
    const b = inicial();
    const jogo = b.matches.find((m) => m.a.pairId && m.b.pairId)!;
    const tela = abrirTelaChaveamento({ bracket: b, categoria: "X" });
    expect(document.querySelector(".match-card__estado--aovivo")).toBeNull();

    const vivo = atualizarPlacarAoVivo(b, jogo.id, 4, 2);
    if (!vivo.ok) throw new Error("falhou");
    tela.atualizar(vivo.bracket);
    expect(document.querySelector(".tela-chaveamento__corpo .match-card__estado--aovivo")?.textContent).toBe("Ao vivo");
  });

  it("fecha pelo botão e pelo Esc, avisando quem abriu", () => {
    let fechou = 0;
    abrirTelaChaveamento({ bracket: inicial(), categoria: "X", aoFechar: () => fechou++ });
    (document.querySelector(".tela-chaveamento__fechar") as HTMLButtonElement).click();
    expect(document.querySelector(".tela-chaveamento")).toBeNull();
    expect(document.body.classList.contains("tela-jogo-aberta")).toBe(false);

    abrirTelaChaveamento({ bracket: inicial(), categoria: "X", aoFechar: () => fechou++ });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".tela-chaveamento")).toBeNull();
    expect(fechou).toBe(2);
  });

  it("abre o jogo DENTRO da tela cheia, e o Esc fecha só o jogo", () => {
    const b = inicial();
    let jogoAberto: ReturnType<typeof abrirTelaJogo> | null = null;
    const tela = abrirTelaChaveamento({
      bracket: b,
      categoria: "X",
      aoAbrirJogo: (matchId, ctx) => {
        jogoAberto = abrirTelaJogo({
          bracket: b,
          matchId,
          categoria: "X",
          dentroDe: ctx.dentroDe,
          aoFechar: ctx.aoFecharJogo,
        });
      },
    });

    (document.querySelector(".tela-chaveamento .match-card__acompanhar") as HTMLButtonElement).click();
    expect(jogoAberto).not.toBeNull();
    expect(tela.raiz.querySelector(".tela-jogo")).not.toBeNull(); // dentro da raiz

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(tela.raiz.querySelector(".tela-jogo")).toBeNull(); // jogo fechou
    expect(document.querySelector(".tela-chaveamento")).not.toBeNull(); // chaveamento segue aberto

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".tela-chaveamento")).toBeNull();
  });

  it("na organização, lançar placar funciona em tela cheia: a janela abre DENTRO dela e o Esc é da janela", () => {
    const b = inicial();
    let recebido: HTMLElement | null = null;
    const tela = abrirTelaChaveamento({
      bracket: b,
      categoria: "X",
      aoAbrirPlacar: (matchId, ctx) => {
        recebido = ctx.dentroDe;
        // Como a página faz: cria o diálogo dentro do elemento em tela cheia.
        const dialog = document.createElement("dialog");
        dialog.className = "placar-tela";
        dialog.dataset.jogo = matchId;
        dialog.setAttribute("open", "");
        ctx.dentroDe.append(dialog);
      },
    });

    const botao = document.querySelector<HTMLButtonElement>(".tela-chaveamento .match-card__salvar");
    expect(botao?.textContent).toBe("Marcar placar");
    botao!.click();
    expect(recebido).toBe(tela.raiz);
    expect(tela.raiz.querySelector(".placar-tela")).not.toBeNull();

    // Esc com a janela de placar aberta não fecha o chaveamento.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".tela-chaveamento")).not.toBeNull();

    // Sem a janela, o Esc volta a fechar a tela cheia.
    tela.raiz.querySelector(".placar-tela")!.remove();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".tela-chaveamento")).toBeNull();
  });

  it("sem aoAbrirPlacar (página pública) os cards não têm botão de placar", () => {
    abrirTelaChaveamento({ bracket: inicial(), categoria: "X" });
    expect(document.querySelector(".tela-chaveamento .match-card__salvar")).toBeNull();
  });
});
