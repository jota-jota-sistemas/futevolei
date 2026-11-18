// Gera supabase/seed-eventos.sql.
//
// Uso: npm run gerar:seed-eventos
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import antigos from "../src/data/campeonatos.json";
import torneios from "../src/data/torneios.json";
import type { Campeonato, Torneio } from "../src/types";
import { gerarSeedEventos, type MapaIds } from "../src/utils/seed-eventos";

const pasta = dirname(fileURLToPath(import.meta.url));
const mapa = JSON.parse(readFileSync(resolve(pasta, "mapa-ids-eventos.json"), "utf8")) as MapaIds;
const sql = gerarSeedEventos({
  torneios: torneios as Torneio[],
  antigos: antigos as Campeonato[],
  mapa,
});
const saida = resolve(pasta, "../supabase/seed-eventos.sql");
writeFileSync(saida, sql, "utf8");
console.log(`Seed gravado em ${saida}`);
