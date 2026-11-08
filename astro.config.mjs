// @ts-check
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  // Fase 1: site estático. Na Fase 2 trocamos output/adaptador para habilitar
  // rotas de servidor (login, admin, salvar) sem reescrever o front.
  output: "static",
});
