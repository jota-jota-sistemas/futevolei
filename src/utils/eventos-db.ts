import type { SupabaseClient } from "@supabase/supabase-js";
import type { Campeonato, Torneio } from "../types";
import { chaveTexto } from "./texto";
import { torneioParaCampeonato } from "./torneios";

/**
 * Leitura dos eventos na tabela `campeonatos` do Supabase, A CADA ACESSO (SSR).
 *
 * Home, detalhe, organizar, acompanhar e perfil de jogador são páginas sob
 * demanda (`prerender = false`) que leem o banco na hora do acesso. Mudou algo no
 * banco? Aparece em até ~1 minuto (cache do CDN), sem novo deploy. Se a consulta
 * falhar, a requisição falha com uma mensagem clara.
 *
 * O restante do site só conhece o tipo `Campeonato`; esta camada converte a
 * linha do banco (formato do `torneios.json`) nele, reaproveitando as mesmas
 * regras de padronização de `torneioParaCampeonato`.
 */

/** Evento já no modelo do site, com os dados extras que o banco acrescenta. */
export interface EventoCarregado extends Campeonato {
  /** Aparece na home e tem página de detalhe. */
  listado: boolean;
  /** Id que o coletor gera para o evento (difere de `id` nos eventos antigos). */
  idOrigem: string | null;
  /**
   * Nomes das categorias EXATAMENTE como estão no banco. Organizar e acompanhar
   * localizam a categoria por esse nome; `categorias` (padronizadas) é só para exibir.
   */
  categoriasBanco: string[];
  /** Há ao menos um chaveamento gerado em alguma categoria do evento. */
  temChaveamento: boolean;
}

type Embutido<T> = T | T[] | null;

interface LinhaCategoria {
  nome: string;
  chaveamentos?: Embutido<{ id: string }>;
}

/** Linha de `campeonatos` como o PostgREST devolve (com categorias embutidas). */
export interface LinhaEventoDb {
  id: string;
  id_origem: string | null;
  nome: string;
  data: string;
  data_fim: string | null;
  cidade: string | null;
  uf: string | null;
  endereco: string | null;
  preco: number | string | null;
  preco_texto: string | null;
  local: string | null;
  foto: string | null;
  descricao: string | null;
  instagram: string | null;
  inscricao: string | null;
  fonte: string | null;
  listado: boolean | null;
  categorias: LinhaCategoria[] | null;
}

const COLUNAS =
  "id, id_origem, nome, data, data_fim, cidade, uf, endereco, preco, preco_texto, local, foto, descricao, instagram, inscricao, fonte, listado, categorias(nome, chaveamentos(id))";

function temItem<T>(valor: Embutido<T> | undefined): boolean {
  if (Array.isArray(valor)) return valor.length > 0;
  return valor !== null && valor !== undefined;
}

/** Converte uma linha do banco no modelo do site. Pura. */
export function linhaParaEvento(linha: LinhaEventoDb): EventoCarregado {
  const categoriasBanco = (linha.categorias ?? [])
    .map((c) => (c?.nome ?? "").trim())
    .filter(Boolean)
    .sort((a, b) => chaveTexto(a).localeCompare(chaveTexto(b), "pt-BR") || a.localeCompare(b, "pt-BR"));

  const preco = typeof linha.preco === "string" ? Number(linha.preco) : linha.preco;
  const registro: Torneio = {
    id: linha.id,
    nome: linha.nome,
    data: linha.data,
    dataFim: linha.data_fim ?? linha.data,
    cidade: linha.cidade ?? "",
    uf: (linha.uf ?? "").trim(),
    endereco: linha.endereco ?? "",
    preco: preco !== null && preco !== undefined && Number.isFinite(preco) ? preco : null,
    precoTexto: linha.preco_texto ?? "",
    categorias: categoriasBanco,
    instagram: linha.instagram ?? "",
    foto: linha.foto ?? "",
    descricao: linha.descricao ?? "",
    fonte: linha.fonte ?? "",
  };
  const base = torneioParaCampeonato(registro);

  // Linhas antigas, sem cidade/UF/endereço, só têm o texto de `local`.
  const local = registro.cidade.trim() ? base.local : (linha.local ?? "").trim();
  const inscricao = linha.inscricao?.trim() || undefined;

  return {
    ...base,
    local,
    ...(inscricao ? { inscricao } : {}),
    listado: linha.listado !== false,
    idOrigem: linha.id_origem ?? null,
    categoriasBanco,
    temChaveamento: (linha.categorias ?? []).some((c) => temItem(c?.chaveamentos)),
  };
}

