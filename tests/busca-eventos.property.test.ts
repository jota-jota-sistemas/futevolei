import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { correspondeBusca } from "../src/utils/eventos";

const evento = { nome: "Copa Pingo de Verão", local: "Praia Grande - SP" };

describe("correspondeBusca", () => {
  it("consulta vazia ou só com espaços casa tudo", () => {
    expect(correspondeBusca(evento, "")).toBe(true);
    expect(correspondeBusca(evento, "   ")).toBe(true);
  });

  it("ignora caixa e acentos", () => {
    expect(correspondeBusca(evento, "VERAO")).toBe(true);
    expect(correspondeBusca(evento, "verão")).toBe(true);
  });

  it("casa por nome ou por local", () => {
    expect(correspondeBusca(evento, "copa")).toBe(true);
    expect(correspondeBusca(evento, "praia grande")).toBe(true);
  });

  it("palavras em qualquer ordem, todas obrigatórias", () => {
    expect(correspondeBusca(evento, "sp copa")).toBe(true);
    expect(correspondeBusca(evento, "copa rio")).toBe(false);
  });

  it("não casa campos fora de nome e local", () => {
    expect(correspondeBusca({ ...evento, descricao: "areia" } as never, "areia")).toBe(false);
  });

  it("espaços extras na consulta não atrapalham", () => {
    expect(correspondeBusca(evento, "  copa    pingo ")).toBe(true);
  });

  it("qualquer trecho do nome sempre casa", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Zà-ú ]{3,30}$/),
        fc.nat(10),
        fc.nat(10),
        (nome, i, n) => {
          const trecho = nome.slice(i, i + n + 1);
          return correspondeBusca({ nome, local: "" }, trecho);
        }
      )
    );
  });
});
