// @vitest-environment happy-dom
//
// Feature: filtro de categorias por Nível e Gênero: integração no DOM.
// Cobre o select de Nível, os chips de Gênero (seleção única, só filtram no
// "Buscar"), o casamento de nível e gênero na MESMA categoria, o padrão
// Masculino, o grupo "Outros", os chips de filtros ativos e a limpeza.
import { it, expect, beforeEach, vi } from "vitest";

function montarDOM() {
  document.body.innerHTML = `
    <select data-filtro="cidade"><option value="">Todas as cidades</option></select>
    <input type="hidden" data-filtro="preset" value="" />
    <select data-filtro="nivel">
      <option value="">Todos os níveis</option>
      <option value="Estreante">Estreante</option>
      <option value="Iniciante">Iniciante</option>
      <option value="Outros">Outros</option>
    </select>
    <div data-generos role="group">
      <button type="button" data-genero="Masculino" aria-pressed="false">Masculino</button>
      <button type="button" data-genero="Feminino" aria-pressed="false">Feminino</button>
      <button type="button" data-genero="Misto" aria-pressed="false">Misto</button>
    </div>
    <input type="hidden" data-filtro="genero" value="" />
    <button type="button" data-buscar><span>🔍</span> Buscar</button>
    <button type="button" data-limpar>Limpar</button>
    <p data-contador></p>
    <ul data-chips></ul>
    <div class="eventos__grid" data-grid-eventos>
      <!-- A: Feminino Iniciante + Masculino Estreante -->
      <article data-evento data-local="Arena, São Paulo, SP" data-data="2026-11-10" data-categorias="Feminino Iniciante|Masculino Estreante"></article>
      <!-- B: ARMADILHA: Feminino em uma categoria, Iniciante em outra -->
      <article data-evento data-local="Arena, Santos, SP" data-data="2026-11-11" data-categorias="Feminino Master|Masculino Iniciante"></article>
      <!-- C: "Iniciante" sem gênero escrito (padrão Masculino) -->
      <article data-evento data-local="Arena, São Paulo, SP" data-data="2026-11-12" data-categorias="Iniciante"></article>
      <!-- D: só "Outros" (sem gênero padrão) -->
      <article data-evento data-local="Arena, Santos, SP" data-data="2026-11-13" data-categorias="Kids|Pais E Filhos"></article>
      <!-- E: sem categorias -->
      <article data-evento data-local="Arena, São Paulo, SP" data-data="2026-11-14" data-categorias></article>
      <p class="eventos__vazio" data-vazio-filtro hidden></p>
    </div>`;
}

const vis = () =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-evento]"))
    .filter((c) => !c.hidden)
    .map((c) => c.dataset.data);
const ctrl = (q: string) => document.querySelector(q) as HTMLInputElement | HTMLSelectElement;
const chipsRemover = () =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-chip-remover]")).map((c) => c.dataset.chipRemover);
const pressionado = (g: string) =>
  (document.querySelector(`[data-genero="${g}"]`) as HTMLElement).getAttribute("aria-pressed");
const clicarBuscar = () => (document.querySelector("[data-buscar] span") as HTMLElement).click();
const clicarGenero = (g: string) => (document.querySelector(`[data-genero="${g}"]`) as HTMLElement).click();
const escolherNivel = (n: string) => { ctrl('[data-filtro="nivel"]').value = n; };

beforeEach(async () => {
  vi.resetModules();
  montarDOM();
  await import("../src/scripts/filtros-cliente.ts");
});

it("nível Iniciante: qualquer categoria Iniciante, inclusive a sem gênero escrito", () => {
  escolherNivel("Iniciante");
  clicarBuscar();
  expect(vis()).toEqual(["2026-11-10", "2026-11-11", "2026-11-12"]); // A, B, C
  expect(chipsRemover()).toEqual(["nivel"]);
});