/** Data de hoje (YYYY-MM-DD) no fuso de São Paulo, onde os eventos acontecem. */
export function hojeSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

/** Eventos que ainda não terminaram (`dataFim` ou `data` >= hoje). */
export function eventosFuturos<T extends Campeonato>(eventos: T[], hoje: string): T[] {
  return eventos.filter((e) => (e.dataFim && e.dataFim >= e.data ? e.dataFim : e.data) >= hoje);
}

export type EscopoEventos =
  /** Home: só listados e que ainda não terminaram. */
  | "publico"
  /** Detalhe, acompanhar e perfil de jogador: listados, de qualquer data (o placar e o ranking seguem acessíveis depois do evento). */
  | "listados"
  /** Organizar e acompanhar: todos os ativos, listados ou não, de qualquer data. */
  | "todos";

export interface OpcoesCarregar {
  escopo?: EscopoEventos;
  /** Cliente injetado (testes). Sem ele, usa o cliente público e guarda o resultado em cache. */
  client?: SupabaseClient;
  /** "Hoje" injetável (testes). */
  hoje?: string;
}

// As páginas são geradas a cada acesso (SSR): uma mesma requisição consulta os
// eventos várias vezes (página + componentes) e picos de acesso repetem a
// consulta. Guarda o resultado por pouco tempo, por escopo. A validade é curta
// de propósito: o banco manda, o cache só evita consultas em rajada.
const VALIDADE_CACHE_MS = 15_000;
const cache = new Map<string, { expira: number; promessa: Promise<EventoCarregado[]> }>();

/** Esvazia o cache (usado nos testes). */
export function limparCacheEventos(): void {
  cache.clear();
}

async function clientePublicoPadrao(): Promise<SupabaseClient> {
  try {
    const mod = await import("../lib/supabase");
    return mod.supabase;
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    throw new Error(
      `Não foi possível criar o cliente do Supabase para carregar os eventos. ${detalhe}`
    );
  }
}

async function consultar(opcoes: OpcoesCarregar): Promise<EventoCarregado[]> {
  const escopo = opcoes.escopo ?? "publico";
  const client = opcoes.client ?? (await clientePublicoPadrao());

  let consulta = client.from("campeonatos").select(COLUNAS).eq("ativo", true);
  if (escopo === "publico" || escopo === "listados") consulta = consulta.eq("listado", true);
  const { data, error } = await consulta.order("data", { ascending: true }).order("id", { ascending: true });

  if (error) {
    throw new Error(
      `Não foi possível carregar os eventos do banco (${error.message}). ` +
        "Confira PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, se o banco está acessível " +
        "e se supabase/migracao-eventos.sql e supabase/seed-eventos.sql foram aplicados."
    );
  }

  const eventos = ((data ?? []) as unknown as LinhaEventoDb[]).map(linhaParaEvento);
  return escopo === "publico" ? eventosFuturos(eventos, opcoes.hoje ?? hojeSaoPaulo()) : eventos;
}

/**
 * Carrega os eventos do banco, ordenados por data e id. Lança se a consulta
 * falhar. Com o cliente padrão o resultado fica em cache por alguns segundos.
 */
export function carregarEventos(opcoes: OpcoesCarregar = {}): Promise<EventoCarregado[]> {
  if (opcoes.client) return consultar(opcoes);
  const chave = `${opcoes.escopo ?? "publico"}|${opcoes.hoje ?? ""}`;
  const agora = Date.now();
  const guardado = cache.get(chave);
  if (guardado && guardado.expira > agora) return guardado.promessa;
  const promessa = consultar(opcoes);
  cache.set(chave, { expira: agora + VALIDADE_CACHE_MS, promessa });
  // Falha não fica em cache: a próxima chamada tenta de novo.
  promessa.catch(() => {
    if (cache.get(chave)?.promessa === promessa) cache.delete(chave);
  });
  return promessa;
}
