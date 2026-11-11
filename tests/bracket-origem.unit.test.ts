// @vitest-environment jsdom
// Origem das vagas indefinidas ("Vencedor do jogo 4", "Perdedor do jogo 13").
import { describe, it, expect } from "vitest";
import type { Pair } from "../src/domain/bracket/types";
import { gerarChaveamento } from "../src/domain/bracket/generator";
import { numerarJogos } from "../src/domain/bracket/ordenacao";
import { chaveSlot, origemDosSlots, rotuloOrigem } from "../src/domain/bracket/origem";
import { renderBracketClient } from "../src/components/bracket/renderBracketClient";

function duplas(n: number): Pair[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `d${i + 1}`,
    nomeDupla: `Dupla ${i + 1}`,
    atletaA: `A${i + 1}`,
    atletaB: `B${i + 1}`,
    seed: i + 1,
    criadoEm: `2025-01-01T00:00:${String(i + 1).padStart(2, "0")}.000Z`,
  }));
}

describe("origem das vagas indefinidas", () => {
  const r = gerarChaveamento({ duplas: duplas(8), config: { formato: "dupla eliminação" } });
  if (!r.ok) throw new Error(r.erro.code);
  const bracket = numerarJogos(r.bracket);

  it("todo slot indefinido de jogo não-inicial tem uma origem", () => {
    const origens = origemDosSlots(bracket.matches);
    for (const m of bracket.matches) {
      for (const lado of ["a", "b"] as const) {
        const p = m[lado];
        if (p.pairId === null && !p.bye) {
          expect(origens.has(chaveSlot(m.id, lado))).toBe(true);
        }
      }
    }
  });

  it("rótulos: vencedor/perdedor, com número do jogo quando numerado", () => {
    const origens = origemDosSlots(bracket.matches);
    const rotulos = [...origens.values()].map(rotuloOrigem);
    expect(rotulos.some((t) => /^Vencedor do jogo \d+$/.test(t))).toBe(true);
    expect(rotulos.some((t) => /^Perdedor do jogo \d+$/.test(t))).toBe(true);
    expect(rotulos.some((t) => /^Vencedor da chave de vencedores, rodada \d+, jogo \d+$/.test(t))).toBe(true);
  });

  it("a visualização mostra a origem no lugar de 'A definir'", () => {
    const view = renderBracketClient(bracket);
    const texto = view.textContent ?? "";
    expect(texto).toMatch(/Vencedor do jogo \d+/);
    expect(texto).toMatch(/Perdedor do jogo \d+/);
  });
});

describe("linhas de ligação do mata-mata", () => {
  const r = gerarChaveamento({ duplas: duplas(8), config: { formato: "eliminação simples" } });
  if (!r.ok) throw new Error(r.erro.code);

  it("cria uma linha por avanço de vencedor e destaca a ramificação ao passar o mouse", () => {
    const view = renderBracketClient(r.bracket);
    const esperadas = r.bracket.matches.filter((m) => m.avancaVencedorPara).length;
    const linhas = view.querySelectorAll(".elim-tree__linha");
    expect(linhas.length).toBe(esperadas);

    // Mouse sobre um jogo da 1ª rodada destaca ele, o caminho até a final e só esses.
    const primeiro = view.querySelector<HTMLElement>(".elim-tree__item")!;
    primeiro.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(primeiro.classList.contains("elim-tree__item--ramo")).toBe(true);
    const emRamo = view.querySelectorAll(".elim-tree__item--ramo").length;
    expect(emRamo).toBe(3); // oitavas/quartas → semi → final em 8 duplas (1+1+1)
    expect(view.querySelectorAll(".elim-tree__linha--ramo").length).toBe(2);
  });
});

describe("card de jogo ao vivo e botão de placar", () => {
  const r = gerarChaveamento({ duplas: duplas(4), config: { formato: "eliminação simples" } });
  if (!r.ok) throw new Error(r.erro.code);
  const jogo = r.bracket.matches.find((m) => m.a.pairId && m.b.pairId)!;

  it("jogo com placar e sem vencedor mostra 'Ao vivo' e o placar parcial", () => {
    const vivo = {
      ...r.bracket,
      matches: r.bracket.matches.map((m) => (m.id === jogo.id ? { ...m, placarA: 4, placarB: 3 } : m)),
    };
    const view = renderBracketClient(vivo);
    expect(view.querySelector(".match-card__estado--aovivo")?.textContent).toBe("Ao vivo");
    expect(view.querySelector(".match-card__estado--pendente")?.textContent).toBe("Pendente"); // o outro jogo
    expect(Array.from(view.querySelectorAll(".match-card__placar")).map((e) => e.textContent)).toEqual(["4", "3"]);
  });

  it("na organização o botão abre a tela de placar do jogo", () => {
    const abertos: string[] = [];
    const view = renderBracketClient(r.bracket, { aoAbrirPlacar: (id) => abertos.push(id) });
    const botoes = view.querySelectorAll<HTMLButtonElement>(".match-card__salvar");
    expect(botoes.length).toBe(2); // só os 2 jogos prontos da 1ª rodada
    expect(botoes[0].textContent).toBe("Marcar placar");
    botoes[0].click();
    expect(abertos).toHaveLength(1);
  });
});
