// Guarda de código: o site lê os eventos do banco (utils/eventos-db.ts). Os
// arquivos JSON de dados só podem ser usados pelo seed (utils/seed-eventos.ts,
// utils/casar-eventos.ts e os scripts de geração), nunca por páginas,
// componentes ou scripts do navegador.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC = join(__dirname, "..", "src");

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.(astro|ts|mjs|js)$/.test(nome) ? [caminho] : [];
  });
}

/** Remove comentários para só olhar código de verdade. */
function semComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("fontes de eventos", () => {
  const todos = arquivos(SRC).map((f) => ({ rel: relative(SRC, f).split(sep).join("/"), codigo: semComentarios(readFileSync(f, "utf8")) }));

  it("nenhum arquivo de src importa os JSON de dados de eventos", () => {
    const ofensores = todos.filter((a) => /(from|import\(|require\()\s*["'][^"']*data\/(torneios|campeonatos)\.json["']/.test(a.codigo)).map((a) => a.rel);
    expect(ofensores).toEqual([]);
  });

  it("carregarCampeonatos (leitura do JSON) não existe mais", () => {
    expect(todos.filter((a) => /carregarCampeonatos/.test(a.codigo)).map((a) => a.rel)).toEqual([]);
  });

  it("home, lista, detalhe, perfil, organizar e acompanhar usam carregarEventos", () => {
    for (const rel of [
      "pages/index.astro",
      "components/EventsSection.astro",
      "components/JogadorPerfil.astro",
      "pages/campeonatos/[id].astro",
      "pages/campeonatos/[id]/acompanhar.astro",
      "pages/campeonatos/[id]/organizar/index.astro",
      "pages/campeonatos/[id]/organizar/[categoria].astro",
    ]) {
      const a = todos.find((x) => x.rel === rel);
      expect(a, rel).toBeTruthy();
      expect(a!.codigo, rel).toMatch(/carregarEventos\(/);
    }
  });

  it("o detalhe gera redirecionamento para o id do coletor (links antigos)", () => {
    const a = todos.find((x) => x.rel === "pages/campeonatos/[id].astro")!;
    expect(a.codigo).toMatch(/Astro\.redirect\(/);
    expect(a.codigo).toMatch(/idOrigem/);
  });
});
