// @vitest-environment happy-dom
//
// Feature: filtros-eventos-usabilidade — integração no DOM.
// Cobre o comportamento observável do grid: filtro por Cidade, Período (presets)
// e Nível no clique de Buscar (Nível + Gênero têm suíte própria); contador; chips de filtros ativos; remoção
// individual; limpar tudo. A mesma regra pura (corresponde/cidadeDoLocal/
// intervaloDoPreset) decide testes e navegador.
import { it, expect, beforeEach, vi } from "vitest";

function montarDOM() {
  document.body.innerHTML = `
    <select data-filtro="cidade">
      <option value="">Todas as cidades</option>
      <option value="São Paulo">São Paulo (2)</option>
      <option value="Santos">Santos (1)</option>
    </select>
    <div data-presets role="group">
      <button type="button" data-preset="2026-11" aria-pressed="false">Novembro 2026</button>
      <button type="button" data-preset="2026-12" aria-pressed="false">Dezembro 2026</button>
    </div>
    <input type="hidden" data-filtro="preset" value="" />
    <select data-filtro="nivel">
      <option value="">Todos os níveis</option>
      <option value="Open">Open (1)</option>
      <option value="Amador">Amador (1)</option>
    </select>
    <div data-generos role="group">
      <button type="button" data-genero="Masculino" aria-pressed="false">Masculino</button>
      <button type="button" data-genero="Feminino" aria-pressed="false">Feminino</button>
    </div>
    <input type="hidden" data-filtro="genero" value="" />
    <button type="button" data-buscar><span>🔍</span> Buscar</button>
    <button type="button" data-limpar>Limpar</button>
    <p data-contador aria-live="polite">4 eventos</p>
    <ul data-chips></ul>
    <div class="eventos__grid" data-grid-eventos>
      <article data-evento data-local="Morumbi, São Paulo" data-data="2026-11-22" data-categorias="Open"></article>
      <article data-evento data-local="Arena X, São Paulo, SP" data-data="2026-12-05" data-categorias></article>
      <article data-evento data-local="Santos, SP" data-data="2026-11-13" data-categorias="Amador"></article>
      <article data-evento data-local="Santos, SP" data-data="2026-12-19" data-categorias></article>
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
const contador = () => (document.querySelector("[data-contador]") as HTMLElement).textContent?.trim();
const clicarBuscar = () => (document.querySelector("[data-buscar] span") as HTMLElement).click();
const clicarPreset = (v: string) => (document.querySelector(`[data-preset="${v}"]`) as HTMLElement).click();

beforeEach(async () => {
  vi.resetModules();
  montarDOM();
  await import("../src/scripts/filtros-cliente.ts");
});

it("estado inicial: 4 visíveis, sem chips", () => {
  clicarBuscar();
  expect(vis()).toHaveLength(4);
  expect(contador()).toBe("4 eventos");
  expect(chipsRemover()).toEqual([]);
});

it("filtro por cidade São Paulo (via cidadeDoLocal dos dois formatos)", () => {
  ctrl('[data-filtro="cidade"]').value = "São Paulo";
  clicarBuscar();
  expect(vis()).toEqual(["2026-11-22", "2026-12-05"]);
  expect(contador()).toBe("2 de 4 eventos");
  expect(chipsRemover()).toEqual(["cidade"]);
});

it("preset de mês marca aria-pressed e filtra só no Buscar", () => {
  clicarPreset("2026-12");
  expect((document.querySelector('[data-preset="2026-12"]') as HTMLElement).getAttribute("aria-pressed")).toBe("true");
  expect(vis()).toHaveLength(4); // ainda não filtrou (só marcou)
  clicarBuscar();
  expect(vis()).toEqual(["2026-12-05", "2026-12-19"]); // só dezembro
  expect(chipsRemover()).toEqual(["preset"]);
});

it("reclicar o preset ativo desmarca", () => {
  clicarPreset("2026-12");
  clicarPreset("2026-12");
  expect(ctrl('[data-filtro="preset"]').value).toBe("");
  clicarBuscar();
  expect(vis()).toHaveLength(4);
});

it("cidade + nível combinados (AND)", () => {
  ctrl('[data-filtro="cidade"]').value = "São Paulo";
  ctrl('[data-filtro="nivel"]').value = "Open";
  clicarBuscar();
  expect(vis()).toEqual(["2026-11-22"]); // SP + Open
  expect(chipsRemover()).toEqual(["cidade", "nivel"]);
});

it("remover chip de cidade mantém os outros filtros", () => {
  ctrl('[data-filtro="cidade"]').value = "São Paulo";
  clicarPreset("2026-12");
  clicarBuscar();
  expect(chipsRemover()).toEqual(["cidade", "preset"]);
  (document.querySelector('[data-chip-remover="cidade"] .eventos__chip-x') as HTMLElement).click();
  expect(ctrl('[data-filtro="cidade"]').value).toBe("");
  expect(ctrl('[data-filtro="preset"]').value).toBe("2026-12"); // preset mantido
  expect(vis()).toEqual(["2026-12-05", "2026-12-19"]);
});

it("sem correspondência mostra estado vazio", () => {
  ctrl('[data-filtro="cidade"]').value = "Santos";
  ctrl('[data-filtro="nivel"]').value = "Open"; // Santos não tem Open
  clicarBuscar();
  expect(vis()).toEqual([]);
  expect((document.querySelector("[data-vazio-filtro]") as HTMLElement).hidden).toBe(false);
});

it("limpar tudo zera controles, preset e chips", () => {
  ctrl('[data-filtro="cidade"]').value = "São Paulo";
  clicarPreset("2026-12");
  clicarBuscar();
  (document.querySelector("[data-limpar]") as HTMLButtonElement).click();
  expect(ctrl('[data-filtro="cidade"]').value).toBe("");
  expect(ctrl('[data-filtro="preset"]').value).toBe("");
  expect(vis()).toHaveLength(4);
  expect(chipsRemover()).toEqual([]);
});
