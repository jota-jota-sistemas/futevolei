import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Feature: criar-chaveamento-campeonato — Teste de fronteira de módulo (R9).
 *
 * Validates: Requirements 9.1, 9.2
 *
 * ## O que este teste garante
 *
 * A feature separa, conceitualmente, OPERAÇÕES DE ORGANIZAÇÃO (escrita) de
 * VISUALIZAÇÃO PÚBLICA (somente leitura). O `Bracket_Store`
 * (`src/store/bracketStore.ts`) concentra todo o I/O e expõe:
 *   - LEITURA:  `carregarChaveamento` (também `listarDuplas`), usada pela
 *     visualização pública;
 *   - ESCRITA:  `adicionarDupla`, `removerDupla`, `salvarConfig`,
 *     `salvarSeeding`, `salvarChaveamento`, usadas apenas pela organização.
 *
 * O caminho de visualização pública é:
 *   1. o helper client-side de render `src/components/bracket/renderBracketClient.ts`;
 *   2. a página pública `src/pages/campeonatos/[id]/acompanhar.astro`.
 *
 * R9.2 exige que o Visitante só execute leitura. Então garantimos, por ANÁLISE
 * ESTÁTICA DE FONTE (sem depender de rodar o navegador), que:
 *   a) o módulo de render NÃO referencia nenhuma operação de escrita do store
 *      nem importa `criarBracketStoreBrowser`, nem o cliente admin
 *      (`supabase.server`), e só depende de domínio puro (types/standings);
 *   b) a página pública usa apenas `carregarChaveamento` (leitura) e NUNCA
 *      nenhuma das operações de escrita do store.
 *
 * Esta é a abordagem mais robusta e simples aqui: os artefatos de UI são Astro
 * pré-renderados + script client-side, difíceis de instanciar em unit test, mas
 * a FRONTEIRA que importa (quais operações o caminho público aciona) é textual
 * e verificável de forma determinística lendo os arquivos-fonte.
 */

const aquiDir = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aquiDir, "..");

function lerFonte(caminhoRelativo: string): string {
  return readFileSync(resolve(raiz, caminhoRelativo), "utf8");
}

// Operações de ESCRITA do Bracket_Store (organização). Nenhuma delas pode
// aparecer no caminho de visualização pública.
const OPERACOES_DE_ESCRITA = [
  "adicionarDupla",
  "removerDupla",
  "salvarConfig",
  "salvarSeeding",
  "salvarChaveamento",
] as const;

// Operação de LEITURA que a visualização pública tem permissão de usar.
const OPERACAO_DE_LEITURA = "carregarChaveamento";

describe("Feature: criar-chaveamento-campeonato — fronteira organização × visualização (R9.1, R9.2)", () => {
  describe("helper de render client-side (renderBracketClient.ts)", () => {
    const fonteRender = lerFonte(
      "src/components/bracket/renderBracketClient.ts",
    );

    it("não referencia nenhuma operação de escrita do Bracket_Store (R9.2)", () => {
      for (const op of OPERACOES_DE_ESCRITA) {
        expect(
          fonteRender.includes(op),
          `renderBracketClient.ts não deve referenciar a operação de escrita "${op}"`,
        ).toBe(false);
      }
    });

    it("não importa a fábrica do store (criarBracketStoreBrowser) — é puro em relação a I/O (R9.2)", () => {
      expect(fonteRender.includes("criarBracketStoreBrowser")).toBe(false);
      expect(fonteRender.includes("store/bracketStore")).toBe(false);
    });

    it("não importa o cliente admin de servidor (supabase.server) (R9.1, R9.2)", () => {
      expect(fonteRender.includes("supabase.server")).toBe(false);
      expect(fonteRender.includes("supabaseAdmin")).toBe(false);
    });

    it("não importa nada de src/store/* nem do cliente supabase (só domínio puro)", () => {
      // Extrai os specifiers de todos os `import ... from "..."`.
      const specifiers = [...fonteRender.matchAll(/from\s+["']([^"']+)["']/g)].map(
        (m) => m[1],
      );
      expect(specifiers.length).toBeGreaterThan(0);

      for (const spec of specifiers) {
        expect(
          spec.includes("/store/"),
          `renderBracketClient.ts não deve importar de src/store (achou "${spec}")`,
        ).toBe(false);
        expect(
          /(^|\/)lib\/supabase(\.server)?$/.test(spec) ||
            spec.endsWith("lib/supabase"),
          `renderBracketClient.ts não deve importar um cliente supabase (achou "${spec}")`,
        ).toBe(false);
      }
    });

    it("depende apenas de domínio puro (bracket e rótulo de dupla)", () => {
      const specifiers = [...fonteRender.matchAll(/from\s+["']([^"']+)["']/g)].map(
        (m) => m[1],
      );
      // Todo import não-tipo-nativo deve apontar para o domínio de bracket.
      for (const spec of specifiers) {
        expect(
          spec.includes("domain/bracket/") || spec.includes("domain/pairs/nome"),
          `import inesperado em renderBracketClient.ts: "${spec}" (esperado apenas domain puro: bracket/* ou pairs/nome)`,
        ).toBe(true);
      }
    });
  });

  describe("página pública do campeonato (campeonatos/[id]/acompanhar.astro)", () => {
    const fontePagina = lerFonte("src/pages/campeonatos/[id]/acompanhar.astro");

    it("usa a operação de leitura carregarChaveamento (R9.2)", () => {
      expect(fontePagina.includes(OPERACAO_DE_LEITURA)).toBe(true);
    });

    it("não aciona nenhuma operação de escrita do Bracket_Store (R9.1, R9.2)", () => {
      for (const op of OPERACOES_DE_ESCRITA) {
        expect(
          fontePagina.includes(op),
          `a página pública não deve acionar a operação de escrita "${op}"`,
        ).toBe(false);
      }
    });

    it("não importa o cliente admin de servidor (supabase.server) (R9.1)", () => {
      expect(fontePagina.includes("supabase.server")).toBe(false);
      expect(fontePagina.includes("supabaseAdmin")).toBe(false);
    });
  });
});
