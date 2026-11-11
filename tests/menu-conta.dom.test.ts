// @vitest-environment happy-dom
//
// Itens de conta do cabeçalho: visitante, logado e administrador.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { itensConta, temSessaoSalva } from "../src/utils/menu";
import { iniciarMenuConta } from "../src/scripts/menu-conta";
import type { AuthStore } from "../src/store/authStore";

const H = { entrar: "/entrar", conta: "/conta", gerenciar: "/g" };

describe("itensConta", () => {
  it("visitante, logado e admin", () => {
    expect(itensConta("visitante", H)).toEqual([{ rotulo: "Entrar", href: "/entrar" }]);
    expect(itensConta("logado", H)).toEqual([{ rotulo: "Minha conta", href: "/conta", rotuloCurto: "Conta" }]);
    expect(itensConta("admin", H).map((i) => i.rotulo)).toEqual(["Gerenciar", "Minha conta"]);
  });

  it("o link de gerenciamento só existe para admin", () => {
    for (const e of ["visitante", "logado"] as const) {
      expect(itensConta(e, H).some((i) => i.href === "/g")).toBe(false);
    }
  });
});

describe("temSessaoSalva", () => {
  it("reconhece a chave do Supabase", () => {
    expect(temSessaoSalva(["x", "sb-abc123-auth-token"])).toBe(true);
    expect(temSessaoSalva(["sb-abc123-auth-token-code-verifier", "outra"])).toBe(false);
    expect(temSessaoSalva([])).toBe(false);
  });
});

function montar() {
  document.body.innerHTML = `
    <nav>
      <a class="header__link" href="/jogadores">Jogadores</a>
      <span data-menu-conta><a class="header__link" data-astro-cid-x href="/entrar">Entrar</a></span>
    </nav>`;
}
const textos = () =>
  Array.from(document.querySelectorAll("[data-menu-conta] a")).map((a) => a.textContent);

function storeFalsa(sessao: boolean, admin: boolean) {
  const ouvintes: Array<(s: unknown) => void> = [];
  const store = {
    sessaoAtual: vi.fn(async () => ({ ok: true, valor: sessao ? { userId: "u", email: "a@b.c" } : null })),
    eAdmin: vi.fn(async () => ({ ok: true, valor: admin })),
    aoMudarSessao: vi.fn((cb: (s: unknown) => void) => (ouvintes.push(cb), () => {})),
  } as unknown as AuthStore;
  return { store, ouvintes };
}

describe("iniciarMenuConta", () => {
  beforeEach(montar);

  it("sem sessão salva: não cria a store e mantém 'Entrar'", async () => {
    const criar = vi.fn();
    await iniciarMenuConta({ criarStore: criar, chavesStorage: () => ["x"] });
    expect(criar).not.toHaveBeenCalled();
    expect(textos()).toEqual(["Entrar"]);
  });

  it("logado comum: 'Minha conta', sem 'Gerenciar'", async () => {
    const { store } = storeFalsa(true, false);
    await iniciarMenuConta({ criarStore: () => store, chavesStorage: () => ["sb-a-auth-token"] });
    expect(textos()).toEqual(["Minha contaConta"]);
  });

  it("admin: 'Gerenciar' e 'Minha conta', mantendo as classes de estilo", async () => {
    const { store } = storeFalsa(true, true);
    await iniciarMenuConta({ criarStore: () => store, chavesStorage: () => ["sb-a-auth-token"] });
    expect(textos()).toEqual(["Gerenciar", "Minha contaConta"]);
    expect(document.querySelector("[data-menu-conta] a")!.classList.contains("header__link--secundario")).toBe(true);
    const a = document.querySelector("[data-menu-conta] a")!;
    expect(a.className).toContain("header__link");
    expect(a.hasAttribute("data-astro-cid-x")).toBe(true);
  });

  it("itens públicos ficam intactos", async () => {
    const { store } = storeFalsa(true, true);
    await iniciarMenuConta({ criarStore: () => store, chavesStorage: () => ["sb-a-auth-token"] });
    expect(document.querySelector("nav > a")!.textContent).toBe("Jogadores");
  });

  it("ao sair volta para 'Entrar'", async () => {
    const { store, ouvintes } = storeFalsa(true, true);
    await iniciarMenuConta({ criarStore: () => store, chavesStorage: () => ["sb-a-auth-token"] });
    ouvintes[0](null);
    await new Promise((r) => setTimeout(r, 0));
    expect(textos()).toEqual(["Entrar"]);
  });

  it("sessão salva expirada (sem sessão real): volta a 'Entrar'", async () => {
    const { store } = storeFalsa(false, false);
    await iniciarMenuConta({ criarStore: () => store, chavesStorage: () => ["sb-a-auth-token"] });
    expect(textos()).toEqual(["Entrar"]);
  });

  it("falha ao criar a store não quebra o cabeçalho", async () => {
    await iniciarMenuConta({
      criarStore: () => {
        throw new Error("sem env");
      },
      chavesStorage: () => ["sb-a-auth-token"],
    });
    expect(textos()).toEqual(["Entrar"]);
  });
});
