import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { comBase } from "../src/utils/url";

/**
 * Property 5: Destino do CTA "Ver evento".
 *
 * Validates: Requirements 4.6
 *
 * O `EventCard` monta o href do CTA "Ver evento" como
 * `comBase(`/campeonatos/${id}`)`. Para qualquer id, o href resultante deve
 * ser exatamente o valor produzido por `comBase` para o caminho
 * `/campeonatos/{id}`, respeitando o `base` configurado (import.meta.env.BASE_URL).
 *
 * A expectativa é reconstruída de forma independente a partir de
 * `import.meta.env.BASE_URL` usando a MESMA regra da função (base termina com
 * barra -> concatena o caminho sem a barra inicial), de modo que a igualdade
 * vale qualquer que seja o valor real de BASE_URL no ambiente. Lemos com
 * fallback "/" por segurança caso o ambiente de teste não defina a base.
 */
describe('Feature: pingo-rebrand-visual, Property 5: Destino do CTA "Ver evento"', () => {
  // Mesma base que `comBase` lê internamente; fallback "/" por robustez.
  const base: string = import.meta.env.BASE_URL ?? "/";

  /** Reconstrói o href esperado replicando a lógica de `comBase`. */
  function hrefEsperado(id: string): string {
    const caminho = `/campeonatos/${id}`;
    const limpo = caminho.replace(/^\//, "");
    return base.endsWith("/") ? base + limpo : base + "/" + limpo;
  }

  it("href do CTA é igual a comBase(`/campeonatos/${id}`) para ids variados", () => {
    fc.assert(
      fc.property(
        // Gera ids variados: strings arbitrárias (inclui caracteres especiais),
        // slugs comuns, numéricos e a string vazia como edge case.
        fc.oneof(
          fc.string(),
          fc.webSegment(),
          fc.integer({ min: 0, max: 999999 }).map(String),
          fc.constant("")
        ),
        (id) => {
          const href = comBase(`/campeonatos/${id}`);

          // Igualdade exata com a expectativa reconstruída de forma independente.
          expect(href).toBe(hrefEsperado(id));

          // Invariantes complementares que o destino do CTA deve satisfazer.
          expect(href.startsWith(base)).toBe(true);
          expect(href).toContain(`campeonatos/${id}`);
          // Sem barra dupla na junção entre a base e o caminho.
          expect(href.startsWith("//")).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
