import { describe, it, expect } from "vitest";
import { rotuloDupla, gerarNomeDupla } from "../src/domain/pairs/nome";
import { validarNomeDupla } from "../src/domain/pairs/validation";

describe("nome da dupla", () => {
  it("rótulo exibido é 'Atleta A & Atleta B'", () => {
    expect(rotuloDupla({ atletaA: " Ana ", atletaB: "Bia" })).toBe("Ana & Bia");
  });

  it("nome gerado concatena atletas e timestamp do cadastro", () => {
    expect(gerarNomeDupla("Ana", "Bia", "2026-01-01T10:00:00.000Z")).toBe(
      "Ana & Bia 2026-01-01T10:00:00.000Z",
    );
  });

  it("sempre cabe no limite de 80 caracteres, mesmo com atletas longos", () => {
    const longo = "x".repeat(80);
    const nome = gerarNomeDupla(longo, longo, new Date().toISOString());
    expect(nome.length).toBeLessThanOrEqual(80);
    expect(validarNomeDupla(nome).ok).toBe(true);
  });

  it("horários diferentes geram nomes diferentes para os mesmos atletas", () => {
    expect(gerarNomeDupla("Ana", "Bia", "2026-01-01T10:00:00.000Z")).not.toBe(
      gerarNomeDupla("Ana", "Bia", "2026-01-01T10:00:00.001Z"),
    );
  });
});
