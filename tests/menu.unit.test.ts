import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { ITENS_MENU, caminhoNormalizado, itemAtivo } from "../src/utils/menu";

/**
 * Menu do site: só destinos reais e globais, e o item da página atual
 * marcado como ativo (aria-current). Funções puras.
 */

const eventos = ITENS_MENU.find((i) => i.rotulo === "Eventos")!;
const jogadores = ITENS_MENU.find((i) => i.rotulo === "Jogadores")!;

describe("ITENS_MENU", () => {
  it("só tem destinos reais: nada de itens 'em breve', todos com rótulo e caminho", () => {
    expect(ITENS_MENU.map((i) => i.rotulo)).toEqual(["Eventos", "Jogadores"]);
    for (const item of ITENS_MENU) {
      expect(item.rotulo.trim()).not.toBe("");
      expect(item.href.startsWith("/")).toBe(true);
      expect(item.ativoEm.length).toBeGreaterThan(0);
    }
  });

  it("'Eventos' leva à lista na home (âncora #eventos)", () => {
    expect(eventos.href).toBe("/#eventos");
  });
});

describe("caminhoNormalizado", () => {
  it("tira a barra final, exceto na raiz", () => {
    expect(caminhoNormalizado("/jogadores/")).toBe("/jogadores");
    expect(caminhoNormalizado("/jogadores/perfil/")).toBe("/jogadores/perfil");
    expect(caminhoNormalizado("/")).toBe("/");
    expect(caminhoNormalizado("")).toBe("/");
  });

  it("remove o base do site", () => {
    expect(caminhoNormalizado("/x/jogadores/", "/x/")).toBe("/jogadores");
    expect(caminhoNormalizado("/x/", "/x/")).toBe("/");
    expect(caminhoNormalizado("/x", "/x/")).toBe("/");
    // não confunde um caminho que apenas começa com as mesmas letras do base
    expect(caminhoNormalizado("/xyz/jogadores", "/x/")).toBe("/xyz/jogadores");
  });

  it("Property: o resultado sempre começa com '/' e só termina com '/' se for a raiz", () => {
    fc.assert(
      fc.property(fc.webPath(), (p) => {
        const r = caminhoNormalizado(p);
        expect(r.startsWith("/")).toBe(true);
        if (r !== "/") expect(r.endsWith("/")).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});

describe("itemAtivo", () => {
  it("Eventos: ativo na home e nas páginas de evento, não em Jogadores", () => {
    expect(itemAtivo(eventos, "/")).toBe(true);
    expect(itemAtivo(eventos, "/campeonatos/abc/")).toBe(true);
    expect(itemAtivo(eventos, "/campeonatos/abc/acompanhar")).toBe(true);
    expect(itemAtivo(eventos, "/jogadores")).toBe(false);
  });

  it("Jogadores: ativo na lista e no perfil", () => {
    expect(itemAtivo(jogadores, "/jogadores/")).toBe(true);
    expect(itemAtivo(jogadores, "/jogadores/perfil")).toBe(true);
    expect(itemAtivo(jogadores, "/")).toBe(false);
    expect(itemAtivo(jogadores, "/campeonatos/abc")).toBe(false);
  });

  it("não ativa por prefixo parcial de palavra", () => {
    expect(itemAtivo(jogadores, "/jogadoresx")).toBe(false);
    expect(itemAtivo(eventos, "/campeonatosx")).toBe(false);
  });

  it("funciona com um base configurado", () => {
    expect(itemAtivo(jogadores, "/x/jogadores/", "/x/")).toBe(true);
    expect(itemAtivo(eventos, "/x/", "/x/")).toBe(true);
    expect(itemAtivo(eventos, "/x/jogadores/", "/x/")).toBe(false);
  });

  it("Property: no máximo um item do menu fica ativo por caminho", () => {
    fc.assert(
      fc.property(fc.webPath(), (p) => {
        const ativos = ITENS_MENU.filter((i) => itemAtivo(i, p));
        expect(ativos.length).toBeLessThanOrEqual(1);
      }),
      { numRuns: 100 }
    );
  });
});
