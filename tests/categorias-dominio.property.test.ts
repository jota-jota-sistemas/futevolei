// tests/categorias-dominio.property.test.ts
//
// Domínio das categorias: validação, gerador Gênero × Nível e mescla (puro).

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  NIVEIS_DE_CATEGORIA,
  gerarNomesPorGeneroNivel,
  mesclarCategorias,
  normalizarNomeCategoria,
  validarNomeCategoria,
} from "../src/domain/categorias/validation";
import { mensagemDoErro } from "../src/domain/categorias/mensagens";
import type { CategoriaErro } from "../src/domain/categorias/types";
import { GENEROS, classificarCategoria } from "../src/utils/categorias";
import { slugCategoria } from "../src/utils/url";

describe("validarNomeCategoria", () => {
  it("normaliza espaços e aceita 1..60 caracteres com slug", () => {
    expect(validarNomeCategoria("  Feminino   Iniciante ")).toEqual({ ok: true, valor: "Feminino Iniciante" });
    expect(validarNomeCategoria("A".repeat(60)).ok).toBe(true);
  });

  it("recusa vazio, só espaços, mais de 60 e só símbolos (sem slug, a rota não existiria)", () => {
    for (const ruim of ["", "   ", "A".repeat(61), "###", "—"]) {
      expect(validarNomeCategoria(ruim), ruim).toEqual({ ok: false, erro: { code: "NOME_INVALIDO" } });
    }
  });

  it("propriedade: todo nome válido tem slug não vazio e é idempotente", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 80 }), (nome) => {
        const r = validarNomeCategoria(nome);
        if (!r.ok) return;
        expect(slugCategoria(r.valor)).not.toBe("");
        expect(r.valor.length).toBeLessThanOrEqual(60);
        expect(validarNomeCategoria(r.valor)).toEqual(r);
        expect(normalizarNomeCategoria(r.valor)).toBe(r.valor);
      })
    );
  });
});

describe("gerarNomesPorGeneroNivel", () => {
  it("produto na ordem recebida (gênero e depois nível)", () => {
    expect(gerarNomesPorGeneroNivel(["Masculino", "Feminino"], ["Iniciante", "Open"])).toEqual([
      "Masculino Iniciante",
      "Masculino Open",
      "Feminino Iniciante",
      "Feminino Open",
    ]);
  });

  it("ignora valores fora dos vocabulários (inclusive 'Outros') e repetidos; vazio gera nada", () => {
    expect(gerarNomesPorGeneroNivel(["Masculino", "Masculino", "Alien"], ["Open", "Outros", "Open"])).toEqual([
      "Masculino Open",
    ]);
    expect(gerarNomesPorGeneroNivel([], ["Open"])).toEqual([]);
    expect(gerarNomesPorGeneroNivel(["Misto"], [])).toEqual([]);
  });

  it("não muta as entradas", () => {
    const generos = ["Feminino", "Masculino"];
    const niveis = ["Open"];
    gerarNomesPorGeneroNivel(generos, niveis);
    expect(generos).toEqual(["Feminino", "Masculino"]);
    expect(niveis).toEqual(["Open"]);
  });

  it("cada nome gerado classifica de volta no mesmo gênero e nível (o filtro público continua casando)", () => {
    for (const g of GENEROS) {
      for (const n of NIVEIS_DE_CATEGORIA) {
        const [nome] = gerarNomesPorGeneroNivel([g], [n]);
        expect(nome).toBe(`${g} ${n}`);
        const c = classificarCategoria(nome);
        expect({ nome, genero: c.genero, nivel: c.nivel }).toEqual({ nome, genero: g, nivel: n });
      }
    }
  });

  it("propriedade: o tamanho é |gêneros| × |níveis| (sem repetição) e os nomes são únicos e válidos", () => {
    fc.assert(
      fc.property(
        fc.subarray([...GENEROS]),
        fc.subarray([...NIVEIS_DE_CATEGORIA]),
        (generos, niveis) => {
          const nomes = gerarNomesPorGeneroNivel(generos, niveis);
          expect(nomes).toHaveLength(generos.length * niveis.length);
          expect(new Set(nomes).size).toBe(nomes.length);
          for (const n of nomes) expect(validarNomeCategoria(n).ok).toBe(true);
        }
      )
    );
  });
});

describe("mesclarCategorias", () => {
  it("separa o que criar, o que já existe e o que é inválido (ordem preservada)", () => {
    const r = mesclarCategorias(["Open", "Feminino Iniciante"], ["  open ", "Masculino Open", "###", "feminino iniciante", "Misto  Open"]);
    expect(r).toEqual({
      adicionar: ["Masculino Open", "Misto Open"],
      repetidas: ["open", "feminino iniciante"],
      invalidas: ["###"],
    });
  });

  it("repetidas por SLUG também contam (a rota disputaria o mesmo endereço)", () => {
    // "Amador B+C" e "Amador B C" têm o mesmo slug.
    const r = mesclarCategorias(["Amador B+C"], ["Amador B C", "Amador-B-C"]);
    expect(r.adicionar).toEqual([]);
    expect(r.repetidas).toHaveLength(2);
  });

  it("repetição dentro da própria lista: só a primeira entra", () => {
    const r = mesclarCategorias([], ["Open", "OPEN", "Ópen", "Master"]);
    expect(r.adicionar).toEqual(["Open", "Master"]);
    expect(r.repetidas).toEqual(["OPEN", "Ópen"]);
  });

  it("propriedade: partição completa, sem criar nada que já exista e idempotente", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ maxLength: 20 }), { maxLength: 6 }),
        fc.array(fc.string({ maxLength: 20 }), { maxLength: 8 }),
        (existentes, novos) => {
          const exCopia = [...existentes];
          const r = mesclarCategorias(existentes, novos);
          expect(existentes).toEqual(exCopia);
          expect(r.adicionar.length + r.repetidas.length + r.invalidas.length).toBe(novos.length);
          const slugsAdd = r.adicionar.map((n) => slugCategoria(n));
          expect(new Set(slugsAdd).size).toBe(slugsAdd.length);
          for (const e of existentes) expect(slugsAdd).not.toContain(slugCategoria(normalizarNomeCategoria(e)) || "\u0000");
          // Aplicar de novo o que foi adicionado não cria nada.
          const depois = mesclarCategorias([...existentes, ...r.adicionar], r.adicionar);
          expect(depois.adicionar).toEqual([]);
        }
      )
    );
  });
});

describe("mensagens", () => {
  it("todo erro tem mensagem em pt-BR", () => {
    const codigos: CategoriaErro["code"][] = [
      "NOME_INVALIDO", "CATEGORIA_NAO_ENCONTRADA", "TEM_DUPLAS", "SEM_PERMISSAO", "FALHA_PERSISTENCIA", "FALHA_LEITURA",
    ];
    for (const code of codigos) expect(mensagemDoErro({ code } as CategoriaErro).length).toBeGreaterThan(10);
  });
});
