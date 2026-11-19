// Contrato da página de organização da categoria depois da Fase 2 (lê o FONTE):
// o markup oferece o que os módulos de src/scripts/organizar esperam, os botões
// "Salvar" que viraram salvamento automático saíram e o <script> não voltou a crescer.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const fonte = readFileSync("src/pages/campeonatos/[id]/organizar/[categoria].astro", "utf8");
const script = fonte.slice(fonte.indexOf("\n<script>\n"), fonte.indexOf("\n</script>"));

describe("página organizar/[categoria] (Fase 2)", () => {
  it.each([
    "<Toasts />",
    "<OrganizarSecoes",
    "<OrganizarEstilos />",
    "data-jogadores-lista",
    "data-aviso-repetida",
    "data-repetida-forcar",
    "data-colar-texto",
    "data-colar-previa",
    "data-colar-confirmar",
    "data-sugestao",
    "data-usar-sugestao",
    "data-formato-dica",
    "data-sortear",
    "data-alfabetica",
    "data-resumo-geracao",
    "data-confirmar-aviso",
    "data-aviso-chaveamento",
  ])("tem %s no markup", (marca) => {
    expect(fonte).toContain(marca);
  });

  it("não tem mais os botões de salvar formato e nivelador (salvam sozinhos)", () => {
    expect(fonte).not.toContain("data-salvar-formato");
    expect(fonte).not.toContain("data-salvar-seeding");
  });

  it("os quatro itens da barra de seções apontam para ids que existem", () => {
    for (const id of ["titulo-duplas", "titulo-formato", "titulo-gerar", "titulo-fila"]) {
      expect(fonte).toContain(`id: "${id}"`);
      expect(fonte).toContain(`id="${id}"`);
    }
  });

  it("o <script> usa os módulos e continua menor que antes (1.278 linhas)", () => {
    for (const m of ["duplas", "colar-lista", "formato", "nivelador", "toast", "rascunho", "secoes", "mensagens"]) {
      expect(script).toContain(`scripts/organizar/${m}`);
    }
    expect(script.split("\n").length).toBeLessThan(1000);
  });

  it("não usa innerHTML nem window.confirm", () => {
    expect(script).not.toMatch(/innerHTML\s*=/);
    expect(script).not.toMatch(/\bconfirm\(/);
  });
});
