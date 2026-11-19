// @vitest-environment happy-dom
//
// Papel da pessoa logada para os atalhos das páginas públicas (home e evento).
import { describe, it, expect, vi } from "vitest";
import { descobrirPapel } from "../src/scripts/papel-conta";
import type { AuthStore } from "../src/store/authStore";

const CHAVES = ["sb-abc-auth-token"];

function storeFalsa(o: {
  sessao?: boolean;
  admin?: boolean;
  organizador?: boolean;
  erroSessao?: boolean;
  erroAdmin?: boolean;
  erroOrganizador?: boolean;
  lancar?: boolean;
}) {
  const store = {
    sessaoAtual: vi.fn(async () => {
      if (o.lancar) throw new Error("rede");
      return o.erroSessao
        ? { ok: false, erro: { code: "FALHA_REDE" } }
        : { ok: true, valor: o.sessao === false ? null : { userId: "u", email: "a@b.c" } };
    }),
    eAdmin: vi.fn(async () =>
      o.erroAdmin ? { ok: false, erro: { code: "FALHA_LEITURA" } } : { ok: true, valor: !!o.admin }
    ),
    eOrganizador: vi.fn(async () =>
      o.erroOrganizador ? { ok: false, erro: { code: "FALHA_LEITURA" } } : { ok: true, valor: !!o.organizador }
    ),
  } as unknown as AuthStore;
  return store;
}

const descobrir = (store: AuthStore, chaves: string[] = CHAVES) =>
  descobrirPapel({ criarStore: () => store, chavesStorage: () => chaves });

describe("descobrirPapel", () => {
  it("sem sessão salva no navegador: null, e a store nem é criada (sem SDK para visitantes)", async () => {
    const criarStore = vi.fn();
    expect(await descobrirPapel({ criarStore, chavesStorage: () => ["x", "sb-a-auth-token-code-verifier"] })).toBeNull();
    expect(criarStore).not.toHaveBeenCalled();
  });

  it("administrador: 'admin', sem consultar organizador", async () => {
    const store = storeFalsa({ admin: true, organizador: true });
    expect(await descobrir(store)).toBe("admin");
    expect(store.eOrganizador).not.toHaveBeenCalled();
  });

  it("organizador (não admin): 'organizador'", async () => {
    expect(await descobrir(storeFalsa({ organizador: true }))).toBe("organizador");
  });

  it("conta comum: null", async () => {
    expect(await descobrir(storeFalsa({}))).toBeNull();
  });

  it("sessão salva expirada (sem sessão real): null, sem consultar papéis", async () => {
    const store = storeFalsa({ sessao: false, admin: true });
    expect(await descobrir(store)).toBeNull();
    expect(store.eAdmin).not.toHaveBeenCalled();
  });

  it("falhas viram null (nenhum atalho aparece) e nunca lançam", async () => {
    expect(await descobrir(storeFalsa({ erroSessao: true }))).toBeNull();
    expect(await descobrir(storeFalsa({ erroAdmin: true, organizador: true }))).toBe("organizador");
    expect(await descobrir(storeFalsa({ erroOrganizador: true }))).toBeNull();
    expect(await descobrir(storeFalsa({ lancar: true }))).toBeNull();
    expect(
      await descobrirPapel({
        criarStore: () => {
          throw new Error("sem env");
        },
        chavesStorage: () => CHAVES,
      })
    ).toBeNull();
  });
});
