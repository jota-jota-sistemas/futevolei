// @ts-check
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  // Hospedagem na Vercel: o site é servido na raiz do domínio (/), então NÃO há
  // mais `base`. A URL final é a da Vercel (ou domínio próprio, quando houver).
  // Ao configurar um domínio definitivo, atualize o `site` abaixo.
  site: "https://futevolei.vercel.app",

  // Continua estático nesta etapa (só migração de hospedagem). A troca para
  // output "server" + adaptador acontece na etapa de autenticação (Fase 2a).
  output: "static",
});
