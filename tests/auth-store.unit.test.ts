// Testes do authStore com cliente falso (sem rede).
import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { criarAuthStoreBrowser, perfilDeRow } from "../src/store/authStore";

const SESSAO = { user: { id: "u1", email: "Ana@Exemplo.com" } };
const ROW = { id: "u1", nome: "Ana", avatar_url: "http://x/a.png", jogador_id: null };

interface Opcoes {
  session?: unknown;
  rpc?: { data: unknown; error: unknown };
  select?: { data: unknown; error: unknown };
  insert?: { data: unknown; error: unknown };
  update?: { data: unknown; error: unknown };
  otp?: { error: unknown };
  oauth?: { error: unknown };
  lancar?: boolean;
}

function fake(o: Opcoes = {}) {
  const chamadas: Record<string, unknown[]> = {};
  const reg = (k: string, v: unknown) => ((chamadas[k] ??= []).push(v), undefined);
  const consulta = (res: { data: unknown; error: unknown } | undefined, k: string) => {
    const q: Record<string, unknown> = {};
    q.eq = (...a: unknown[]) => (reg(k + ".eq", a), q);
    q.select = (...a: unknown[]) => (reg(k + ".select", a), q);
    q.maybeSingle = () => Promise.resolve(res ?? { data: null, error: null });
    return q;
  };
  const auth = {
    getSession: vi.fn(async () => {
      if (o.lancar) throw new Error("rede");
      return { data: { session: "session" in o ? o.session : SESSAO }, error: null };
    }),
    signInWithOtp: vi.fn(async (a: unknown) => (reg("otp", a), o.otp ?? { error: null })),
    signInWithOAuth: vi.fn(async (a: unknown) => (reg("oauth", a), o.oauth ?? { error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    onAuthStateChange: vi.fn((cb: (e: string, s: unknown) => void) => {
      reg("onChange", cb);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
  };
  const client = {
    auth,
    rpc: vi.fn(async () => o.rpc ?? { data: false, error: null }),
    from: vi.fn(() => ({
      select: () => consulta(o.select, "select"),
      insert: (v: unknown) => (reg("insert", v), consulta(o.insert, "insert")),
      update: (v: unknown) => (reg("update", v), consulta(o.update, "update")),
    })),
  };
  return { client: client as unknown as SupabaseClient, chamadas, auth, raw: client };
}

const url = (v?: string) => `https://site/entrar${v ? `?volta=${v}` : ""}`;
const store = (o?: Opcoes) => {
  const f = fake(o);
  return { ...f, s: criarAuthStoreBrowser(f.client, { urlRetorno: url }) };
};

describe("login", () => {
  it("link mágico: normaliza o e-mail e usa o retorno", async () => {
    const { s, chamadas } = store();
    const r = await s.entrarComLinkMagico("  Ana@Exemplo.COM ", "/conta");
    expect(r.ok).toBe(true);
    expect(chamadas.otp[0]).toMatchObject({
      email: "ana@exemplo.com",
      options: { emailRedirectTo: "https://site/entrar?volta=/conta" },
    });
  });

  it("link mágico: e-mail inválido nem chama a rede", async () => {
    const { s, auth } = store();
    const r = await s.entrarComLinkMagico("ana");
    expect(r).toEqual({ ok: false, erro: { code: "EMAIL_INVALIDO" } });
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("link mágico: limite de envios do provedor", async () => {
    const { s } = store({ otp: { error: { status: 429, message: "rate limit" } } });
    const r = await s.entrarComLinkMagico("a@b.com");
    expect(r).toEqual({ ok: false, erro: { code: "LIMITE_ENVIOS" } });
  });

  it("Google: pede o provedor google com o retorno", async () => {
    const { s, chamadas } = store();
    expect((await s.entrarComGoogle()).ok).toBe(true);
    expect(chamadas.oauth[0]).toMatchObject({ provider: "google", options: { redirectTo: "https://site/entrar" } });
  });

  it("falha de rede vira FALHA_REDE, sem lançar", async () => {
    const { s, auth } = store();
    auth.signInWithOAuth.mockRejectedValueOnce(new Error("x"));
    expect(await s.entrarComGoogle()).toEqual({ ok: false, erro: { code: "FALHA_REDE" } });
  });
});

describe("sessão e admin", () => {
  it("sessão em minúsculas; visitante = null", async () => {
    expect(await store().s.sessaoAtual()).toEqual({ ok: true, valor: { userId: "u1", email: "ana@exemplo.com" } });
    expect(await store({ session: null }).s.sessaoAtual()).toEqual({ ok: true, valor: null });
  });

  it("eAdmin: visitante é false sem consultar o banco", async () => {
    const { s, raw } = store({ session: null, rpc: { data: true, error: null } });
    expect(await s.eAdmin()).toEqual({ ok: true, valor: false });
    expect(raw.rpc).not.toHaveBeenCalled();
  });

  it("eAdmin: só true quando o banco responde true", async () => {
    expect(await store({ rpc: { data: true, error: null } }).s.eAdmin()).toEqual({ ok: true, valor: true });
    expect(await store({ rpc: { data: "true", error: null } }).s.eAdmin()).toEqual({ ok: true, valor: false });
    expect(await store({ rpc: { data: null, error: { message: "x" } } }).s.eAdmin()).toEqual({
      ok: false,
      erro: { code: "FALHA_LEITURA" },
    });
  });

  it("eAdmin: exceção vira FALHA_LEITURA", async () => {
    expect(await store({ lancar: true }).s.eAdmin()).toEqual({ ok: false, erro: { code: "FALHA_LEITURA" } });
  });

  it("aoMudarSessao repassa a sessão convertida e cancela", async () => {
    const { s, chamadas } = store();
    const ouvinte = vi.fn();
    const cancelar = s.aoMudarSessao(ouvinte);
    await new Promise((r) => setTimeout(r, 0));
    (chamadas.onChange[0] as (e: string, x: unknown) => void)("SIGNED_IN", SESSAO);
    expect(ouvinte).toHaveBeenCalledWith({ userId: "u1", email: "ana@exemplo.com" });
    cancelar();
  });
});

describe("perfil e vínculo", () => {
  it("meuPerfil: visitante recebe null", async () => {
    expect(await store({ session: null }).s.meuPerfil()).toEqual({ ok: true, valor: null });
  });

  it("meuPerfil: converte a linha", async () => {
    const r = await store({ select: { data: ROW, error: null } }).s.meuPerfil();
    expect(r).toEqual({ ok: true, valor: perfilDeRow(ROW) });
  });

  it("meuPerfil: cria o perfil quando não existe", async () => {
    const { s, chamadas } = store({ insert: { data: ROW, error: null } });
    const r = await s.meuPerfil();
    expect(r.ok).toBe(true);
    expect(chamadas.insert[0]).toEqual({ id: "u1" });
  });

  it("vincular: grava jogador_id da própria conta", async () => {
    const { s, chamadas } = store({ update: { data: { ...ROW, jogador_id: "j1" }, error: null } });
    const r = await s.vincularJogador("j1");
    expect(r).toMatchObject({ ok: true, valor: { jogadorId: "j1" } });
    expect(chamadas.update[0]).toMatchObject({ jogador_id: "j1" });
    expect(chamadas["update.eq"][0]).toEqual(["id", "u1"]);
  });

  it("vincular: jogador já vinculado a outra conta", async () => {
    const { s } = store({ update: { data: null, error: { code: "23505" } } });
    expect(await s.vincularJogador("j1")).toEqual({ ok: false, erro: { code: "JOGADOR_JA_VINCULADO" } });
  });

  it("vincular: jogador inexistente e falha genérica", async () => {
    expect(await store({ update: { data: null, error: { code: "23503" } } }).s.vincularJogador("j1")).toEqual({
      ok: false,
      erro: { code: "JOGADOR_NAO_ENCONTRADO" },
    });
    expect(await store({ update: { data: null, error: { code: "XX" } } }).s.vincularJogador("j1")).toEqual({
      ok: false,
      erro: { code: "FALHA_PERSISTENCIA" },
    });
  });

  it("vincular sem login: NAO_AUTENTICADO", async () => {
    expect(await store({ session: null }).s.vincularJogador("j1")).toEqual({
      ok: false,
      erro: { code: "NAO_AUTENTICADO" },
    });
  });

  it("desvincular grava null", async () => {
    const { s, chamadas } = store({ update: { data: ROW, error: null } });
    expect((await s.desvincularJogador()).ok).toBe(true);
    expect(chamadas.update[0]).toMatchObject({ jogador_id: null });
  });
});
