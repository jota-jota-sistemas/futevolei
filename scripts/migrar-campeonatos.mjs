// =============================================================================
// Migração idempotente de src/data/campeonatos.json -> Supabase
// -----------------------------------------------------------------------------
// Popula as tabelas `campeonatos` e `categorias` a partir do JSON estático,
// mantendo o MESMO `id` de cada campeonato. É idempotente: reexecutar não
// duplica dados (usa UPSERT com onConflict).
//
// USO:
//   node scripts/migrar-campeonatos.mjs
//   (ou: npm run migrar:campeonatos)
//
// VARIÁVEIS DE AMBIENTE NECESSÁRIAS (lidas de process.env em tempo de execução;
// nada é hardcodado). Defina-as no .env e carregue-as no shell antes de rodar,
// por exemplo com: `set -a && source .env && set +a`.
//   PUBLIC_SUPABASE_URL        -> URL do projeto Supabase
//   SUPABASE_SERVICE_ROLE_KEY  -> secret key (service_role); contorna RLS.
//                                 SECRETA — nunca commitar nem imprimir.
//
// Mapeamento:
//   campeonatos: id, nome, data, local, foto, descricao, instagram? (upsert por id)
//   categorias:  uma linha por string em `categorias?` (upsert por campeonato_id+nome);
//                formato/numero_grupos/classificados_por_grupo ficam null,
//                pois são definidos depois, na organização por categoria.
//
// Este script NÃO é executado pelo build. Rode-o manualmente.
// =============================================================================

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const JSON_PATH = resolve(__dirname, "../src/data/campeonatos.json");

/**
 * Lê as variáveis de ambiente de forma defensiva. Falha com mensagem clara
 * (e código de saída != 0) se alguma estiver ausente. Nunca imprime valores.
 */
function lerConfigAmbiente() {
  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const faltando = [];
  if (!supabaseUrl) faltando.push("PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) faltando.push("SUPABASE_SERVICE_ROLE_KEY");

  if (faltando.length > 0) {
    console.error(
      "Erro: variáveis de ambiente ausentes: " + faltando.join(", ") + ".\n" +
        "Defina-as antes de rodar (veja .env.example). Exemplo:\n" +
        "  set -a && source .env && set +a && node scripts/migrar-campeonatos.mjs",
    );
    process.exit(1);
  }

  return { supabaseUrl, serviceRoleKey };
}

async function carregarCampeonatos() {
  const conteudo = await readFile(JSON_PATH, "utf8");
  const dados = JSON.parse(conteudo);
  if (!Array.isArray(dados)) {
    throw new Error(
      "Formato inesperado em " + JSON_PATH + ": esperava um array de campeonatos.",
    );
  }
  return dados;
}

async function main() {
  const { supabaseUrl, serviceRoleKey } = lerConfigAmbiente();

  // Cliente admin (service_role) — contorna RLS. Equivalente ao `supabaseAdmin`
  // de src/lib/supabase.server.ts, instanciado aqui por ser um script Node
  // standalone (sem acesso a import.meta.env do Astro/Vite).
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const campeonatos = await carregarCampeonatos();

  // Linhas de campeonatos — mesmo id do JSON (chave primária -> upsert idempotente).
  const linhasCampeonatos = campeonatos.map((c) => ({
    id: c.id,
    nome: c.nome,
    data: c.data,
    local: c.local,
    foto: c.foto,
    descricao: c.descricao,
    instagram: c.instagram ?? null,
  }));

  // Linhas de categorias — uma por string em `categorias?`. formato e params de
  // grupos ficam null (definidos depois, na organização). Upsert por
  // (campeonato_id, nome), que é unique no schema.
  const linhasCategorias = [];
  for (const c of campeonatos) {
    const nomes = Array.isArray(c.categorias) ? c.categorias : [];
    for (const nome of nomes) {
      linhasCategorias.push({
        campeonato_id: c.id,
        nome,
        formato: null,
        numero_grupos: null,
        classificados_por_grupo: null,
      });
    }
  }

  console.log(
    "Migrando " +
      linhasCampeonatos.length +
      " campeonato(s) e " +
      linhasCategorias.length +
      " categoria(s)...",
  );

  // UPSERT de campeonatos (onConflict: id).
  const { error: erroCampeonatos } = await supabaseAdmin
    .from("campeonatos")
    .upsert(linhasCampeonatos, { onConflict: "id" });

  if (erroCampeonatos) {
    console.error("Falha ao migrar campeonatos: " + erroCampeonatos.message);
    process.exit(1);
  }

  // UPSERT de categorias (onConflict: campeonato_id,nome) — idempotente.
  if (linhasCategorias.length > 0) {
    const { error: erroCategorias } = await supabaseAdmin
      .from("categorias")
      .upsert(linhasCategorias, { onConflict: "campeonato_id,nome" });

    if (erroCategorias) {
      console.error("Falha ao migrar categorias: " + erroCategorias.message);
      process.exit(1);
    }
  }

  console.log(
    "Concluído. " +
      linhasCampeonatos.length +
      " campeonato(s) e " +
      linhasCategorias.length +
      " categoria(s) processados (upsert idempotente).",
  );
}

main().catch((err) => {
  console.error("Erro inesperado na migração: " + (err?.message ?? err));
  process.exit(1);
});
