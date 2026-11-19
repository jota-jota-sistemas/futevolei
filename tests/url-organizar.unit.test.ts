// Links da área de organização (usados pelos atalhos e pelas telas de gerenciar).
import { describe, it, expect } from "vitest";
import { hrefOrganizarCampeonato, hrefOrganizarCategoria, slugCategoria } from "../src/utils/url";

describe("hrefOrganizarCampeonato / hrefOrganizarCategoria", () => {
  it("monta o caminho do campeonato e da categoria", () => {
    expect(hrefOrganizarCampeonato("copa-2026")).toBe("/campeonatos/copa-2026/organizar");
    expect(hrefOrganizarCategoria("copa-2026", slugCategoria("Amador B+C"))).toBe(
      `/campeonatos/copa-2026/organizar/${slugCategoria("Amador B+C")}`
    );
  });

  it("o id é escapado: nunca vira outro caminho ou parâmetro", () => {
    expect(hrefOrganizarCampeonato("a/b?x=1#y")).toBe("/campeonatos/a%2Fb%3Fx%3D1%23y/organizar");
  });
});
