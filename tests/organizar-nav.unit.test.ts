// Navegação das páginas de organização: abas de categorias e atalhos do campeonato.
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { abasDeCategorias, atalhosDeOrganizacao } from "../src/utils/organizar-nav";
import { slugCategoria } from "../src/utils/url";

describe("abasDeCategorias", () => {
  const categorias = ["Amador B+C", "Feminino", "Open"];

  it("uma aba por categoria, na ordem recebida, com o link da página da categoria", () => {
    const abas = abasDeCategorias("copa-2026", categorias);
    expect(abas.map((a) => a.nome)).toEqual(categorias);
    expect(abas[1].href).toBe(`/campeonatos/copa-2026/organizar/${slugCategoria("Feminino")}`);
    expect(abas.every((a) => !a.atual)).toBe(true); // sem categoria aberta (índice)
  });

  it("marca só a categoria aberta (pelo slug, o mesmo critério da rota)", () => {
    const abas = abasDeCategorias("copa-2026", categorias, "Feminino");
    expect(abas.map((a) => a.atual)).toEqual([false, true, false]);
  });

  it("propriedade: no máximo uma aba atual e os links nunca saem do campeonato", () => {
    fc.assert(
      fc.property(fc.array(fc.string({ minLength: 1, maxLength: 12 }), { maxLength: 8 }), fc.string({ maxLength: 12 }), (nomes, atual) => {
        const abas = abasDeCategorias("copa-2026", nomes, atual);
        expect(abas).toHaveLength(nomes.length);
        // Nomes com o mesmo slug compartilham a marcação (a rota abre o primeiro).
        const slugs = new Set(abas.filter((a) => a.atual).map((a) => slugCategoria(a.nome)));
        expect(slugs.size).toBeLessThanOrEqual(1);
        for (const a of abas) expect(a.href.startsWith("/campeonatos/copa-2026/organizar/")).toBe(true);
      })
    );
  });
});

describe("atalhosDeOrganizacao", () => {
  const base = { id: "copa-2026", hrefEditar: "/editar?id=copa-2026" };

  it("evento listado com categorias: editar, página pública e acompanhar", () => {
    expect(atalhosDeOrganizacao({ ...base, listado: true, temCategorias: true })).toEqual([
      { rotulo: "Editar campeonato", href: "/editar?id=copa-2026" },
      { rotulo: "Ver página pública", href: "/campeonatos/copa-2026" },
      { rotulo: "Acompanhar partidas", href: "/campeonatos/copa-2026/acompanhar" },
    ]);
  });

  it("listado sem categorias: sem 'Acompanhar partidas' (a página de acompanhar exige categorias)", () => {
    const rotulos = atalhosDeOrganizacao({ ...base, listado: true, temCategorias: false }).map((a) => a.rotulo);
    expect(rotulos).toEqual(["Editar campeonato", "Ver página pública"]);
  });

  it("não listado: só editar (não existe página pública nem acompanhar)", () => {
    expect(atalhosDeOrganizacao({ ...base, listado: false, temCategorias: true }).map((a) => a.rotulo)).toEqual([
      "Editar campeonato",
    ]);
  });

  it("o id é escapado nos links públicos", () => {
    const [, publica] = atalhosDeOrganizacao({ ...base, id: "a/b?x", listado: true, temCategorias: false });
    expect(publica.href).toBe("/campeonatos/a%2Fb%3Fx");
  });
});

describe("páginas de organizar usam as abas e os atalhos", () => {
  const ler = (rel: string) => readFileSync(join(__dirname, "..", "src", "pages", rel), "utf8");

  it("a página da categoria tem abas (com a categoria atual) e atalhos", () => {
    const f = ler("campeonatos/[id]/organizar/[categoria].astro");
    expect(f).toMatch(/<OrganizarAbas[\s\S]*atual=\{categoriaNome\}/);
    expect(f).toMatch(/<OrganizarAtalhos/);
  });

  it("o índice tem os atalhos e continua listando as categorias", () => {
    const f = ler("campeonatos/[id]/organizar/index.astro");
    expect(f).toMatch(/<OrganizarAtalhos/);
    expect(f).toMatch(/organizar__lista/);
  });

  it("os componentes só renderizam o que o módulo puro calcula, com alvo de toque de 44px", () => {
    const comp = join(__dirname, "..", "src", "components");
    const abas = readFileSync(join(comp, "OrganizarAbas.astro"), "utf8");
    const atalhos = readFileSync(join(comp, "OrganizarAtalhos.astro"), "utf8");
    expect(abas).toMatch(/abasDeCategorias/);
    expect(abas).toMatch(/aria-current/);
    expect(abas).toMatch(/min-height: 44px/);
    expect(atalhos).toMatch(/atalhosDeOrganizacao/);
    expect(atalhos).toMatch(/min-height: 44px/);
  });
});
