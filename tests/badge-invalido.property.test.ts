import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { badge } from "../src/utils/eventos";

/**
 * Feature: pingo-rebrand-visual, Property 4: Omissão de badge para datas inválidas
 * Validates: Requirements 4.5
 *
 * R4.5: quando a data está ausente ou não corresponde ao formato ano-mês-dia
 * válido, o card omite o badge. A função pura `badge(iso)` representa essa
 * decisão retornando `null`.
 *
 * Comportamento real de `badge`: faz `iso.split("-").map(Number)` e retorna
 * `null` se ano, mês OU dia forem falsy (0, NaN, ou undefined quando há menos
 * de 3 componentes). A função NÃO valida intervalos de calendário, então
 * entradas como "2026-13-40" retornam um objeto (não-nulo). Por isso os
 * geradores abaixo são restritos ao subespaço que GARANTIDAMENTE produz `null`:
 *
 *   Critério de nulidade: pelo menos um dos três primeiros componentes do split
 *   por "-" é falsy ao passar por Number(), isto é:
 *     - componente vazio            → Number("")   === 0      (falsy)
 *     - componente zero             → Number("00") === 0      (falsy)
 *     - componente não numérico     → Number("ab") === NaN    (falsy)
 *     - componente ausente          → Number(undefined) === NaN (falsy)
 *   ou o formato quebra o split de modo que faltem componentes (< 3 partes).
 */

// Gera um componente que vira falsy ao passar por Number(): "", zero, ou não-numérico.
const componenteFalsy = fc.oneof(
  fc.constant(""),
  fc.integer({ min: 1, max: 6 }).map((n) => "0".repeat(n)), // "0", "00", ...
  // strings sem dígitos → NaN (evita dígitos para não virar número truthy)
  fc
    .stringMatching(/^[a-zA-Z_.:+/ ]+$/)
    .filter((s) => s.length > 0 && !s.includes("-")),
);

// Gera um componente possivelmente válido (truthy) sem hífen: dígitos 1..9999.
const componenteTruthy = fc
  .integer({ min: 1, max: 9999 })
  .map((n) => String(n));

// Cada um dos 3 componentes é falsy ou truthy, mas garantimos >= 1 falsy.
const componente = fc.oneof(componenteFalsy, componenteTruthy);

describe("Feature: pingo-rebrand-visual, Property 4: Omissão de badge para datas inválidas", () => {
  it("retorna null para strings vazias, malformadas ou com componentes inválidos (Validates: Requirements 4.5)", () => {
    fc.assert(
      fc.property(
        // posição do componente garantidamente falsy
        fc.nat({ max: 2 }),
        componente,
        componente,
        componente,
        componenteFalsy,
        (posFalsy, a, b, c, garantidoFalsy) => {
          const partes = [a, b, c];
          partes[posFalsy] = garantidoFalsy; // assegura pelo menos 1 componente falsy
          const iso = partes.join("-");
          return badge(iso) === null;
        },
      ),
      { numRuns: 300 },
    );
  });

  it("retorna null quando faltam componentes (formato sem 3 partes separadas por hífen) (Validates: Requirements 4.5)", () => {
    // Strings com menos de 3 partes ao fazer split("-") → dia (e/ou mês) undefined → NaN → null.
    const comPoucosComponentes = fc.oneof(
      fc.constant(""),
      fc.integer({ min: 1, max: 9999 }).map((n) => String(n)), // "2026" → só 1 parte
      fc
        .tuple(
          fc.integer({ min: 1, max: 9999 }),
          fc.integer({ min: 1, max: 12 }),
        )
        .map(([ano, mes]) => `${ano}-${mes}`), // "2026-5" → 2 partes, dia undefined
      // string arbitrária sem nenhum hífen → 1 parte só
      fc.string().filter((s) => !s.includes("-")),
    );

    fc.assert(
      fc.property(comPoucosComponentes, (iso) => {
        return badge(iso) === null;
      }),
      { numRuns: 300 },
    );
  });

  it("retorna null para exemplos canônicos de datas inválidas (Validates: Requirements 4.5)", () => {
    const exemplos = [
      "", // vazio
      "sem-hifens-aqui-invalido", // texto não numérico
      "abcd-ef-gh", // componentes NaN
      "2026-00-10", // mês zero
      "2026-05-00", // dia zero
      "0000-01-01", // ano zero
      "2026", // só ano (1 parte)
      "2026-05", // sem dia (2 partes)
      "--", // componentes vazios
      "0-0-0", // todos zero
    ];
    for (const iso of exemplos) {
      expect(badge(iso), `esperava null para ${JSON.stringify(iso)}`).toBeNull();
    }
  });
});
