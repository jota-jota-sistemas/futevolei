// Gera scripts/mapa-ids-eventos.json: o casamento (já revisado por uma pessoa)
// entre os ids de campeonatos.json e de torneios.json. O seed usa este arquivo.
//
// Uso: npm run gerar:mapa-ids-eventos
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import antigos from "../src/data/campeonatos.json";
import torneios from "../src/data/torneios.json";
import type { Campeonato, Torneio } from "../src/types";
import { casarEventos } from "../src/utils/casar-eventos";

const SAIDA = resolve(dirname(fileURLToPath(import.meta.url)), "mapa-ids-eventos.json");

const r = casarEventos(antigos as Campeonato[], torneios as Torneio[]);
const mapa = {
  _aviso: "Gerado por scripts/gerar-mapa-ids-eventos.ts. Pares: idAntigo (campeonatos.json) <= idColetor (torneios.json).",
  pares: r.pares.map((p) => ({ idAntigo: p.idAntigo, idColetor: p.idColetor, nome: p.nomeColetor })),
  soCampeonatos: r.soCampeonatos.map((c) => c.id).sort(),
};
writeFileSync(SAIDA, JSON.stringify(mapa, null, 2) + "\n", "utf8");
console.log(`Mapa gravado: ${mapa.pares.length} pares, ${mapa.soCampeonatos.length} só no campeonatos.json.`);
