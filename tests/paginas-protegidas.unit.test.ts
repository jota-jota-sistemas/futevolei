// Guarda de código: toda tela de gerenciamento está atrás de GuardaAcesso e só
// inicia seus scripts depois da guarda; as páginas públicas não usam a guarda.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PAGES = join(__dirname, "..", "src", "pages");
const ler = (rel: string) => readFileSync(join(PAGES, rel), "utf8");

const PROTEGIDAS = [
  "gerenciar/index.astro",
  "gerenciar_jogadores/index.astro",
  "gerenciar_jogadores/editar.astro",
  "gerenciar_campeonatos/index.astro",
  "gerenciar_campeonatos/editar.astro",
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
    for (const rel of [
      "gerenciar_jogadores/index.astro",
      "gerenciar_jogadores/editar.astro",
      "gerenciar_campeonatos/index.astro",
      "gerenciar_campeonatos/editar.astro",
    ]) {
      const f = ler(rel);
      expect(f).toMatch(/guardarAcesso\(.*\)\.then\(\(liberado\) => \{\s*if \(!liberado\) return;/);
    }
    const cat = ler("campeonatos/[id]/organizar/[categoria].astro");
    expect(cat).toMatch(/if \(!\(await guardarAcesso\(/);
  });
});

describe("painel /gerenciar e papel de organizador", () => {
  it("o painel aceita admin e organizador e esconde jogadores para o organizador", () => {
    const f = ler("gerenciar/index.astro");
    expect(f).toMatch(/permitir:\s*\["admin",\s*"organizador"\]/);
    expect(f).toMatch(/data-painel-jogadores/);
    expect(f).toMatch(/papel !== "admin"/);
  });

  it("as telas de jogadores continuam só de admin (sem permitir organizador)", () => {
    for (const rel of ["gerenciar_jogadores/index.astro", "gerenciar_jogadores/editar.astro"]) {
      expect(ler(rel), rel).not.toMatch(/organizador/);
    }
  });
});

describe("organizar: organizador só nos eventos dele", () => {
  const ORGANIZAR = ["campeonatos/[id]/organizar/index.astro", "campeonatos/[id]/organizar/[categoria].astro"];

  it("as duas páginas aceitam admin e organizador e conferem a posse do evento antes de revelar", () => {
    for (const rel of ORGANIZAR) {
      const f = ler(rel);
      expect(f, rel).toMatch(/permitir:\s*\["admin",\s*"organizador"\]/);
      expect(f, rel).toMatch(/verificar:\s*verificarPosseDoEvento\(criarCampeonatoStoreBrowser\(\)/);
    }
  });

  it("o id do evento vem do HTML da própria página (data-campeonato-id)", () => {
    for (const rel of ORGANIZAR) expect(ler(rel), rel).toMatch(/data-campeonato-id=\{campeonato\.id\}/);
  });
});

describe("lista de campeonatos: voltar do organizador", () => {
  it("o organizador volta ao início (não ao painel, que ele não usa)", () => {
    const f = ler("gerenciar_campeonatos/index.astro");
    expect(f).toMatch(/papel === "organizador"\) trocarVoltar\(document, comBase\("\/"\)/);
  });
});

describe("gerenciar campeonatos: organizador", () => {
  it("a lista e a edição aceitam admin e organizador e repassam o papel às telas", () => {
    const lista = ler("gerenciar_campeonatos/index.astro");
    expect(lista).toMatch(/permitir:\s*\["admin",\s*"organizador"\]/);
    expect(lista).toMatch(/apenasMeus:\s*papel === "organizador"/);
    const editar = ler("gerenciar_campeonatos/editar.astro");
    expect(editar).toMatch(/permitir:\s*\["admin",\s*"organizador"\]/);
    expect(editar).toMatch(/verificarPosse:\s*papel === "organizador"/);
  });
});

describe("gerenciar campeonatos", () => {
  it("só importa o cliente público (nunca o do servidor) e não mostra o campo de foto", () => {
    const fontes = [
      "gerenciar_campeonatos/index.astro",
      "gerenciar_campeonatos/editar.astro",
    ].map(ler);
    for (const f of fontes) expect(f).not.toMatch(/supabase\.server/);
    const form = readFileSync(join(PAGES, "..", "components", "CampeonatoForm.astro"), "utf8");
    expect(form).not.toMatch(/name="foto"/);
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
