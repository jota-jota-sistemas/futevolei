// @vitest-environment happy-dom
//
// Busca de texto na lista de eventos (nome + local): filtra ao digitar,
// combina com os filtros do hero já aplicados e nunca aplica filtros pendentes.
import { it, expect, beforeEach, vi } from "vitest";

const LIMITE = 8;

const EVENTOS = [
  { nome: "Copa Verão", local: "Santos, SP" },
  { nome: "Open São Paulo", local: "São Paulo, SP" },
  { nome: "Circuito Praia", local: "Santos, SP" },
  { nome: "Desafio da Areia", local: "Campinas, SP" },
];

function montarDOM(eventos: { nome: string; local: string }[], excedentes = false) {
  const cards = eventos
    .map((e, i) => {
      const exc = excedentes && i >= LIMITE ? 'data-excedente="true"' : "";
      return `<article data-evento data-nome="${e.nome}" data-local="${e.local}" data-data="2026-11-10" data-categorias ${exc}></article>`;
    })
    .join("");
  document.body.innerHTML = `
    <input type="search" data-filtro="busca" />
    <select data-filtro="cidade">
      <option value="">Todas</option>
      <option value="Santos">Santos</option>
      <option value="Campinas">Campinas</option>
    </select>
    <input type="hidden" data-filtro="preset" value="" />
    <select data-filtro="nivel"><option value="">Todos</option></select>
    <input type="hidden" data-filtro="genero" value="" />
    <button type="button" data-buscar>Buscar</button>
    <button type="button" data-limpar>Limpar</button>
    <button type="button" data-ver-todos hidden>Ver todos</button>
    <p data-contador></p>
    <ul data-chips></ul>
    <div data-grid-eventos data-expandido="false">
      ${cards}
      <p data-vazio-filtro hidden></p>
    </div>`;
}

const nomesVisiveis = () =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-evento]"))
    .filter((c) => !c.hidden)
    .map((c) => c.dataset.nome);
const busca = () => document.querySelector('[data-filtro="busca"]') as HTMLInputElement;
const cidade = () => document.querySelector('[data-filtro="cidade"]') as HTMLSelectElement;
const digitar = (v: string) => {
  busca().value = v;
  busca().dispatchEvent(new Event("input", { bubbles: true }));
};
const clicar = (q: string) => (document.querySelector(q) as HTMLElement).click();
const contador = () => document.querySelector("[data-contador]")!.textContent?.trim();
const vazio = () => document.querySelector<HTMLElement>("[data-vazio-filtro]")!;
const chips = () => document.querySelectorAll("[data-chip-remover]").length;

beforeEach(() => {
  vi.resetModules();
});

// O módulo registra listeners uma única vez por document (guard) e guarda
// estado (snapshot, expandido). Como o happy-dom é compartilhado entre os
// testes do arquivo, "Limpar" zera esse estado a cada teste.
async function carregar() {
  await import("../src/scripts/filtros-cliente.ts");
  clicar("[data-limpar]");
}

it("filtra ao digitar, sem clicar em Buscar, ignorando acento e caixa", async () => {
  montarDOM(EVENTOS);
  await carregar();
  digitar("SAO paulo");
  expect(nomesVisiveis()).toEqual(["Open São Paulo"]);
  expect(contador()).toBe("1 de 4 evento");
});

it("busca também pelo local", async () => {
  montarDOM(EVENTOS);
  await carregar();
  digitar("campinas");
  expect(nomesVisiveis()).toEqual(["Desafio da Areia"]);
});

it("combina com a cidade já aplicada", async () => {
  montarDOM(EVENTOS);
  await carregar();
  cidade().value = "Santos";
  clicar("[data-buscar]");
  digitar("praia");
  expect(nomesVisiveis()).toEqual(["Circuito Praia"]);
});

it("select pendente NÃO é aplicado ao digitar", async () => {
  montarDOM(EVENTOS);
  await carregar();
  cidade().value = "Campinas"; // escolhido, mas sem clicar em Buscar
  digitar("a");
  expect(nomesVisiveis()).toContain("Copa Verão");
  expect(chips()).toBe(0);
});

it("Buscar aplica o select mantendo o texto digitado", async () => {
  montarDOM(EVENTOS);
  await carregar();
  digitar("santos");
  cidade().value = "Santos";
  clicar("[data-buscar]");
  expect(busca().value).toBe("santos");
  expect(nomesVisiveis()).toEqual(["Copa Verão", "Circuito Praia"]);
  expect(chips()).toBe(1);
});

it("Limpar filtros zera o texto e mostra tudo", async () => {
  montarDOM(EVENTOS);
  await carregar();
  digitar("copa");
  clicar("[data-limpar]");
  expect(busca().value).toBe("");
  expect(nomesVisiveis()).toHaveLength(4);
});

it("estado vazio aparece sem resultados e some ao apagar", async () => {
  montarDOM(EVENTOS);
  await carregar();
  digitar("xyz");
  expect(vazio().hidden).toBe(false);
  expect(contador()).toBe("0 de 4 eventos");
  digitar("");
  expect(vazio().hidden).toBe(true);
});

it("digitar não cria chip", async () => {
  montarDOM(EVENTOS);
  await carregar();
  digitar("copa");
  expect(chips()).toBe(0);
});

it("texto ignora o limite de 8 e esconde 'Ver todos'", async () => {
  const muitos = Array.from({ length: 20 }, (_, i) => ({
    nome: i >= 10 ? `Torneio Alfa ${i}` : `Torneio ${i}`,
    local: "Santos, SP",
  }));
  montarDOM(muitos, true);
  await carregar();
  expect(nomesVisiveis()).toHaveLength(LIMITE);
  digitar("alfa");
  expect(nomesVisiveis()).toHaveLength(10);
  expect((document.querySelector("[data-ver-todos]") as HTMLElement).hidden).toBe(true);
  digitar("");
  expect(nomesVisiveis()).toHaveLength(LIMITE);
  expect((document.querySelector("[data-ver-todos]") as HTMLElement).hidden).toBe(false);
});
