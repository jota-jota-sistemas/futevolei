import type { Campeonato, Torneio } from "../types";
import { chaveTexto } from "./texto";
import { tituloPtBr, normalizarCategorias, torneioParaCampeonato } from "./torneios";
import { cidadeDoLocalAntigo } from "./casar-eventos";

/**
 * Geração do SQL de carga dos eventos (supabase/seed-eventos.sql) a partir de
 * `torneios.json` (calendário coletado), `campeonatos.json` (formato antigo) e
 * do mapa de ids revisado (`scripts/mapa-ids-eventos.json`).
 *
 * Regras:
 *  - evento que existe nas duas fontes usa o id do `campeonatos.json`
 *    (categorias e chaveamentos já criados apontam para ele) e guarda o id do
 *    coletor em `id_origem`;
 *  - evento só do `torneios.json` mantém o id do coletor;
 *  - evento só do `campeonatos.json` continua ativo, mas NÃO listado: tem as
 *    telas de organizar e acompanhar e não aparece na home;
 *  - categorias existentes nunca são tocadas: só entram as que ainda faltam
 *    (sem diferenciar maiúsculas).
 * Tudo puro e determinístico.
 */

export interface MapaIds {
  pares: { idAntigo: string; idColetor: string }[];
  soCampeonatos: string[];
}

export interface EntradaSeed {
  torneios: Torneio[];
  antigos: Campeonato[];
  mapa: MapaIds;
}

/** Literal de texto SQL: aspas simples dobradas; vazio/ausente vira null. */
export function sqlTexto(valor: string | null | undefined): string {
  const v = valor ?? "";
  if (v.trim() === "") return "null";
  return `'${v.replace(/'/g, "''")}'`;
}

function sqlTextoObrigatorio(valor: string): string {
  return `'${(valor ?? "").replace(/'/g, "''")}'`;
}

function sqlNumero(valor: number | null | undefined): string {
  return typeof valor === "number" && Number.isFinite(valor) ? String(valor) : "null";
}

function sqlBool(valor: boolean): string {
  return valor ? "true" : "false";
}

const UF_VALIDA = /^[A-Z]{2}$/;

/** UF final de um local antigo ("..., Limeira, SP" -> "SP"); null se não houver. */
export function ufDoLocalAntigo(local: string): string | null {
  const partes = (local ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const ultima = (partes[partes.length - 1] ?? "").toUpperCase();
  return UF_VALIDA.test(ultima) ? ultima : null;
}

interface LinhaEvento {
  id: string;
  idOrigem: string | null;
  nome: string;
  data: string;
  dataFim: string | null;
  cidade: string | null;
  uf: string | null;
  endereco: string | null;
  preco: number | null;
  precoTexto: string | null;
  local: string | null;
  foto: string;
  descricao: string;
  instagram: string | null;
  fonte: string;
  listado: boolean;
  categorias: string[];
}

/** Junta listas de categorias sem repetir (sem diferenciar maiúsculas/acentos). */
function unirCategorias(...listas: string[][]): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const lista of listas) {
    for (const nome of lista) {
      const limpo = (nome ?? "").trim();
      const chave = chaveTexto(limpo);
      if (!chave || vistos.has(chave)) continue;
      vistos.add(chave);
      saida.push(limpo);
    }
  }
  return saida;
}

function linhaDeTorneio(t: Torneio, antigo: Campeonato | undefined): LinhaEvento {
  const base = torneioParaCampeonato(t);
  const uf = (t.uf ?? "").trim().toUpperCase();
  return {
    id: antigo ? antigo.id : t.id,
    idOrigem: t.id,
    nome: t.nome.trim(),
    data: t.data,
    dataFim: t.dataFim && t.dataFim >= t.data ? t.dataFim : null,
    cidade: tituloPtBr(t.cidade) || null,
    uf: UF_VALIDA.test(uf) ? uf : null,
    endereco: t.endereco?.trim() || null,
    preco: t.preco,
    precoTexto: t.precoTexto?.trim() || null,
    local: base.local || null,
    foto: base.foto || antigo?.foto?.trim() || "",
    descricao: base.descricao || antigo?.descricao?.trim() || "",
    instagram: base.instagram || antigo?.instagram?.trim() || null,
    fonte: t.fonte,
    listado: true,
    // Curadoria antiga primeiro, depois as do coletor que ainda faltarem.
    categorias: unirCategorias(antigo?.categorias ?? [], normalizarCategorias(t.categorias)),
  };
}

function linhaSoAntiga(a: Campeonato): LinhaEvento {
  const cidade = tituloPtBr(cidadeDoLocalAntigo(a.local));
  return {
    id: a.id,
    idOrigem: null,
    nome: a.nome.trim(),
    data: a.data,
    dataFim: a.dataFim && a.dataFim >= a.data ? a.dataFim : null,
    cidade: cidade || null,
    uf: ufDoLocalAntigo(a.local),
    endereco: null,
    preco: null,
    precoTexto: null,
    local: a.local?.trim() || null,
    foto: a.foto?.trim() ?? "",
    descricao: a.descricao?.trim() ?? "",
    instagram: a.instagram?.trim() || null,
    fonte: "campeonatos.json",
    listado: false,
    categorias: unirCategorias(a.categorias ?? []),
  };
}

