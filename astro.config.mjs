// @ts-check
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  // GitHub Pages (site de projeto): a URL final é
  //   https://jota-jota-sistemas.github.io/futevolei/
  // - "site": domínio base, usado para gerar URLs absolutas.
  // - "base": subpasta onde o site é servido. Precisa bater com o nome do repo.
  // Em links internos use caminhos relativos ou prefixe com import.meta.env.BASE_URL.
  site: "https://jota-jota-sistemas.github.io",
  base: "/futevolei",

  // Fase 1: site estático. Na Fase 2 trocamos output/adaptador para habilitar
  // rotas de servidor (login, admin, salvar) sem reescrever o front.
  output: "static",
});
