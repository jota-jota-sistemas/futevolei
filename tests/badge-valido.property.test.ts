import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { badge, MESES_CURTOS } from "../src/utils/eventos";

/**
 * Property 3: Formato do badge de data para datas válidas.
 *
 * Validates: Requirements 4.4
 *
 * Para qualquer string ISO (YYYY-MM-DD) com componentes válidos, `badge`
 * retorna um objeto não-nulo cujo `dia` tem exatamente dois dígitos e cujo
 * `mes` é a abreviação de três letras maiúsculas correspondente ao índice do
 * mês. Dias são gerados em 1..28 para evitar meses curtos — `badge` apenas
 * formata e não valida o dia dentro do mês, então 1..28 é suficiente e seguro.
 */
describe("Feature: pingo-rebrand-visual, Property 3: Formato do badge de data para datas válidas", () => {
  it("retorna dia com dois dígitos e mês abreviado correto para datas ISO válidas", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9999 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        (ano, mes, dia) => {
          const iso = `${String(ano).padStart(4, "0")}-${String(mes).padStart(
            2,
            "0"
          )}-${String(dia).padStart(2, "0")}`;

          const resultado = badge(iso);

          expect(resultado).not.toBeNull();
          expect(resultado!.dia).toMatch(/^\d{2}$/);
          expect(resultado!.dia).toBe(String(dia).padStart(2, "0"));
          expect(resultado!.mes).toBe(MESES_CURTOS[mes - 1]);
        }
      ),
      { numRuns: 100 }
    );
  });
});
