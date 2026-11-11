// Guarda de código: toda tela de gerenciamento está atrás de GuardaAcesso e só
// inicia seus scripts depois da guarda; as páginas públicas não usam a guarda.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PAGES = join(__dirname, "..", "src", "pages");
const ler = (rel: string) => readFileSync(join(PAGES, rel), "utf8");

const PROTEGIDAS = [
  "gerenciar_jogadores/index.astro",
  "gerenciar_jogadores/editar.astro",
  "campeonatos/[id]/organizar/index.astro",
  "campeonatos/[id]/organizar/[categoria].astro",
];
const PUBLICAS = [
  "index.astro",
  "jogadores/index.astro",
  "jogadores/perfil.astro",
  "campeonatos/[id].astro",
  "campeonatos/[id]/acompanhar.astro",
];

describe("páginas de gerenciamento", () => {
  for (const rel of PROTEGIDAS) {
    it(`${rel}: GuardaAcesso, noindex e script condicionado à guarda`, () => {
      const f = ler(rel);
      expect(f).toMatch(/<GuardaAcesso>/);
      expect(f).toMatch(/\bnoindex\b/);
      expect(f).toMatch(/guardarAcesso\(/);
    });
  }

  it("as telas com iniciadores só os chamam depois de liberado", () => {
    for (const rel of ["gerenciar_jogadores/index.astro", "gerenciar_jogadores/editar.astro"]) {
      const f = ler(rel);
      expect(f).toMatch(/guardarAcesso\(.*\)\.then\(\(liberado\) => \{\s*if \(!liberado\) return;/);
    }
    const cat = ler("campeonatos/[id]/organizar/[categoria].astro");
    expect(cat).toMatch(/if \(!\(await guardarAcesso\(/);
  });
});

describe("páginas públicas", () => {
  for (const rel of PUBLICAS) {
    it(`${rel}: sem guarda (continua aberta)`, () => {
      const f = ler(rel);
      expect(f).not.toMatch(/GuardaAcesso/);
      expect(f).not.toMatch(/guardarAcesso/);
    });
  }
});
