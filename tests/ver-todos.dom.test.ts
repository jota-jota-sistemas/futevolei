// @vitest-environment happy-dom
//
// Feature: finalizacao-eventos — "Ver todos os eventos" (limite inicial).
// Cobre o comportamento observável do feed: estado inicial colapsado mostra
// apenas os primeiros LIMITE_INICIAL cards com o botão "Ver todos" visível;
// clicar revela todos e esconde o botão; aplicar filtro mostra TODOS os
// correspondentes (ignorando o limite) e esconde o botão; "Limpar filtros"
// volta ao estado colapsado. A mesma regra pura decide filtro e navegador.
import { it, expect, beforeEach, vi } from "vitest";

const LIMITE = 8;

/** Monta um grid com `total` cards; os posteriores a LIMITE são excedentes. */
function montarDOM(total: number) {
  const cards = Array.from({ length: total }, (_, i) => {
    const dia = String((i % 28) + 1).padStart(2, "0");
    const excedente = i >= LIMITE ? "data-excedente=\"true\"" : "";
    // Alterna cidade para permitir um filtro que reduz o conjunto.
    const cidade = i % 2 === 0 ? "São Paulo" : "Santos";
    return `<article data-evento data-local="${cidade}, SP" data-data="2026-11-${dia}" data-categorias ${excedente}></article>`;
  }).join("");

  document.body.innerHTML = `
    <select data-filtro="cidade">
      <option value="">Todas as cidades</option>
      <option value="São Paulo">São Paulo</option>
      <option value="Santos">Santos</option>
    </select>
    <input type="hidden" data-filtro="preset" value="" />
    <select data-filtro="nivel"><option value="">Todos</option></select>
    <input type="hidden" data-filtro="genero" value="" />
    <button type="button" data-buscar>Buscar</button>
    <button type="button" data-limpar>Limpar</button>
    <button type="button" data-ver-todos hidden>Ver todos</button>
    <p data-contador></p>
    <ul data-chips></ul>
    <div class="eventos__grid" data-grid-eventos data-expandido="false">
      ${cards}
      <p class="eventos__vazio" data-vazio-filtro hidden></p>
    </div>`;
}

const visiveis = () =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-evento]")).filter(
    (c) => !c.hidden
  ).length;
const ctrl = (q: string) => document.querySelector(q) as HTMLInputElement | HTMLSelectElement;
const botaoVerTodos = () => document.querySelector("[data-ver-todos]") as HTMLElement;
const clicar = (q: string) => (document.querySelector(q) as HTMLElement).click();
const contador = () => (document.querySelector("[data-contador]") as HTMLElement).textContent?.trim();

beforeEach(() => {
  vi.resetModules();
});

it("estado inicial: mostra só LIMITE cards e o botão 'Ver todos' aparece", async () => {
  montarDOM(20);
  await import("../src/scripts/filtros-cliente.ts");
  // O módulo roda aplicarFiltros() na carga; não precisa de clique.
  expect(visiveis()).toBe(LIMITE);
  expect(botaoVerTodos().hidden).toBe(false);
  expect(contador()).toBe(`${LIMITE} de 20 eventos`);
});

it("com <= LIMITE eventos não há botão e todos aparecem", async () => {
  montarDOM(LIMITE);
  await import("../src/scripts/filtros-cliente.ts");
  expect(visiveis()).toBe(LIMITE);
  expect(botaoVerTodos().hidden).toBe(true);
});

it("clicar 'Ver todos' revela todos os cards e esconde o botão", async () => {
  montarDOM(20);
  await import("../src/scripts/filtros-cliente.ts");
  clicar("[data-ver-todos]");
  expect(visiveis()).toBe(20);
  expect(botaoVerTodos().hidden).toBe(true);
  expect(contador()).toBe("20 eventos");
});

it("aplicar filtro mostra TODOS os correspondentes, ignorando o limite", async () => {
  montarDOM(20); // 10 São Paulo, 10 Santos
  await import("../src/scripts/filtros-cliente.ts");
  ctrl('[data-filtro="cidade"]').value = "São Paulo";
  clicar("[data-buscar]");
  expect(visiveis()).toBe(10); // mais que o LIMITE: o limite não se aplica com filtro
  expect(botaoVerTodos().hidden).toBe(true);
  expect(contador()).toBe("10 de 20 eventos");
});

it("'Limpar filtros' volta ao estado colapsado com o botão visível", async () => {
  montarDOM(20);
  await import("../src/scripts/filtros-cliente.ts");
  // expande e filtra, depois limpa
  clicar("[data-ver-todos]");
  ctrl('[data-filtro="cidade"]').value = "Santos";
  clicar("[data-buscar]");
  clicar("[data-limpar]");
  expect(visiveis()).toBe(LIMITE);
  expect(botaoVerTodos().hidden).toBe(false);
  expect(ctrl('[data-filtro="cidade"]').value).toBe("");
});
