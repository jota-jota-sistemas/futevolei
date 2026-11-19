// @vitest-environment happy-dom
//
// Autocomplete opcional de "jogador cadastrado" nos campos de atleta da
// organização: opções do datalist, vínculo só com texto exato, desfazer o
// vínculo ao editar à mão e ler os ids vinculados.

import { describe, it, expect, beforeEach } from "vitest";
import type { Jogador } from "../src/domain/jogadores/types";
import { ligarSeletoresDeJogador, rotuloDoJogador, prepararOpcoes } from "../src/scripts/seletor-jogador";

const jog = (id: string, nome: string, p: Partial<Jogador> = {}): Jogador => ({
  id, nome, apelido: null, genero: null, categoria: null, cidade: null, uf: null, instagram: null,
  ativo: true, criadoEm: "2026-01-01T00:00:00.000Z", atualizadoEm: "2026-01-01T00:00:00.000Z", ...p,
});

const ANA = jog("11111111-1111-4111-8111-111111111111", "Ana Lima", { apelido: "Aninha", cidade: "Santos", uf: "SP" });
const BRUNO = jog("22222222-2222-4222-8222-222222222222", "Bruno Reis");
const ALVARO = jog("33333333-3333-4333-8333-333333333333", "Álvaro Dias");

let form: HTMLFormElement;
const el = <T extends Element>(sel: string) => form.querySelector(sel) as T;
const digitar = (sel: string, texto: string) => {
  const i = el<HTMLInputElement>(sel);
  i.value = texto;
  i.dispatchEvent(new Event("input", { bubbles: true }));
};
const valores = () =>
  Array.from(document.querySelectorAll<HTMLOptionElement>("[data-jogadores-lista] option")).map((o) => o.value);
