// @vitest-environment happy-dom
//
// Guarda das telas de gerenciamento: visitante, logado sem permissão e admin.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { guardarAcesso } from "../src/scripts/guarda";
import type { AuthStore } from "../src/store/authStore";

function montar() {
  document.body.innerHTML = `
    <div data-guarda>
      <p data-guarda-status>Verificando acesso…</p>
      <div data-guarda-negado hidden>Acesso restrito</div>
      <div data-protegido hidden><button id="acao">Gerenciar</button></div>
    </div>`;
}
const protegido = () => document.querySelector<HTMLElement>("[data-protegido]")!;
const negado = () => document.querySelector<HTMLElement>("[data-guarda-negado]")!;
const status = () => document.querySelector<HTMLElement>("[data-guarda-status]")!;

function storeFalsa(o: { sessao?: boolean; admin?: boolean; erroSessao?: boolean; erroAdmin?: boolean }) {
  const ouvintes: Array<(s: unknown) => void> = [];
  const store = {
    sessaoAtual: vi.fn(async () =>
      o.erroSessao
        ? { ok: false, erro: { code: "FALHA_REDE" } }
        : { ok: true, valor: o.sessao ? { userId: "u", email: "a@b.c" } : null }
    ),
    eAdmin: vi.fn(async () =>
      o.erroAdmin ? { ok: false, erro: { code: "FALHA_LEITURA" } } : { ok: true, valor: !!o.admin }
    ),
    aoMudarSessao: vi.fn((cb: (s: unknown) => void) => (ouvintes.push(cb), () => {})),
  } as unknown as AuthStore;
  return { store, ouvintes };
}

describe("guardarAcesso", () => {
  beforeEach(montar);

  it("visitante: vai para /entrar com a volta e nada é revelado", async () => {
    const irPara = vi.fn();
    const { store } = storeFalsa({ sessao: false });
    const ok = await guardarAcesso({ store, irPara, caminhoAtual: () => "/gerenciar_jogadores/editar?id=1" });
    expect(ok).toBe(false);
    expect(irPara).toHaveBeenCalledWith("/entrar?volta=%2Fgerenciar_jogadores%2Feditar%3Fid%3D1");
    expect(protegido().hidden).toBe(true);
    expect(negado().hidden).toBe(true);
  });

  it("logado sem permissão: mostra 'Acesso restrito', sem redirecionar", async () => {
    const irPara = vi.fn();
    const { store } = storeFalsa({ sessao: true, admin: false });
    expect(await guardarAcesso({ store, irPara })).toBe(false);
    expect(negado().hidden).toBe(false);
    expect(protegido().hidden).toBe(true);
    expect(status().hidden).toBe(true);
    expect(irPara).not.toHaveBeenCalled();
  });

  it("admin: revela o conteúdo e devolve true", async () => {
    const { store } = storeFalsa({ sessao: true, admin: true });
    expect(await guardarAcesso({ store, irPara: vi.fn() })).toBe(true);
    expect(protegido().hidden).toBe(false);
    expect(negado().hidden).toBe(true);
    expect(status().hidden).toBe(true);
  });

  it("erro ao consultar a sessão: mensagem, sem revelar nem redirecionar", async () => {
    const irPara = vi.fn();
    const { store } = storeFalsa({ erroSessao: true });
    expect(await guardarAcesso({ store, irPara })).toBe(false);
    expect(status().textContent).toMatch(/conexão/i);
    expect(protegido().hidden).toBe(true);
    expect(irPara).not.toHaveBeenCalled();
  });

  it("erro ao consultar a permissão: nunca revela", async () => {
    const { store } = storeFalsa({ sessao: true, erroAdmin: true });
    expect(await guardarAcesso({ store, irPara: vi.fn() })).toBe(false);
    expect(protegido().hidden).toBe(true);
    expect(negado().hidden).toBe(true);
    expect(status().textContent).not.toBe("");
  });

  it("sair em outra aba esconde o conteúdo e manda para o login", async () => {
    const irPara = vi.fn();
    const { store, ouvintes } = storeFalsa({ sessao: true, admin: true });
    await guardarAcesso({ store, irPara, caminhoAtual: () => "/x" });
    ouvintes[0](null);
    expect(protegido().hidden).toBe(true);
    expect(irPara).toHaveBeenCalledWith("/entrar?volta=%2Fx");
  });

  it("o conteúdo protegido nasce oculto no HTML (nunca visível antes da checagem)", () => {
    expect(protegido().hidden).toBe(true);
  });
});
