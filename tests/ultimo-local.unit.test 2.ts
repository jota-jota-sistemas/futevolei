// "Último local" (cidade/UF) lembrado entre cadastros de campeonato.
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { CHAVE_ULTIMO_LOCAL, gravarUltimoLocal, lerUltimoLocal } from "../src/scripts/ultimo-local";

function memoria(inicial?: string) {
  const dados = new Map<string, string>();
  if (inicial !== undefined) dados.set(CHAVE_ULTIMO_LOCAL, inicial);
  return {
    dados,
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, v),
  };
}

describe("gravarUltimoLocal / lerUltimoLocal", () => {
  it("grava e lê de volta (UF em maiúsculas, espaços aparados)", () => {
    const m = memoria();
    gravarUltimoLocal({ cidade: "  Santos ", uf: "sp" }, m);
    expect(lerUltimoLocal(m)).toEqual({ cidade: "Santos", uf: "SP" });
  });

  it("só cidade ou só UF também valem; vazio e nulo não gravam", () => {
    const so_cidade = memoria();
    gravarUltimoLocal({ cidade: "Guarujá", uf: null }, so_cidade);
    expect(lerUltimoLocal(so_cidade)).toEqual({ cidade: "Guarujá", uf: "" });
    const vazio = memoria();
    gravarUltimoLocal({ cidade: "  ", uf: null }, vazio);
    expect(vazio.dados.size).toBe(0);
  });

  it("valor ausente, corrompido ou fora das regras vira null (nunca lança)", () => {
    expect(lerUltimoLocal(memoria())).toBeNull();
    for (const ruim of ["{nao e json", "null", "42", '{"cidade":1,"uf":2}', '{"cidade":"","uf":""}', '{"cidade":"X","uf":"ZZ"}', JSON.stringify({ cidade: "C".repeat(81), uf: "SP" })]) {
      expect(lerUltimoLocal(memoria(ruim)), ruim).toBeNull();
    }
  });

  it("armazenamento indisponível ou que lança: ignora em silêncio", () => {
    expect(lerUltimoLocal(null)).toBeNull();
    expect(() => gravarUltimoLocal({ cidade: "Santos", uf: "SP" }, null)).not.toThrow();
    const quebrado = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("cheio");
      },
    };
    expect(lerUltimoLocal(quebrado)).toBeNull();
    expect(() => gravarUltimoLocal({ cidade: "Santos", uf: "SP" }, quebrado)).not.toThrow();
  });

  it("propriedade: o que se lê é sempre o que foi gravado, normalizado", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), fc.constantFrom("", "sp", "RJ", "Mg"), (cidade, uf) => {
        const m = memoria();
        gravarUltimoLocal({ cidade, uf }, m);
        const lido = lerUltimoLocal(m);
        if (cidade.trim() === "" && uf === "") {
          expect(lido).toBeNull();
        } else {
          expect(lido).toEqual({ cidade: cidade.trim(), uf: uf.toUpperCase() });
        }
      })
    );
  });
});
