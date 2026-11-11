// tests/dupla-vinculo-jogador.unit.test.ts
//
// Vínculo OPCIONAL da dupla com jogadores cadastrados em
// `criarBracketStoreBrowser(...).adicionarDupla`. O comportamento sem vínculo
// precisa continuar idêntico ao de antes (payload sem as colunas novas).

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { criarBracketStoreBrowser } from "../src/store/bracketStore";

const REF = { campeonatoId: "copa", categoriaId: "11111111-1111-4111-8111-111111111111" };
const BASE = { nomeDupla: "Ana & Bia 2026-01-01T00:00:00.000Z", atletaA: "Ana", atletaB: "Bia" };
const J1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const J2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/** Cliente simulado: lista de nomes existentes (select) e captura do insert. */
function mock(opts: { erroInsert?: boolean } = {}) {
  const inseridos: Record<string, unknown>[] = [];
  const client = {
    from() {
      let op = "select";
      const b: Record<string, unknown> = {
        select: () => { op = "select"; return b; },
        insert: (row: Record<string, unknown>) => { op = "insert"; inseridos.push(row); return b; },
        eq: () => b,
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(
            op === "insert"
              ? { error: opts.erroInsert ? { message: "boom" } : null }
              : { data: [], error: null }
          ).then(res, rej),
      };
      return b;
    },
  } as unknown as SupabaseClient;
  return { client, inseridos };
}

describe("adicionarDupla com vínculo a jogadores", () => {
  it("sem vínculo: o payload NÃO ganha as colunas novas (igual ao comportamento anterior)", async () => {
    const { client, inseridos } = mock();
    const r = await criarBracketStoreBrowser(client).adicionarDupla(REF, BASE);
    expect(r.ok).toBe(true);
    expect(Object.keys(inseridos[0]).sort()).toEqual(
      ["atleta_a", "atleta_b", "categoria_id", "criado_em", "id", "nome_dupla", "seed"]
    );
  });

  it("com os dois vínculos: grava jogador_a_id e jogador_b_id", async () => {
    const { client, inseridos } = mock();
    const r = await criarBracketStoreBrowser(client).adicionarDupla(REF, { ...BASE, jogadorAId: J1, jogadorBId: J2 });
    expect(r.ok).toBe(true);
    expect(inseridos[0]).toMatchObject({ atleta_a: "Ana", atleta_b: "Bia", jogador_a_id: J1, jogador_b_id: J2 });
  });

  it("só um lado vinculado: grava apenas esse lado", async () => {
    const { client, inseridos } = mock();
    await criarBracketStoreBrowser(client).adicionarDupla(REF, { ...BASE, jogadorAId: J1, jogadorBId: null });
    expect(inseridos[0].jogador_a_id).toBe(J1);
    expect("jogador_b_id" in inseridos[0]).toBe(false);
  });

  it("ids que não são UUID são ignorados (nunca chegam ao banco)", async () => {
    const { client, inseridos } = mock();
    await criarBracketStoreBrowser(client).adicionarDupla(REF, { ...BASE, jogadorAId: "abc", jogadorBId: "x'; drop table duplas;--" });
    expect("jogador_a_id" in inseridos[0]).toBe(false);
    expect("jogador_b_id" in inseridos[0]).toBe(false);
  });

  it("o MESMO jogador nos dois lugares é rejeitado e nada é gravado", async () => {
    const { client, inseridos } = mock();
    const r = await criarBracketStoreBrowser(client).adicionarDupla(REF, { ...BASE, jogadorAId: J1, jogadorBId: J1 });
    expect(r).toEqual({ ok: false, erro: { code: "NOME_ATLETA_INVALIDO", qual: "B" } });
    expect(inseridos).toHaveLength(0);
  });

  it("a dupla devolvida (domínio) não carrega os ids de jogador", async () => {
    const { client } = mock();
    const r = await criarBracketStoreBrowser(client).adicionarDupla(REF, { ...BASE, jogadorAId: J1, jogadorBId: J2 });
    expect(r.ok && Object.keys(r.valor).sort()).toEqual(["atletaA", "atletaB", "criadoEm", "id", "nomeDupla", "seed"]);
  });

  it("a validação de nomes continua valendo antes do vínculo", async () => {
    const { client, inseridos } = mock();
    const r = await criarBracketStoreBrowser(client).adicionarDupla(REF, { ...BASE, atletaA: "  ", jogadorAId: J1 });
    expect(r.ok).toBe(false);
    expect(inseridos).toHaveLength(0);
  });

  it("falha de escrita continua sendo FALHA_PERSISTENCIA", async () => {
    const { client } = mock({ erroInsert: true });
    const r = await criarBracketStoreBrowser(client).adicionarDupla(REF, { ...BASE, jogadorAId: J1 });
    expect(r).toEqual({ ok: false, erro: { code: "FALHA_PERSISTENCIA" } });
  });
});
