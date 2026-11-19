// tests/posse-evento.unit.test.ts
//
// Verificação de posse de um evento para a guarda: admin sempre; organizador só
// se o banco disser que é dono.

import { describe, it, expect, vi } from "vitest";
import { verificarPosseDoEvento } from "../src/scripts/posse-evento";
import type { CampeonatoStore } from "../src/store/campeonatoStore";

function storeCom(resposta: unknown) {
  const podeGerenciar = vi.fn(async () => resposta);
  return { store: { podeGerenciar } as unknown as CampeonatoStore, podeGerenciar };
}

describe("verificarPosseDoEvento", () => {
  it("admin é liberado sem consultar o banco", async () => {
    const { store, podeGerenciar } = storeCom({ ok: true, valor: false });
    expect(await verificarPosseDoEvento(store, "copa-2026")("admin")).toBe(true);
    expect(podeGerenciar).not.toHaveBeenCalled();
  });

  it("organizador dono: true; sem posse: false (a decisão é do banco)", async () => {
    const dono = storeCom({ ok: true, valor: true });
    expect(await verificarPosseDoEvento(dono.store, "copa-2026")("organizador")).toBe(true);
    expect(dono.podeGerenciar).toHaveBeenCalledWith("copa-2026");

    const alheio = storeCom({ ok: true, valor: false });
    expect(await verificarPosseDoEvento(alheio.store, "outra-2026")("organizador")).toBe(false);
  });

  it("organizador sem id do evento: false, sem consultar", async () => {
    const { store, podeGerenciar } = storeCom({ ok: true, valor: true });
    expect(await verificarPosseDoEvento(store, undefined)("organizador")).toBe(false);
    expect(await verificarPosseDoEvento(store, "")("organizador")).toBe(false);
    expect(podeGerenciar).not.toHaveBeenCalled();
  });

  it("falha ao consultar o banco: devolve a mensagem de erro (nunca libera)", async () => {
    const { store } = storeCom({ ok: false, erro: { code: "FALHA_LEITURA" } });
    const r = await verificarPosseDoEvento(store, "copa-2026")("organizador");
    expect(typeof r).toBe("string");
    expect(r).toContain("Não foi possível carregar");
  });
});
