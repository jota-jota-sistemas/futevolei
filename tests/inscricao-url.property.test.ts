import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { inscricaoUrl } from "../src/utils/url";

/**
 * Feature: finalizacao-eventos, Property: Normalização do link de inscrição.
 *
 * Validates: campo opcional `inscricao` da página de detalhe.
 *
 * `inscricaoUrl` só aceita URLs completas http/https (preservando-as, após
 * trim); qualquer outro valor — vazio, só espaços, ou sem o esquema http(s) —
 * retorna null, mantendo o botão "Inscreva-se" oculto. A função é pura e não
 * inventa esquema nem domínio.
 */
describe("Feature: finalizacao-eventos, Property: inscricaoUrl normaliza só http/https", () => {
  it("vazio, undefined ou só espaços ⇒ null", () => {
    expect(inscricaoUrl(undefined)).toBeNull();
    expect(inscricaoUrl("")).toBeNull();
    fc.assert(
      fc.property(fc.stringOf(fc.constantFrom(" ", "\t", "\n")), (espacos) => {
        expect(inscricaoUrl(espacos)).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it("URL http/https ⇒ preservada (após trim)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("http", "https", "HTTP", "HTTPS", "HttpS"),
        fc.webSegment(),
        fc.stringOf(fc.constantFrom(" ", "\t"), { maxLength: 3 }),
        fc.stringOf(fc.constantFrom(" ", "\t"), { maxLength: 3 }),
        (esquema, seg, antes, depois) => {
          const url = `${esquema}://exemplo.com/${seg}`;
          // Espaços ao redor são removidos; o miolo é preservado sem alteração.
          expect(inscricaoUrl(`${antes}${url}${depois}`)).toBe(url);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("valor sem esquema http/https ⇒ null (não inventa esquema)", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.webSegment().map((s) => `exemplo.com/${s}`),
          fc.webSegment().map((s) => `www.exemplo.com/${s}`),
          fc.constantFrom(
            "ftp://exemplo.com",
            "exemplo.com",
            "@perfil",
            "/caminho/relativo",
            "javascript:alert(1)",
            "mailto:a@b.com"
          )
        ),
        (valor) => {
          expect(inscricaoUrl(valor)).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
