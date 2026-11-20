// scripts/preencher-colocacoes.ts
//
// Preenche `duplas.colocacao` dos campeonatos JÁ encerrados (chaveamento com
// campeã), calculada pelo ranking final do domínio. Depois disso a tela de
// organizar mantém a coluna sozinha (ao decidir/desfazer a final).
//
// Pré-requisito: supabase/migracao-colocacao-duplas.sql aplicada.
// Uso:
//   npx vite-node scripts/preencher-colocacoes.ts            # simula (não grava)
//   npx vite-node scripts/preencher-colocacoes.ts --aplicar  # grava
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { linhasParaBracket } from "../src/store/mappers";
import { colocacoesDaCategoria } from "../src/domain/jogadores/colocacao";

const APLICAR = process.argv.includes("--aplicar");

function lerEnv(): Record<string, string> {
  const txt = fs.readFileSync(path.resolve(".env"), "utf8");
  return Object.fromEntries(
    txt
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
}

async function main(): Promise<void> {
  const env = lerEnv();
  const c = createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: chavs, error } = await c.from("chaveamentos").select("*").not("campea_id", "is", null);
  if (error) throw new Error(error.message);
  console.log(`${chavs.length} categoria(s) encerrada(s).`);
  let total = 0;
  for (const chav of chavs) {
    const [{ data: duplas }, { data: grupos }, { data: jogos }, { data: cat }] = await Promise.all([
      c.from("duplas").select("*").eq("categoria_id", chav.categoria_id),
      c.from("grupos").select("*").eq("chaveamento_id", chav.id),
      c.from("jogos").select("*").eq("chaveamento_id", chav.id),
      c.from("categorias").select("nome, campeonato_id").eq("id", chav.categoria_id).single(),
    ]);
    const idsGrupos = (grupos ?? []).map((g: { id: string }) => g.id);
    const { data: grupoDuplas } = idsGrupos.length
      ? await c.from("grupo_duplas").select("*").in("grupo_id", idsGrupos)
      : { data: [] };
    const bracket = linhasParaBracket({
      chaveamento: chav,
      duplas: duplas ?? [],
      grupos: grupos ?? [],
      grupoDuplas: grupoDuplas ?? [],
      jogos: jogos ?? [],
    });
    const col = colocacoesDaCategoria(bracket);
    const nome = new Map((duplas ?? []).map((d: { id: string; atleta_a: string; atleta_b: string }) => [d.id, `${d.atleta_a} & ${d.atleta_b}`]));
    const ordenadas = Object.entries(col).sort((a, b) => (a[1] ?? 999) - (b[1] ?? 999));
    console.log(`\n${cat?.campeonato_id} / ${cat?.nome}:`);
    for (const [id, v] of ordenadas) console.log(`  ${String(v ?? "-").padStart(2)}º  ${nome.get(id)}`);
    if (Object.values(col).every((v) => v === null)) {
      console.log("  (final não decidida pelo ranking; nada a gravar)");
      continue;
    }
    if (APLICAR) {
      for (const [id, v] of Object.entries(col)) {
        const up = await c.from("duplas").update({ colocacao: v }).eq("id", id);
        if (up.error) throw new Error(`${id}: ${up.error.message}`);
      }
    }
    total += Object.keys(col).length;
  }
  console.log(APLICAR ? `\nGravado: ${total} duplas.` : `\nSimulação: ${total} duplas seriam gravadas. Rode com --aplicar.`);
}

main().catch((e) => {
  console.error(`ERRO: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
