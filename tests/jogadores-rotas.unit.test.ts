// tests/jogadores-rotas.unit.test.ts
//
// Separação entre a CONSULTA PÚBLICA de jogadores (/jogadores) e a ÁREA DE
// GERENCIAMENTO (/gerenciar_jogadores), restrita a administradores logados.
//
// A guarda de código abaixo impede que o caminho de gerenciamento apareça, como
// string literal, em qualquer arquivo fora da própria área: assim ele não vira
// link de menu/rodapé nem entra, por engano, em módulos compartilhados que as
// páginas públicas carregam.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { hrefGerenciar, hrefGerenciarJogador } from "../src/scripts/rotas-gerenciar";
import { hrefPerfilJogador } from "../src/utils/url";
import { ITENS_MENU } from "../src/utils/menu";

const RAIZ = join(__dirname, "..", "src");

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
  });
}

describe("rotas de jogadores", () => {
  it("o perfil público e a edição do gerenciamento são caminhos diferentes", () => {
    expect(hrefPerfilJogador("abc")).toBe("/jogadores/perfil?id=abc");
    expect(hrefGerenciar()).toBe("/gerenciar_jogadores");
    expect(hrefGerenciarJogador("abc")).toBe("/gerenciar_jogadores/editar?id=abc");
  });

  it("o id é escapado na query string (nunca vira outro parâmetro)", () => {
    expect(hrefGerenciarJogador("a&b=c")).toBe("/gerenciar_jogadores/editar?id=a%26b%3Dc");
    expect(hrefPerfilJogador("a&b=c")).toBe("/jogadores/perfil?id=a%26b%3Dc");
  });

  it("o menu e o rodapé só apontam para a consulta pública", () => {
    for (const item of ITENS_MENU) expect(item.href).not.toMatch(/gerenciar/i);
    expect(ITENS_MENU.some((i) => i.href === "/jogadores")).toBe(true);
  });
});

describe("guarda: o caminho de gerenciamento fica restrito à própria área", () => {
  // Arquivos autorizados a citar o caminho: as páginas de gerenciamento e o módulo
  // de rotas que só elas importam.
  const permitido = (rel: string) =>
    rel.startsWith(`pages${sep}gerenciar_jogadores${sep}`) || rel === `scripts${sep}rotas-gerenciar.ts`;

  // Procura o caminho como STRING LITERAL (aspas ou crase logo antes). Menções
  // em comentários não contam: não chegam ao resultado do build.
  const comoLiteral = /["'`]\/?gerenciar_jogadores/;

  it("nenhum outro arquivo de src cita o caminho como string de código", () => {
    const infratores = arquivos(RAIZ)
      .map((f) => relative(RAIZ, f))
      .filter((rel) => /\.(ts|astro|js|mjs)$/.test(rel) && !permitido(rel))
      .filter((rel) => comoLiteral.test(readFileSync(join(RAIZ, rel), "utf8")));
    expect(infratores).toEqual([]);
  });

  it("a guarda funciona: as páginas de gerenciamento CITAM o caminho (senão o teste não prova nada)", () => {
    const rotas = readFileSync(join(RAIZ, "scripts", "rotas-gerenciar.ts"), "utf8");
    expect(comoLiteral.test(rotas)).toBe(true);
  });

  it("as páginas de gerenciamento pedem aos buscadores para não indexar", () => {
    for (const pagina of ["index.astro", "editar.astro"]) {
      const fonte = readFileSync(join(RAIZ, "pages", "gerenciar_jogadores", pagina), "utf8");
      expect(fonte).toMatch(/\bnoindex\b/);
      expect(fonte).toMatch(/gerenciar/); // usam o modo de gerenciamento
    }
  });

  it("as páginas públicas NÃO ligam o modo de gerenciamento", () => {
    for (const pagina of ["index.astro", "perfil.astro"]) {
      const fonte = readFileSync(join(RAIZ, "pages", "jogadores", pagina), "utf8");
      expect(fonte).not.toMatch(/gerenciar\s*:\s*true/);
      expect(fonte).not.toMatch(/<JogadoresLista\s+gerenciar|<JogadorPerfil\s+gerenciar/);
      expect(fonte).not.toMatch(/\bnoindex\b/); // a consulta pública deve ser indexável
    }
  });
});
