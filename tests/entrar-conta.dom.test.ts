// @vitest-environment happy-dom
//
// Telas /entrar e /conta: link enviado, erro, redirecionamento seguro e vínculo.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { iniciarEntrar } from "../src/scripts/entrar";
import { avatarSeguro, iniciarConta } from "../src/scripts/conta";
import type { AuthStore } from "../src/store/authStore";
import type { JogadorStore } from "../src/store/jogadorStore";

const tick = () => new Promise((r) => setTimeout(r, 0));

function montarEntrar() {
  document.body.innerHTML = `
    <p data-entrar-estado>Verificando…</p>
    <div data-entrar-formulario hidden>
      <button type="button" data-google>Google</button>
      <form data-form-link>
        <input data-email type="email" />
        <button type="submit" data-enviar-link>Enviar</button>
      </form>
      <p data-entrar-erro></p><p data-entrar-sucesso></p>
    </div>`;
}
const t = (s: string) => document.querySelector(s)!.textContent;

function storeEntrar(o: { sessao?: boolean; otp?: unknown; google?: unknown } = {}) {
  const ouvintes: Array<(s: unknown) => void> = [];
  const store = {
    sessaoAtual: vi.fn(async () => ({ ok: true, valor: o.sessao ? { userId: "u", email: "a@b.c" } : null })),
    aoMudarSessao: vi.fn((cb: (s: unknown) => void) => (ouvintes.push(cb), () => {})),
    entrarComLinkMagico: vi.fn(async () => o.otp ?? { ok: true, valor: undefined }),
    entrarComGoogle: vi.fn(async () => o.google ?? { ok: true, valor: undefined }),
  } as unknown as AuthStore;
  return { store, ouvintes };
}

describe("/entrar", () => {
  beforeEach(montarEntrar);

  it("visitante vê o formulário", async () => {
    const { store } = storeEntrar();
    await iniciarEntrar({ store, volta: null, irPara: vi.fn() });
    expect(document.querySelector<HTMLElement>("[data-entrar-formulario]")!.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>("[data-entrar-estado]")!.hidden).toBe(true);
  });

  it("link enviado: mostra confirmação com o e-mail e repassa a volta", async () => {
    const { store } = storeEntrar();
    await iniciarEntrar({ store, volta: "/gerenciar_jogadores", irPara: vi.fn() });
    (document.querySelector("[data-email]") as HTMLInputElement).value = " Ana@Exemplo.com ";
    document.querySelector<HTMLFormElement>("[data-form-link]")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await tick();
    expect(store.entrarComLinkMagico).toHaveBeenCalledWith("Ana@Exemplo.com", "/gerenciar_jogadores");
    expect(t("[data-entrar-sucesso]")).toContain("ana@exemplo.com");
    expect(t("[data-entrar-erro]")).toBe("");
  });

  it("erro do envio vira mensagem em pt-BR", async () => {
    const { store } = storeEntrar({ otp: { ok: false, erro: { code: "EMAIL_INVALIDO" } } });
    await iniciarEntrar({ store, volta: null, irPara: vi.fn() });
    document.querySelector<HTMLFormElement>("[data-form-link]")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await tick();
    expect(t("[data-entrar-erro]")).toBe("Informe um e-mail válido.");
    expect(t("[data-entrar-sucesso]")).toBe("");
  });

  it("Google: chama a store; erro reabilita o botão", async () => {
    const { store } = storeEntrar({ google: { ok: false, erro: { code: "FALHA_REDE" } } });
    await iniciarEntrar({ store, volta: null, irPara: vi.fn() });
    const g = document.querySelector<HTMLButtonElement>("[data-google]")!;
    g.click();
    await tick();
    expect(store.entrarComGoogle).toHaveBeenCalledWith(undefined);
    expect(g.disabled).toBe(false);
    expect(t("[data-entrar-erro]")).toMatch(/conexão/i);
  });

  it("já logado: redireciona para a volta segura", async () => {
    const irPara = vi.fn();
    await iniciarEntrar({ store: storeEntrar({ sessao: true }).store, volta: "/campeonatos/x/organizar", irPara });
    expect(irPara).toHaveBeenCalledWith("/campeonatos/x/organizar");
  });

  it("volta maliciosa é ignorada (open redirect): cai em /conta", async () => {
    for (const ruim of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)"]) {
      const irPara = vi.fn();
      await iniciarEntrar({ store: storeEntrar({ sessao: true }).store, volta: ruim, irPara });
      expect(irPara).toHaveBeenCalledWith("/conta");
    }
  });

  it("login concluído depois (retorno do Google) também redireciona", async () => {
    const irPara = vi.fn();
    const { store, ouvintes } = storeEntrar();
    await iniciarEntrar({ store, volta: "/jogadores", irPara });
    ouvintes[0]({ userId: "u", email: "a@b.c" });
    expect(irPara).toHaveBeenCalledWith("/jogadores");
  });
});

// ---------------------------------------------------------------------------

function montarConta() {
  document.body.innerHTML = `
    <p data-conta-estado>Carregando…</p>
    <div data-conta-conteudo hidden>
      <img data-conta-avatar hidden alt="" />
      <p data-conta-nome></p><p data-conta-email></p><p data-conta-papel></p>
      <a data-conta-gerenciar hidden>Gerenciar</a>
      <button data-sair>Sair</button>
      <p data-vinculo-atual></p>
      <div data-vinculo-form><select data-vinculo-select></select><button data-vincular>Vincular</button></div>
      <button data-desvincular hidden>Remover</button>
      <p data-vinculo-msg></p>
    </div>`;
}

const JOGADORES = [
  { id: "j1", nome: "Ana", apelido: null },
  { id: "j2", nome: "Bia", apelido: "B" },
];

