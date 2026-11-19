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

function storeFalsa(o: {
  sessao?: boolean;
  admin?: boolean;
  organizador?: boolean;
  erroSessao?: boolean;
  erroAdmin?: boolean;
  erroOrganizador?: boolean;
}) {
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
    eOrganizador: vi.fn(async () =>
      o.erroOrganizador ? { ok: false, erro: { code: "FALHA_LEITURA" } } : { ok: true, valor: !!o.organizador }
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

describe("guardarAcesso: papel de organizador", () => {
  beforeEach(montar);

  it("por padrão (só admin): organizador vê 'Acesso restrito' e o papel nem é consultado", async () => {
    const { store } = storeFalsa({ sessao: true, organizador: true });
    expect(await guardarAcesso({ store, irPara: vi.fn() })).toBe(false);
    expect(negado().hidden).toBe(false);
    expect(protegido().hidden).toBe(true);
    expect(store.eOrganizador).not.toHaveBeenCalled();
  });

  it("permitindo organizador: ele é liberado e o callback recebe o papel", async () => {
    const aoLiberar = vi.fn();
    const { store } = storeFalsa({ sessao: true, organizador: true });
    expect(await guardarAcesso({ store, irPara: vi.fn(), permitir: ["admin", "organizador"], aoLiberar })).toBe(true);
    expect(protegido().hidden).toBe(false);
    expect(negado().hidden).toBe(true);
    expect(aoLiberar).toHaveBeenCalledWith("organizador");
  });

  it("admin tem precedência: é liberado como admin sem consultar organizador", async () => {
    const aoLiberar = vi.fn();
    const { store } = storeFalsa({ sessao: true, admin: true, organizador: true });
    expect(await guardarAcesso({ store, irPara: vi.fn(), permitir: ["admin", "organizador"], aoLiberar })).toBe(true);
    expect(aoLiberar).toHaveBeenCalledWith("admin");
    expect(store.eOrganizador).not.toHaveBeenCalled();
  });

  it("conta logada que não é admin nem organizadora continua sem permissão", async () => {
    const aoLiberar = vi.fn();
    const { store } = storeFalsa({ sessao: true });
    expect(await guardarAcesso({ store, irPara: vi.fn(), permitir: ["admin", "organizador"], aoLiberar })).toBe(false);
    expect(negado().hidden).toBe(false);
    expect(aoLiberar).not.toHaveBeenCalled();
  });

  it("visitante vai para o login, sem consultar papéis", async () => {
    const irPara = vi.fn();
    const { store } = storeFalsa({ sessao: false, organizador: true });
    expect(await guardarAcesso({ store, irPara, permitir: ["admin", "organizador"] })).toBe(false);
    expect(irPara).toHaveBeenCalled();
    expect(store.eOrganizador).not.toHaveBeenCalled();
  });

  it("erro ao consultar o papel de organizador: nunca revela", async () => {
    const { store } = storeFalsa({ sessao: true, erroOrganizador: true });
    expect(await guardarAcesso({ store, irPara: vi.fn(), permitir: ["admin", "organizador"] })).toBe(false);
    expect(protegido().hidden).toBe(true);
    expect(negado().hidden).toBe(true);
    expect(status().textContent).not.toBe("");
  });

  it("sair em outra aba esconde o conteúdo do organizador", async () => {
    const irPara = vi.fn();
    const { store, ouvintes } = storeFalsa({ sessao: true, organizador: true });
    await guardarAcesso({ store, irPara, permitir: ["admin", "organizador"], caminhoAtual: () => "/x" });
    ouvintes[0](null);
    expect(protegido().hidden).toBe(true);
    expect(irPara).toHaveBeenCalledWith("/entrar?volta=%2Fx");
  });
});

describe("guardarAcesso: verificação extra (posse do evento)", () => {
  beforeEach(montar);
  const permitir = ["admin", "organizador"] as const;

  it("verificar true: libera, e só depois o conteúdo é revelado", async () => {
    const { store } = storeFalsa({ sessao: true, organizador: true });
    let oculto = false;
    const verificar = vi.fn(async () => {
      oculto = protegido().hidden; // no momento da checagem ainda está oculto
      return true;
    });
    expect(await guardarAcesso({ store, irPara: vi.fn(), permitir, verificar })).toBe(true);
    expect(verificar).toHaveBeenCalledWith("organizador");
    expect(oculto).toBe(true);
    expect(protegido().hidden).toBe(false);
  });

  it("verificar false: 'Acesso restrito', nada revelado e o callback de liberação não roda", async () => {
    const aoLiberar = vi.fn();
    const { store } = storeFalsa({ sessao: true, organizador: true });
    const ok = await guardarAcesso({ store, irPara: vi.fn(), permitir, aoLiberar, verificar: async () => false });
    expect(ok).toBe(false);
    expect(negado().hidden).toBe(false);
    expect(protegido().hidden).toBe(true);
    expect(status().hidden).toBe(true);
    expect(aoLiberar).not.toHaveBeenCalled();
  });

  it("verificar devolve texto: mostra como mensagem e nunca revela", async () => {
    const { store } = storeFalsa({ sessao: true, organizador: true });
    const ok = await guardarAcesso({ store, irPara: vi.fn(), permitir, verificar: async () => "Falha ao conferir." });
    expect(ok).toBe(false);
    expect(status().textContent).toBe("Falha ao conferir.");
    expect(status().hidden).toBe(false);
    expect(protegido().hidden).toBe(true);
    expect(negado().hidden).toBe(true);
  });

  it("verificar que lança: tratado como sem acesso", async () => {
    const { store } = storeFalsa({ sessao: true, organizador: true });
    const ok = await guardarAcesso({
      store,
      irPara: vi.fn(),
      permitir,
      verificar: async () => {
        throw new Error("x");
      },
    });
    expect(ok).toBe(false);
    expect(negado().hidden).toBe(false);
    expect(protegido().hidden).toBe(true);
  });

  it("visitante e sem permissão nem chegam a verificar", async () => {
    const verificar = vi.fn(async () => true);
    await guardarAcesso({ store: storeFalsa({ sessao: false }).store, irPara: vi.fn(), permitir, verificar });
    await guardarAcesso({ store: storeFalsa({ sessao: true }).store, irPara: vi.fn(), permitir, verificar });
    expect(verificar).not.toHaveBeenCalled();
  });
});
