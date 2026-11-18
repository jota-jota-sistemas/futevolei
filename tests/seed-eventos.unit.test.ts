import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import antigos from "../src/data/campeonatos.json";
import torneios from "../src/data/torneios.json";
import type { Campeonato, Torneio } from "../src/types";
import { casarEventos } from "../src/utils/casar-eventos";
import {
  gerarSeedEventos,
  linhasDoSeed,
  sqlTexto,
  ufDoLocalAntigo,
  type MapaIds,
} from "../src/utils/seed-eventos";

const RAIZ = join(__dirname, "..");
const mapa = JSON.parse(readFileSync(join(RAIZ, "scripts", "mapa-ids-eventos.json"), "utf8")) as MapaIds;
const entrada = { torneios: torneios as Torneio[], antigos: antigos as Campeonato[], mapa };
const arquivo = readFileSync(join(RAIZ, "supabase", "seed-eventos.sql"), "utf8");

describe("seed-eventos.sql versionado", () => {
  it("é igual ao que o gerador produz hoje (regenere com npm run gerar:seed-eventos)", () => {
    expect(arquivo).toBe(gerarSeedEventos(entrada));
  });

  it("o mapa de ids é igual ao casamento calculado (regenere com npm run gerar:mapa-ids-eventos)", () => {
    const r = casarEventos(entrada.antigos, entrada.torneios);
    expect(mapa.pares.map((p) => [p.idAntigo, p.idColetor])).toEqual(r.pares.map((p) => [p.idAntigo, p.idColetor]));
    expect([...mapa.soCampeonatos].sort()).toEqual(r.soCampeonatos.map((c) => c.id).sort());
  });

  it("tem uma linha por evento: todos do torneios.json mais os só do campeonatos.json", () => {
    const linhas = linhasDoSeed(entrada);
    expect(linhas).toHaveLength(torneios.length + mapa.soCampeonatos.length);
    const linhasSql = arquivo.split("\n").filter((l) => /^ {2}\('/.test(l) && l.includes("', '20"));
    expect(linhasSql.length).toBe(linhas.length);
  });

  it("roda dentro de uma transação e termina com conferências", () => {
    expect(arquivo).toMatch(/^begin;$/m);
    expect(arquivo).toMatch(/^commit;$/m);
    expect(arquivo).toMatch(/on conflict \(id\) do update set/);
    expect(arquivo).toMatch(/select count\(\*\) as total/);
  });

  it("não escreve em nenhuma outra tabela além de campeonatos e categorias", () => {
    const sql = arquivo
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    expect(sql).not.toMatch(/\b(delete from|drop |truncate|alter table)\b/i);
    expect(sql).not.toMatch(/insert into (?!campeonatos|categorias)/i);
    expect(sql).not.toMatch(/^\s*update (?!campeonatos)/im);
  });
});

describe("regras de id", () => {
  const linhas = linhasDoSeed(entrada);
  const porId = new Map(linhas.map((l) => [l.id, l]));

  it("evento nas duas fontes usa o id do campeonatos.json e guarda o do coletor", () => {
    for (const par of mapa.pares) {
      const l = porId.get(par.idAntigo);
      expect(l, par.idAntigo).toBeTruthy();
      expect(l!.idOrigem).toBe(par.idColetor);
      expect(l!.listado).toBe(true);
    }
  });

  it("evento só do torneios.json mantém o id do coletor", () => {
    const coletoresPareados = new Set(mapa.pares.map((p) => p.idColetor));
    const antigosIds = new Set((antigos as Campeonato[]).map((a) => a.id));
    for (const t of torneios as Torneio[]) {
      if (coletoresPareados.has(t.id)) continue;
      const l = porId.get(t.id);
      expect(l, t.id).toBeTruthy();
      expect(l!.idOrigem).toBe(t.id);
      // um id novo nunca pode colidir com o id de outro evento antigo
      expect(antigosIds.has(t.id) && !coletoresPareados.has(t.id) && !mapa.pares.some((p) => p.idAntigo === t.id)).toBe(false);
    }
  });

  it("evento só do campeonatos.json fica ativo, mas não listado, sem id_origem", () => {
    for (const id of mapa.soCampeonatos) {
      const l = porId.get(id)!;
      expect(l.listado).toBe(false);
      expect(l.idOrigem).toBeNull();
    }
  });

  it("ids e id_origem são únicos", () => {
    expect(new Set(linhas.map((l) => l.id)).size).toBe(linhas.length);
    const origens = linhas.map((l) => l.idOrigem).filter(Boolean);
    expect(new Set(origens).size).toBe(origens.length);
  });

  it("cidade padronizada e UF válida", () => {
    for (const l of linhas) {
      if (l.cidade) expect(l.cidade).not.toBe(l.cidade.toUpperCase() === l.cidade && l.cidade.length > 3 ? l.cidade : "");
      if (l.uf) expect(l.uf).toMatch(/^[A-Z]{2}$/);
    }
    expect(porId.get("261113_ourinhos_arena_kbeca")!.cidade).toBe("Ourinhos");
  });

  it("recupera foto, descrição e Instagram do formato antigo quando o coletor não tem", () => {
    const desafio = porId.get("261113_gv_desafio_allan")!;
    expect(desafio.foto).toBe("/campeonatos/261113_gv_desafio_allan.png");
    expect(desafio.categorias).toContain("Masculino Estreante");
  });
});

describe("escape e categorias", () => {
  it("sqlTexto dobra aspas simples e trata vazio como null", () => {
    expect(sqlTexto("Arena D'Água")).toBe("'Arena D''Água'");
    expect(sqlTexto("")).toBe("null");
    expect(sqlTexto("   ")).toBe("null");
    expect(sqlTexto(null)).toBe("null");
  });

  it("UF do local antigo", () => {
    expect(ufDoLocalAntigo("Arena Shark, Limeira, SP")).toBe("SP");
    expect(ufDoLocalAntigo("Morumbi, São Paulo")).toBeNull();
  });

  it("categorias só são inseridas se ainda não existirem (sem diferenciar maiúsculas)", () => {
    expect(arquivo).toMatch(/lower\(btrim\(c\.nome\)\) = lower\(btrim\(v\.nome\)\)/);
  });

  it("eventos sem categorias não geram linhas em categorias", () => {
    const sem = (torneios as Torneio[]).find((t) => t.categorias.length === 0 && !mapa.pares.some((p) => p.idColetor === t.id));
    if (sem) expect(arquivo).not.toMatch(new RegExp(`^ {2}\\('${sem.id}', '[^']*'\\),?$`, "m"));
  });

  it("categorias da curadoria antiga entram sem duplicar variações de caixa", () => {
    const l = linhasDoSeed(entrada).find((x) => x.id === "261129_gv_copa_2m")!;
    const chaves = l.categorias.map((c) => c.toLowerCase());
    expect(new Set(chaves).size).toBe(chaves.length);
    expect(l.categorias.length).toBeGreaterThan(0);
  });
});