it("gênero Feminino: o chip marca aria-pressed e só filtra no Buscar", () => {
  clicarGenero("Feminino");
  expect(pressionado("Feminino")).toBe("true");
  expect(ctrl('[data-filtro="genero"]').value).toBe("Feminino");
  expect(vis()).toHaveLength(5); // ainda não filtrou
  clicarBuscar();
  expect(vis()).toEqual(["2026-11-10", "2026-11-11"]); // A (Fem. Iniciante) e B (Fem. Master)
  expect(chipsRemover()).toEqual(["genero"]);
});

it("reclicar o chip de gênero ativo desmarca", () => {
  clicarGenero("Feminino");
  clicarGenero("Feminino");
  expect(pressionado("Feminino")).toBe("false");
  expect(ctrl('[data-filtro="genero"]').value).toBe("");
});

it("seleção única: escolher outro gênero troca o anterior", () => {
  clicarGenero("Feminino");
  clicarGenero("Misto");
  expect(pressionado("Feminino")).toBe("false");
  expect(pressionado("Misto")).toBe("true");
  expect(ctrl('[data-filtro="genero"]').value).toBe("Misto");
});

it("Feminino + Iniciante casam na MESMA categoria: a armadilha (B) fica de fora", () => {
  clicarGenero("Feminino");
  escolherNivel("Iniciante");
  clicarBuscar();
  // A tem "Feminino Iniciante". B tem "Feminino Master" e "Masculino Iniciante"
  // em categorias diferentes, então não pode aparecer.
  expect(vis()).toEqual(["2026-11-10"]);
  expect(chipsRemover()).toEqual(["nivel", "genero"]);
});

it("Masculino inclui a categoria sem gênero escrito (padrão), mas não 'Outros'", () => {
  clicarGenero("Masculino");
  clicarBuscar();
  expect(vis()).toEqual(["2026-11-10", "2026-11-11", "2026-11-12"]); // A, B, C; D e E fora
});

it("Masculino + Iniciante: B (Masculino Iniciante) e C (padrão); A não, pois o Iniciante dela é Feminino", () => {
  clicarGenero("Masculino");
  escolherNivel("Iniciante");
  clicarBuscar();
  expect(vis()).toEqual(["2026-11-11", "2026-11-12"]);
});

it("nível Outros mostra o evento só com Kids/Pais e Filhos; com gênero Masculino some", () => {
  escolherNivel("Outros");
  clicarBuscar();
  expect(vis()).toEqual(["2026-11-13"]);
  clicarGenero("Masculino");
  clicarBuscar();
  expect(vis()).toEqual([]); // "Outros" não recebe gênero padrão
  expect((document.querySelector("[data-vazio-filtro]") as HTMLElement).hidden).toBe(false);
});

it("remover o chip de gênero desmarca o botão e mantém o nível", () => {
  clicarGenero("Feminino");
  escolherNivel("Iniciante");
  clicarBuscar();
  (document.querySelector('[data-chip-remover="genero"] .eventos__chip-x') as HTMLElement).click();
  expect(pressionado("Feminino")).toBe("false");
  expect(ctrl('[data-filtro="genero"]').value).toBe("");
  expect(ctrl('[data-filtro="nivel"]').value).toBe("Iniciante");
  expect(vis()).toEqual(["2026-11-10", "2026-11-11", "2026-11-12"]);
  expect(chipsRemover()).toEqual(["nivel"]);
});

it("limpar tudo zera nível, gênero (inclusive o botão) e os chips", () => {
  clicarGenero("Misto");
  escolherNivel("Estreante");
  clicarBuscar();
  (document.querySelector("[data-limpar]") as HTMLButtonElement).click();
  expect(ctrl('[data-filtro="nivel"]').value).toBe("");
  expect(ctrl('[data-filtro="genero"]').value).toBe("");
  expect(pressionado("Misto")).toBe("false");
  expect(vis()).toHaveLength(5);
  expect(chipsRemover()).toEqual([]);
});