/** Todas as linhas do seed, em ordem estável (data, id). */
export function linhasDoSeed({ torneios, antigos, mapa }: EntradaSeed): LinhaEvento[] {
  const antigoPorId = new Map(antigos.map((a) => [a.id, a]));
  const antigoPorColetor = new Map<string, Campeonato>();
  for (const par of mapa.pares) {
    const antigo = antigoPorId.get(par.idAntigo);
    if (!antigo) throw new Error(`Mapa aponta para id antigo inexistente: ${par.idAntigo}`);
    antigoPorColetor.set(par.idColetor, antigo);
  }
  const linhas: LinhaEvento[] = torneios.map((t) => linhaDeTorneio(t, antigoPorColetor.get(t.id)));
  for (const id of mapa.soCampeonatos) {
    const antigo = antigoPorId.get(id);
    if (!antigo) throw new Error(`Mapa aponta para id antigo inexistente: ${id}`);
    linhas.push(linhaSoAntiga(antigo));
  }

  const ids = new Set<string>();
  const origens = new Set<string>();
  for (const l of linhas) {
    if (ids.has(l.id)) throw new Error(`Id repetido no seed: ${l.id}`);
    ids.add(l.id);
    if (l.idOrigem) {
      if (origens.has(l.idOrigem)) throw new Error(`id_origem repetido no seed: ${l.idOrigem}`);
      origens.add(l.idOrigem);
    }
  }
  return linhas.sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
}

const COLUNAS = [
  "id", "id_origem", "nome", "data", "data_fim", "cidade", "uf", "endereco",
  "preco", "preco_texto", "local", "foto", "descricao", "instagram", "fonte",
  "ativo", "listado",
] as const;

function valoresDaLinha(l: LinhaEvento): string {
  return `  (${[
    sqlTextoObrigatorio(l.id),
    sqlTexto(l.idOrigem),
    sqlTextoObrigatorio(l.nome),
    `'${l.data}'`,
    l.dataFim ? `'${l.dataFim}'` : "null",
    sqlTexto(l.cidade),
    sqlTexto(l.uf),
    sqlTexto(l.endereco),
    sqlNumero(l.preco),
    sqlTexto(l.precoTexto),
    sqlTexto(l.local),
    sqlTextoObrigatorio(l.foto),
    sqlTextoObrigatorio(l.descricao),
    sqlTexto(l.instagram),
    sqlTexto(l.fonte),
    sqlBool(true),
    sqlBool(l.listado),
  ].join(", ")})`;
}

/** SQL completo do seed. */
export function gerarSeedEventos(entrada: EntradaSeed): string {
  const linhas = linhasDoSeed(entrada);
  const listados = linhas.filter((l) => l.listado).length;
  const ocultos = linhas.length - listados;

  const atualizaveis = COLUNAS.filter((c) => c !== "id");
  const upsert =
    `insert into campeonatos (${COLUNAS.join(", ")}) values\n` +
    linhas.map(valoresDaLinha).join(",\n") +
    `\non conflict (id) do update set\n` +
    atualizaveis.map((c) => `  ${c} = excluded.${c}`).join(",\n") +
    `,\n  atualizado_em = now();\n`;

  const paresCategoria: string[] = [];
  for (const l of linhas) {
    for (const nome of l.categorias) {
      paresCategoria.push(`  (${sqlTextoObrigatorio(l.id)}, ${sqlTextoObrigatorio(nome)})`);
    }
  }
  const categorias =
    paresCategoria.length === 0
      ? ""
      : `insert into categorias (campeonato_id, nome)\n` +
        `select v.campeonato_id, v.nome\n` +
        `from (values\n${paresCategoria.join(",\n")}\n) as v(campeonato_id, nome)\n` +
        `where not exists (\n` +
        `  select 1 from categorias c\n` +
        `  where c.campeonato_id = v.campeonato_id\n` +
        `    and lower(btrim(c.nome)) = lower(btrim(v.nome))\n` +
        `);\n`;

  return `-- =============================================================================
-- SEED: eventos (carga inicial da tabela campeonatos)
-- -----------------------------------------------------------------------------
-- GERADO por scripts/gerar-seed-eventos.ts (npm run gerar:seed-eventos) a partir
-- de src/data/torneios.json, src/data/campeonatos.json e
-- scripts/mapa-ids-eventos.json. NÃO edite à mão: regenere.
--
-- Pré-requisito: supabase/migracao-eventos.sql aplicada.
-- Idempotente: pode ser executada mais de uma vez. Reexecutar sobrescreve os
-- dados do evento pelos do torneios.json; as categorias existentes não são
-- tocadas (só entram as que ainda faltam, sem diferenciar maiúsculas).
--
-- Conteúdo: ${linhas.length} eventos (${listados} listados na home e ${ocultos} ativos e não
-- listados, que só têm as telas de organizar e acompanhar).
--   * evento que existe nas duas fontes usa o id do campeonatos.json (as
--     categorias e chaveamentos já criados apontam para ele) e guarda o id do
--     coletor em id_origem;
--   * evento só do torneios.json mantém o id do coletor.
--
-- ATENÇÃO: o site lê esta tabela no build. Ordem de entrega: migração, seed e,
-- só então, deploy.
-- =============================================================================

begin;

${upsert}
${categorias}
commit;

-- Conferência:
select count(*) as total,
       count(*) filter (where listado) as listados,
       count(*) filter (where not listado) as nao_listados
from campeonatos;
select count(*) as categorias from categorias;
`;
}
