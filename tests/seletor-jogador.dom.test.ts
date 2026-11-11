// @vitest-environment happy-dom
//
// Seletores opcionais de "jogador cadastrado" no formulário de dupla da
// organização: popular, preencher o nome, desfazer o vínculo ao editar à mão e
// ler os ids escolhidos.

import { describe, it, expect, beforeEach } from "vitest";
import type { Jogador } from "../src/domain/jogadores/types";
import { ligarSeletoresDeJogador, rotuloDoJogador } from "../src/scripts/seletor-jogador";

const jog = (id: string, nome: string, p: Partial<Jogador> = {}): Jogador => ({
  id, nome, apelido: null, genero: null, categoria: null, cidade: null, uf: null, instagram: null,
  ativo: true, criadoEm: "2026-01-01T00:00:00.000Z", atualizadoEm: "2026-01-01T00:00:00.000Z", ...p,
});

const ANA = jog("11111111-1111-4111-8111-111111111111", "Ana Lima", { apelido: "Aninha", cidade: "Santos", uf: "SP" });
const BRUNO = jog("22222222-2222-4222-8222-222222222222", "Bruno Reis");
const ALVARO = jog("33333333-3333-4333-8333-333333333333", "Álvaro Dias");

let form: HTMLFormElement;
const el = <T extends Element>(sel: string) => form.querySelector(sel) as T;
const escolher = (sel: string, valor: string) => {
  const s = el<HTMLSelectElement>(sel);
  s.value = valor;
  s.dispatchEvent(new Event("change", { bubbles: true }));
};
const digitar = (sel: string, texto: string) => {
  const i = el<HTMLInputElement>(sel);
  i.value = texto;
  i.dispatchEvent(new Event("input", { bubbles: true }));
};
const opcoes = (sel: string) => Array.from(el<HTMLSelectElement>(sel).options).map((o) => o.textContent);

beforeEach(() => {
  document.body.innerHTML = `
    <form data-form-dupla>
      <input id="dupla-atleta-a" />
      <div data-vinculo hidden><select data-jogador-a><option value="">Não vincular</option></select></div>
      <input id="dupla-atleta-b" />
      <div data-vinculo hidden><select data-jogador-b><option value="">Não vincular</option></select></div>
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

describe("ligarSeletoresDeJogador", () => {
  it("popula os dois seletores em ordem alfabética (sem acento) e mostra os blocos", () => {
    ligarSeletoresDeJogador(form, [BRUNO, ANA, ALVARO]);
    expect(opcoes("[data-jogador-a]")).toEqual(["Não vincular", "Álvaro Dias", "Ana Lima “Aninha” · Santos/SP", "Bruno Reis"]);
    expect(opcoes("[data-jogador-b]")).toEqual(opcoes("[data-jogador-a]"));
    expect(Array.from(form.querySelectorAll<HTMLElement>("[data-vinculo]")).every((b) => !b.hidden)).toBe(true);
  });

  it("sem jogadores, os blocos continuam ocultos e nada é vinculado", () => {
    const s = ligarSeletoresDeJogador(form, []);
    expect(Array.from(form.querySelectorAll<HTMLElement>("[data-vinculo]")).every((b) => b.hidden)).toBe(true);
    expect(s.lerVinculos()).toEqual({ jogadorAId: null, jogadorBId: null });
    expect(s.mesmoJogador()).toBe(false);
  });

  it("escolher um jogador preenche o nome do atleta com o do cadastro", () => {
    const s = ligarSeletoresDeJogador(form, [ANA, BRUNO]);
    escolher("[data-jogador-a]", ANA.id);
    expect(el<HTMLInputElement>("#dupla-atleta-a").value).toBe("Ana Lima");
    expect(s.lerVinculos()).toEqual({ jogadorAId: ANA.id, jogadorBId: null });
    escolher("[data-jogador-b]", BRUNO.id);
    expect(el<HTMLInputElement>("#dupla-atleta-b").value).toBe("Bruno Reis");
    expect(s.lerVinculos()).toEqual({ jogadorAId: ANA.id, jogadorBId: BRUNO.id });
  });

  it("editar o nome à mão desfaz o vínculo (não liga o perfil a um nome diferente)", () => {
    const s = ligarSeletoresDeJogador(form, [ANA]);
    escolher("[data-jogador-a]", ANA.id);
    digitar("#dupla-atleta-a", "Ana L.");
    expect(el<HTMLSelectElement>("[data-jogador-a]").value).toBe("");
    expect(s.lerVinculos().jogadorAId).toBeNull();
  });

  it("espaços nas pontas não desfazem o vínculo; o mesmo texto também não", () => {
    const s = ligarSeletoresDeJogador(form, [ANA]);
    escolher("[data-jogador-a]", ANA.id);
    digitar("#dupla-atleta-a", "  Ana Lima ");
    expect(s.lerVinculos().jogadorAId).toBe(ANA.id);
    digitar("#dupla-atleta-a", "Ana Lima");
    expect(s.lerVinculos().jogadorAId).toBe(ANA.id);
  });

  it("digitar num atleta não mexe no vínculo do outro", () => {
    const s = ligarSeletoresDeJogador(form, [ANA, BRUNO]);
    escolher("[data-jogador-a]", ANA.id);
    escolher("[data-jogador-b]", BRUNO.id);
    digitar("#dupla-atleta-b", "Outro");
    expect(s.lerVinculos()).toEqual({ jogadorAId: ANA.id, jogadorBId: null });
  });

  it("detecta o MESMO jogador nos dois lugares", () => {
    const s = ligarSeletoresDeJogador(form, [ANA, BRUNO]);
    escolher("[data-jogador-a]", ANA.id);
    escolher("[data-jogador-b]", ANA.id);
    expect(s.mesmoJogador()).toBe(true);
    escolher("[data-jogador-b]", BRUNO.id);
    expect(s.mesmoJogador()).toBe(false);
  });

  it("voltar para 'Não vincular' mantém o texto digitado e solta o vínculo", () => {
    const s = ligarSeletoresDeJogador(form, [ANA]);
    escolher("[data-jogador-a]", ANA.id);
    escolher("[data-jogador-a]", "");
    expect(el<HTMLInputElement>("#dupla-atleta-a").value).toBe("Ana Lima");
    expect(s.lerVinculos().jogadorAId).toBeNull();
  });

  it("valor que não é de um jogador conhecido nunca vira vínculo", () => {
    const s = ligarSeletoresDeJogador(form, [ANA]);
    const select = el<HTMLSelectElement>("[data-jogador-a]");
    const intruso = document.createElement("option");
    intruso.value = "99999999-9999-4999-8999-999999999999";
    intruso.textContent = "intruso";
    select.append(intruso);
    select.value = "99999999-9999-4999-8999-999999999999";
    expect(s.lerVinculos().jogadorAId).toBeNull();
  });
});
