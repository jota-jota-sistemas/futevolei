// src/store/authStore.ts
//
// Auth_Store: a fronteira de I/O da autenticação (Supabase Auth), no mesmo
// padrão do `jogadorStore`: contrato (interface), implementação de navegador
// sobre o cliente público e cliente INJETÁVEL para testes. Nenhum método lança:
// todos devolvem `ResultadoAuth`.
//
// Segurança: usa só o cliente PÚBLICO. A decisão de quem é administrador vem do
// banco (função eh_admin() via rpc), nunca de dados do navegador.

import type { Session, SupabaseClient } from "@supabase/supabase-js";

import type { Perfil, ResultadoAuth, Sessao } from "../domain/auth/types";
import { ehViolacaoUnicidade, mapearErroAuth } from "../domain/auth/mensagens";
import { validarEmail } from "../domain/auth/validation";
import { comBase } from "../utils/url";

// ---------------------------------------------------------------------------
// Contrato
// ---------------------------------------------------------------------------

export interface AuthStore {
  /** Inicia o login com Google (redireciona o navegador). */
  entrarComGoogle(volta?: string): Promise<ResultadoAuth<void>>;
  /** Envia o link mágico para o e-mail informado. */
  entrarComLinkMagico(email: string, volta?: string): Promise<ResultadoAuth<void>>;
  sair(): Promise<ResultadoAuth<void>>;
  /** Sessão atual (null = visitante). */
  sessaoAtual(): Promise<ResultadoAuth<Sessao | null>>;
  /** Avisa mudanças de sessão (login, logout). Devolve a função que cancela. */
  aoMudarSessao(ouvinte: (sessao: Sessao | null) => void): () => void;
  /** A conta logada é de um administrador? (consulta eh_admin() no banco) */
  eAdmin(): Promise<ResultadoAuth<boolean>>;
  /** Perfil da conta logada (criado sob demanda se ainda não existir). */
  meuPerfil(): Promise<ResultadoAuth<Perfil | null>>;
  vincularJogador(jogadorId: string): Promise<ResultadoAuth<Perfil>>;
  desvincularJogador(): Promise<ResultadoAuth<Perfil>>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PerfilRow {
  id: string;
  nome: string | null;
  avatar_url: string | null;
  jogador_id: string | null;
}

const COLUNAS_PERFIL = "id, nome, avatar_url, jogador_id";

export function perfilDeRow(row: PerfilRow): Perfil {
  return {
    id: row.id,
    nome: row.nome,
    avatarUrl: row.avatar_url,
    jogadorId: row.jogador_id,
  };
}

function sessaoDe(session: Session | null | undefined): Sessao | null {
  if (!session?.user) return null;
  return { userId: session.user.id, email: session.user.email?.toLowerCase() ?? null };
}

function falha<T = never>(code: "NAO_AUTENTICADO" | "FALHA_LEITURA" | "FALHA_PERSISTENCIA" | "FALHA_REDE" | "JOGADOR_JA_VINCULADO" | "JOGADOR_NAO_ENCONTRADO"): ResultadoAuth<T> {
  return { ok: false, erro: { code } };
}

/** Página de retorno do login (/entrar) com o destino final em `?volta=`. */
export function urlDeRetorno(volta?: string): string {
  const base = `${window.location.origin}${comBase("/entrar")}`;
  return volta ? `${base}?volta=${encodeURIComponent(volta)}` : base;
}

/** Código do Postgres para violação de chave estrangeira (jogador inexistente). */
const PG_FK_VIOLATION = "23503";

/** Resolve o cliente público SOB DEMANDA (o módulo lança sem variáveis de ambiente). */
async function clientePublicoPadrao(): Promise<SupabaseClient> {
  const mod = await import("../lib/supabase");
  return mod.supabase;
}

// ---------------------------------------------------------------------------
// Implementação de navegador
// ---------------------------------------------------------------------------

export function criarAuthStoreBrowser(
  client?: SupabaseClient,
  opcoes?: { urlRetorno?: (volta?: string) => string }
): AuthStore {
  let cache: SupabaseClient | null = client ?? null;
  async function obterClient(): Promise<SupabaseClient> {
    if (cache === null) cache = await clientePublicoPadrao();
    return cache;
  }
  const retorno = opcoes?.urlRetorno ?? urlDeRetorno;

  /** Sessão atual ou erro (usada pelas operações que exigem login). */
  async function exigirSessao(c: SupabaseClient): Promise<Sessao | null> {
    const { data, error } = await c.auth.getSession();
    if (error) return null;
    return sessaoDe(data.session);
  }

  async function atualizarVinculo(jogadorId: string | null): Promise<ResultadoAuth<Perfil>> {
    try {
      const c = await obterClient();
      const sessao = await exigirSessao(c);
      if (!sessao) return falha("NAO_AUTENTICADO");
      const { data, error } = await c
        .from("perfis")
        .update({ jogador_id: jogadorId, atualizado_em: new Date().toISOString() })
        .eq("id", sessao.userId)
        .select(COLUNAS_PERFIL)
        .maybeSingle();
      if (error) {
        if (ehViolacaoUnicidade(error)) return falha("JOGADOR_JA_VINCULADO");
        if (error.code === PG_FK_VIOLATION) return falha("JOGADOR_NAO_ENCONTRADO");
        return falha("FALHA_PERSISTENCIA");
      }
      if (!data) return falha("FALHA_PERSISTENCIA");
      return { ok: true, valor: perfilDeRow(data as PerfilRow) };
    } catch {
      return falha("FALHA_PERSISTENCIA");
    }
  }

  return {
    async entrarComGoogle(volta) {
      try {
        const c = await obterClient();
        const { error } = await c.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: retorno(volta) },
        });
        if (error) return { ok: false, erro: mapearErroAuth(error) };
        return { ok: true, valor: undefined };
      } catch {
        return falha("FALHA_REDE");
      }
    },

    async entrarComLinkMagico(email, volta) {
      const valido = validarEmail(email);
      if (valido === null) return { ok: false, erro: { code: "EMAIL_INVALIDO" } };
      try {
        const c = await obterClient();
        const { error } = await c.auth.signInWithOtp({
          email: valido,
          options: { emailRedirectTo: retorno(volta), shouldCreateUser: true },
        });
        if (error) return { ok: false, erro: mapearErroAuth(error) };
        return { ok: true, valor: undefined };
      } catch {
        return falha("FALHA_REDE");
      }
    },

    async sair() {
      try {
        const c = await obterClient();
        const { error } = await c.auth.signOut();
        if (error) return { ok: false, erro: mapearErroAuth(error) };
        return { ok: true, valor: undefined };
      } catch {
        return falha("FALHA_REDE");
      }
    },

    async sessaoAtual() {
      try {
        const c = await obterClient();
        const { data, error } = await c.auth.getSession();
        if (error) return { ok: false, erro: mapearErroAuth(error) };
        return { ok: true, valor: sessaoDe(data.session) };
      } catch {
        return falha("FALHA_REDE");
      }
    },

    aoMudarSessao(ouvinte) {
      let cancelar: (() => void) | null = null;
      let cancelado = false;
      void obterClient()
        .then((c) => {
          const { data } = c.auth.onAuthStateChange((_evento, session) => {
            ouvinte(sessaoDe(session));
          });
          if (cancelado) data.subscription.unsubscribe();
          else cancelar = () => data.subscription.unsubscribe();
        })
        .catch(() => {
          /* sem cliente: nada a ouvir */
        });
      return () => {
        cancelado = true;
        cancelar?.();
      };
    },

    async eAdmin() {
      try {
        const c = await obterClient();
        const sessao = await exigirSessao(c);
        if (!sessao) return { ok: true, valor: false };
        const { data, error } = await c.rpc("eh_admin");
        if (error) return falha("FALHA_LEITURA");
        return { ok: true, valor: data === true };
      } catch {
        return falha("FALHA_LEITURA");
      }
    },

    async meuPerfil() {
      try {
        const c = await obterClient();
        const sessao = await exigirSessao(c);
        if (!sessao) return { ok: true, valor: null };
        const lido = await c
          .from("perfis")
          .select(COLUNAS_PERFIL)
          .eq("id", sessao.userId)
          .maybeSingle();
        if (lido.error) return falha("FALHA_LEITURA");
        if (lido.data) return { ok: true, valor: perfilDeRow(lido.data as PerfilRow) };

        // Conta anterior ao trigger: cria o perfil vazio da própria conta.
        const criado = await c
          .from("perfis")
          .insert({ id: sessao.userId })
          .select(COLUNAS_PERFIL)
          .maybeSingle();
        if (criado.error || !criado.data) return falha("FALHA_LEITURA");
        return { ok: true, valor: perfilDeRow(criado.data as PerfilRow) };
      } catch {
        return falha("FALHA_LEITURA");
      }
    },

    vincularJogador(jogadorId) {
      return atualizarVinculo(jogadorId);
    },

    desvincularJogador() {
      return atualizarVinculo(null);
    },
  };
}