beforeEach(() => {
  document.body.innerHTML = `
    <form data-form-dupla>
      <input id="dupla-atleta-a" />
      <p data-vinculo-info></p>
      <input id="dupla-atleta-b" />
      <p data-vinculo-info></p>
      <datalist id="jogadores-opcoes" data-jogadores-lista></datalist>
    </form>`;
  form = document.querySelector("form") as HTMLFormElement;
});
describe("rotuloDoJogador", () => {
  it("nome, apelido e local ajudam a distinguir homônimos", () => {
    expect(rotuloDoJogador(ANA)).toBe("Ana Lima “Aninha” · Santos/SP");
    expect(rotuloDoJogador(BRUNO)).toBe("Bruno Reis");
    expect(rotuloDoJogador(jog("x", "Caio", { cidade: "Niterói" }))).toBe("Caio · Niterói");
  });
});
describe("prepararOpcoes", () => {
  it("ordem alfabética sem acento, valor = nome quando é único", () => {
    ligarSeletoresDeJogador(form, [BRUNO, ANA, ALVARO]);
    expect(valores()).toEqual(["Álvaro Dias", "Ana Lima", "Bruno Reis"]);
  });
  it("homônimos recebem o rótulo completo e valores nunca se repetem", () => {
    const a = jog("a1", "Caio", { cidade: "Santos", uf: "SP" });
    const b = jog("b1", "Caio", { cidade: "Niterói", uf: "RJ" });
    const c = jog("c1", "Caio", { cidade: "Santos", uf: "SP" });
    const op = prepararOpcoes(document.querySelector("datalist") as HTMLDataListElement, [a, b, c]);
    expect(new Set(op.porValor.keys()).size).toBe(3);
    expect(Array.from(op.porValor.keys())).toContain("Caio · Niterói/RJ");
  });
});
describe("ligarSeletoresDeJogador", () => {
  it("sem jogadores nada é vinculado", () => {
    const s = ligarSeletoresDeJogador(form, []);
    expect(s.disponivel).toBe(false);
    digitar("#dupla-atleta-a", "Ana Lima");
    expect(s.lerVinculos()).toEqual({ jogadorAId: null, jogadorBId: null });
    expect(s.mesmoJogador()).toBe(false);
  });
  it("liga os campos ao datalist", () => {
    ligarSeletoresDeJogador(form, [ANA]);
    expect(el<HTMLInputElement>("#dupla-atleta-a").getAttribute("list")).toBe("jogadores-opcoes");
  });
  it("texto exato de um jogador vincula e mostra o aviso", () => {
    const s = ligarSeletoresDeJogador(form, [ANA, BRUNO]);
    digitar("#dupla-atleta-a", "Ana Lima");
    expect(s.lerVinculos()).toEqual({ jogadorAId: ANA.id, jogadorBId: null });
    expect(form.querySelectorAll("[data-vinculo-info]")[0].textContent).toContain("Vinculado");
    digitar("#dupla-atleta-b", "Bruno Reis");
    expect(s.lerVinculos()).toEqual({ jogadorAId: ANA.id, jogadorBId: BRUNO.id });
  });
  it("escolher um homônimo pelo rótulo vincula e normaliza o texto para o nome", () => {
    const a = jog("a1", "Caio", { cidade: "Santos", uf: "SP" });
    const b = jog("b1", "Caio", { cidade: "Niterói", uf: "RJ" });
    const s = ligarSeletoresDeJogador(form, [a, b]);
    digitar("#dupla-atleta-a", "Caio · Niterói/RJ");
    expect(el<HTMLInputElement>("#dupla-atleta-a").value).toBe("Caio");
    expect(s.lerVinculos().jogadorAId).toBe("b1");
    digitar("#dupla-atleta-a", "Caio");
    expect(s.lerVinculos().jogadorAId).toBe("b1");
  });
  it("texto parecido, mas não exato, não vincula", () => {
    const s = ligarSeletoresDeJogador(form, [ANA]);
    digitar("#dupla-atleta-a", "Ana");
    digitar("#dupla-atleta-a", "ana lima");
    expect(s.lerVinculos().jogadorAId).toBeNull();
  });
  it("editar o nome à mão desfaz o vínculo", () => {
    const s = ligarSeletoresDeJogador(form, [ANA]);
    digitar("#dupla-atleta-a", "Ana Lima");
    digitar("#dupla-atleta-a", "Ana L.");
    expect(s.lerVinculos().jogadorAId).toBeNull();
    expect(form.querySelectorAll("[data-vinculo-info]")[0].textContent).toBe("");
  });
  it("espaços nas pontas não desfazem o vínculo", () => {
    const s = ligarSeletoresDeJogador(form, [ANA]);
    digitar("#dupla-atleta-a", "Ana Lima");
    digitar("#dupla-atleta-a", "  Ana Lima ");
    expect(s.lerVinculos().jogadorAId).toBe(ANA.id);
  });
  it("digitar num atleta não mexe no vínculo do outro", () => {
    const s = ligarSeletoresDeJogador(form, [ANA, BRUNO]);
    digitar("#dupla-atleta-a", "Ana Lima");
    digitar("#dupla-atleta-b", "Outro");
    expect(s.lerVinculos()).toEqual({ jogadorAId: ANA.id, jogadorBId: null });
  });
  it("detecta o MESMO jogador nos dois lugares", () => {
    const s = ligarSeletoresDeJogador(form, [ANA, BRUNO]);
    digitar("#dupla-atleta-a", "Ana Lima");
    digitar("#dupla-atleta-b", "Ana Lima");
    expect(s.mesmoJogador()).toBe(true);
    digitar("#dupla-atleta-b", "Bruno Reis");
    expect(s.mesmoJogador()).toBe(false);
  });
  it("limpar() solta os dois vínculos", () => {
    const s = ligarSeletoresDeJogador(form, [ANA, BRUNO]);
    digitar("#dupla-atleta-a", "Ana Lima");
    s.limpar();
    expect(s.lerVinculos()).toEqual({ jogadorAId: null, jogadorBId: null });
  });
});
