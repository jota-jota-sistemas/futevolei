// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import type { Bracket, Pair } from "../src/domain/bracket/types";
import { gerarChaveamento } from "../src/domain/bracket/generator";
import { numerarJogos } from "../src/domain/bracket/ordenacao";
import { atualizarPlacarAoVivo, registrarPlacar } from "../src/domain/bracket/progression";
import { abrirTelaJogo } from "../src/components/bracket/telaJogo";
import { renderBracketClient } from "../src/components/bracket/renderBracketClient";

const duplas: Pair[] = Array.from({ length: 4 }, (_, i) => ({
  id: `d${i + 1}`,
  nomeDupla: `D${i + 1}`,
  atletaA: `A${i + 1}`,
  atletaB: `B${i + 1}`,
  seed: i + 1,
  criadoEm: `2025-01-01T00:00:0${i}.000Z`,
}));

function inicial(): Bracket {
  const r = gerarChaveamento({ duplas, config: { formato: "eliminação simples" } });
  if (!r.ok) throw new Error(r.erro.code);
  return numerarJogos(r.bracket);
}

const texto = (sel: string): string | null | undefined =>
  document.querySelector(sel)?.textContent;

afterEach(() => {
  document.body.innerHTML = "";
  document.body.className = "";
});

describe("tela cheia do jogo", () => {
  it("mostra duplas, contexto, número e 'Aguardando início' antes de começar", () => {
    const b = inicial();
    const jogo = b.matches.find((m) => m.a.pairId && m.b.pairId)!;
    abrirTelaJogo({ bracket: b, matchId: jogo.id, categoria: "Masculino Estreante" });

    expect(texto(".tela-jogo__categoria")).toBe("Masculino Estreante");
    expect(texto(".tela-jogo__contexto")).toBe("Mata-mata · Rodada 1");
    expect(texto(".tela-jogo__numero")).toBe(`Jogo ${jogo.ordemDisputa}`);
    expect(texto(".tela-jogo__situacao")).toBe("Aguardando início");
    expect(texto(".tela-jogo__lado--a .tela-jogo__nome")).toMatch(/ & /);
    expect(texto(".tela-jogo__lado--a .tela-jogo__pontos")).toBe("–");
    expect(document.body.classList.contains("tela-jogo-aberta")).toBe(true);
  });

  it("atualiza ao vivo e depois mostra o encerramento com a dupla vencedora", () => {
    const b = inicial();
    const jogo = b.matches.find((m) => m.a.pairId && m.b.pairId)!;
    const tela = abrirTelaJogo({ bracket: b, matchId: jogo.id, categoria: "X" });

    const vivo = atualizarPlacarAoVivo(b, jogo.id, 5, 3);
    if (!vivo.ok) throw new Error("falhou");
    tela.atualizar(vivo.bracket);
    expect(texto(".tela-jogo__situacao")).toBe("Ao vivo");
    expect(texto(".tela-jogo__lado--a .tela-jogo__pontos")).toBe("5");
    expect(texto(".tela-jogo__lado--b .tela-jogo__pontos")).toBe("3");

    const fim = registrarPlacar(vivo.bracket, jogo.id, 15, 9, "2026-01-01T00:00:00.000Z");
    if (!fim.ok) throw new Error("falhou");
    tela.atualizar(numerarJogos(fim.bracket));
    expect(texto(".tela-jogo__situacao")).toBe("Encerrado");
    expect(document.querySelector(".tela-jogo__lado--a")?.classList.contains("tela-jogo__lado--vencedora")).toBe(true);
    expect(texto(".tela-jogo__lado--a .tela-jogo__selo")).toBe("Vencedora");
    // O destino só tem número quando suas duas duplas já estão definidas.
    expect(texto(".tela-jogo__rodape")).toBe("O vencedor avança no chaveamento");
  });

  it("fecha pelo botão e pelo Esc, avisando quem abriu", () => {
    const b = inicial();
    const jogo = b.matches.find((m) => m.a.pairId && m.b.pairId)!;
    let fechou = 0;

    abrirTelaJogo({ bracket: b, matchId: jogo.id, categoria: "X", aoFechar: () => fechou++ });
    (document.querySelector(".tela-jogo__fechar") as HTMLButtonElement).click();
    expect(document.querySelector(".tela-jogo")).toBeNull();
    expect(document.body.classList.contains("tela-jogo-aberta")).toBe(false);

    abrirTelaJogo({ bracket: b, matchId: jogo.id, categoria: "X", aoFechar: () => fechou++ });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".tela-jogo")).toBeNull();
    expect(fechou).toBe(2);
  });

  it("na visualização pública, o card pronto tem o botão que abre o jogo", () => {
    const b = inicial();
    const abertos: string[] = [];
    const view = renderBracketClient(b, { aoAbrirJogo: (id) => abertos.push(id) });
    const botoes = view.querySelectorAll<HTMLButtonElement>(".match-card__acompanhar");
    expect(botoes.length).toBe(2); // só os jogos prontos
    botoes[0].click();
    expect(abertos).toHaveLength(1);
    // Sem a opção (organização), o botão não existe.
    expect(renderBracketClient(b).querySelector(".match-card__acompanhar")).toBeNull();
  });
});
