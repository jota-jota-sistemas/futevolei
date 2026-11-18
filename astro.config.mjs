// @ts-check
import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";

// https://astro.build/config
export default defineConfig({
  // Hospedagem na Vercel: o site é servido na raiz do domínio (/), então NÃO há
  // mais `base`. A URL final é a da Vercel (ou domínio próprio, quando houver).
  // Ao configurar um domínio definitivo, atualize o `site` abaixo.
  site: "https://futevolei.vercel.app",

  // O site é estático por padrão (páginas sem dados do banco são geradas no
  // build). As páginas que dependem dos EVENTOS no banco (home, detalhe,
  // organizar, acompanhar e perfil de jogador) são sob demanda
  // (`export const prerender = false`): a Vercel as gera a cada acesso, lendo o
  // banco na hora, com cache curto no CDN. Assim mudar um evento no banco
  // aparece em ~1 minuto, sem novo deploy, e o build não depende do Supabase.
  output: "static",
  adapter: vercel(),
});