function storesConta(o: { sessao?: boolean; admin?: boolean; jogadorId?: string | null; vincular?: unknown } = {}) {
  const perfil = { id: "u", nome: "Ana Silva", avatarUrl: "https://x/a.png", jogadorId: o.jogadorId ?? null };
  const store = {
    sessaoAtual: vi.fn(async () => ({ ok: true, valor: "sessao" in o && !o.sessao ? null : { userId: "u", email: "ana@x.com" } })),
    meuPerfil: vi.fn(async () => ({ ok: true, valor: perfil })),
    eAdmin: vi.fn(async () => ({ ok: true, valor: !!o.admin })),
    vincularJogador: vi.fn(async (id: string) => o.vincular ?? { ok: true, valor: { ...perfil, jogadorId: id } }),
    desvincularJogador: vi.fn(async () => ({ ok: true, valor: { ...perfil, jogadorId: null } })),
    sair: vi.fn(async () => ({ ok: true, valor: undefined })),
  } as unknown as AuthStore;
  const jogadorStore = { listar: vi.fn(async () => ({ ok: true, valor: JOGADORES })) } as unknown as JogadorStore;
  return { store, jogadorStore };
}

describe("/conta", () => {
  beforeEach(montarConta);

  it("visitante vai para o login", async () => {
    const irPara = vi.fn();
    await iniciarConta({ ...storesConta({ sessao: false }), irPara });
    expect(irPara).toHaveBeenCalledWith("/entrar?volta=%2Fconta");
  });

  it("mostra dados, papel e lista de jogadores", async () => {
    await iniciarConta({ ...storesConta(), irPara: vi.fn() });
    expect(t("[data-conta-nome]")).toBe("Ana Silva");
    expect(t("[data-conta-email]")).toBe("ana@x.com");
    expect(t("[data-conta-papel]")).toBe("Conta comum");
    expect(document.querySelector<HTMLElement>("[data-conta-conteudo]")!.hidden).toBe(false);
    expect(document.querySelectorAll("[data-vinculo-select] option")).toHaveLength(3);
    expect(document.querySelector<HTMLElement>("[data-conta-gerenciar]")!.hidden).toBe(true);
  });

  it("admin vê o link de gerenciamento", async () => {
    await iniciarConta({ ...storesConta({ admin: true }), irPara: vi.fn() });
    expect(t("[data-conta-papel]")).toBe("Administrador");
    expect(document.querySelector<HTMLElement>("[data-conta-gerenciar]")!.hidden).toBe(false);
  });

  it("vincular exige escolher um jogador", async () => {
    const s = storesConta();
    await iniciarConta({ ...s, irPara: vi.fn() });
    document.querySelector<HTMLButtonElement>("[data-vincular]")!.click();
    await tick();
    expect(s.store.vincularJogador).not.toHaveBeenCalled();
    expect(t("[data-vinculo-msg]")).toBe("Escolha um jogador da lista.");
  });

  it("vincular exibe o jogador com link e permite remover", async () => {
    const s = storesConta();
    await iniciarConta({ ...s, irPara: vi.fn() });
    (document.querySelector("[data-vinculo-select]") as HTMLSelectElement).value = "j2";
    document.querySelector<HTMLButtonElement>("[data-vincular]")!.click();
    await tick();
    expect(s.store.vincularJogador).toHaveBeenCalledWith("j2");
    expect(t("[data-vinculo-atual]")).toContain("Bia");
    expect(document.querySelector("[data-vinculo-atual] a")!.getAttribute("href")).toBe("/jogadores/perfil?id=j2");
    expect(document.querySelector<HTMLElement>("[data-vinculo-form]")!.hidden).toBe(true);

    document.querySelector<HTMLButtonElement>("[data-desvincular]")!.click();
    await tick();
    expect(t("[data-vinculo-atual]")).toContain("não está vinculada");
    expect(document.querySelector<HTMLElement>("[data-vinculo-form]")!.hidden).toBe(false);
  });

  it("jogador já vinculado a outra conta: mensagem clara", async () => {
    const s = storesConta({ vincular: { ok: false, erro: { code: "JOGADOR_JA_VINCULADO" } } });
    await iniciarConta({ ...s, irPara: vi.fn() });
    (document.querySelector("[data-vinculo-select]") as HTMLSelectElement).value = "j1";
    document.querySelector<HTMLButtonElement>("[data-vincular]")!.click();
    await tick();
    expect(t("[data-vinculo-msg]")).toBe("Esse jogador já está vinculado a outra conta.");
  });

  it("conta já vinculada mostra o jogador no carregamento", async () => {
    await iniciarConta({ ...storesConta({ jogadorId: "j1" }), irPara: vi.fn() });
    expect(t("[data-vinculo-atual]")).toContain("Ana");
    expect(document.querySelector<HTMLElement>("[data-desvincular]")!.hidden).toBe(false);
  });

  it("sair encerra a sessão e volta para a home", async () => {
    const irPara = vi.fn();
    const s = storesConta();
    await iniciarConta({ ...s, irPara });
    document.querySelector<HTMLButtonElement>("[data-sair]")!.click();
    await tick();
    expect(s.store.sair).toHaveBeenCalled();
    expect(irPara).toHaveBeenCalledWith("/");
  });

  it("avatarSeguro só aceita https", () => {
    expect(avatarSeguro("https://x/a.png")).toBe("https://x/a.png");
    expect(avatarSeguro("http://x/a.png")).toBeNull();
    expect(avatarSeguro("javascript:alert(1)")).toBeNull();
    expect(avatarSeguro(null)).toBeNull();
  });
});
