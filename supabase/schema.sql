-- =============================================================================
-- Esquema Supabase (Postgres) — spec: criar-chaveamento-campeonato
-- -----------------------------------------------------------------------------
-- Artefato versionado. APLIQUE MANUALMENTE (ex.: SQL Editor do Supabase ou
-- `psql`/`supabase db` contra o banco desejado). Este arquivo NÃO é aplicado
-- automaticamente pelo build.
--
-- Fonte de verdade do chaveamento. Os campeonatos migram de
-- `src/data/campeonatos.json` para a tabela `campeonatos`, mantendo o mesmo
-- `id` (string) como chave, de modo que URLs e o tipo `Campeonato` existente
-- continuem válidos.
--
-- Organização por categoria: `formato`, `numero_grupos` e
-- `classificados_por_grupo` vivem em `categorias`, nunca no campeonato. Duas
-- categorias do mesmo campeonato podem ter formatos diferentes.
-- =============================================================================

-- Extensão necessária para `gen_random_uuid()`.
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Campeonatos (migração do JSON atual; mesmo shape do tipo Campeonato)
-- -----------------------------------------------------------------------------
create table if not exists campeonatos (
  id          text primary key,              -- mesmo id usado hoje no JSON e nas URLs
  nome        text not null,
  data        date not null,
  local       text not null,
  foto        text not null,
  descricao   text not null,
  instagram   text,
  criado_em   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Categorias (antes: array estático "categorias?" em Campeonato)
-- O formato e os parâmetros de grupos são definidos POR CATEGORIA.
-- -----------------------------------------------------------------------------
create table if not exists categorias (
  id              uuid primary key default gen_random_uuid(),
  campeonato_id   text not null references campeonatos(id) on delete cascade,
  nome            text not null,             -- ex.: "Open"
  formato         text check (formato in ('fase de grupos','dupla eliminação')),
  numero_grupos           int,               -- só "fase de grupos"
  classificados_por_grupo int,               -- só "fase de grupos"
  criado_em       timestamptz not null default now(),
  unique (campeonato_id, nome)
);

-- -----------------------------------------------------------------------------
-- Duplas (R1)
-- -----------------------------------------------------------------------------
create table if not exists duplas (
  id             uuid primary key default gen_random_uuid(),
  categoria_id   uuid not null references categorias(id) on delete cascade,
  nome_dupla     text not null check (char_length(btrim(nome_dupla)) between 1 and 80),
  atleta_a       text not null check (char_length(btrim(atleta_a)) between 1 and 80),
  atleta_b       text not null check (char_length(btrim(atleta_b)) between 1 and 80),
  seed           int,                         -- 1..N; null até seeding definido
  criado_em      timestamptz not null default now()
);

-- Nome único por categoria, case-insensitive e ignorando espaços nas pontas
-- (R1.4). Como a unicidade é sobre uma EXPRESSÃO (lower(btrim(...))), o Postgres
-- exige um índice único por expressão separado — não é possível declará-la como
-- `unique (...)` inline no CREATE TABLE.
create unique index if not exists duplas_categoria_nome_unico
  on duplas (categoria_id, (lower(btrim(nome_dupla))));

-- -----------------------------------------------------------------------------
-- Chaveamento: um por categoria (R7.1 sobrescreve)
-- -----------------------------------------------------------------------------
create table if not exists chaveamentos (
  id             uuid primary key default gen_random_uuid(),
  categoria_id   uuid not null unique references categorias(id) on delete cascade,
  formato        text not null,
  config_json    jsonb not null,              -- snapshot da BracketConfig
  campea_id      uuid references duplas(id),  -- R6.7
  atualizado_em  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Grupos (só "fase de grupos")
-- -----------------------------------------------------------------------------
-- `id` é TEXT (não uuid): o domínio usa identificadores de grupo ESTÁVEIS e
-- determinísticos gerados pelo `Bracket_Generator` (ex.: "grupo-0"). Os mappers
-- (src/store/mappers.ts) preservam `grupos.id === Group.id`, garantindo o
-- round-trip carregar(salvar(b)) ≡ b sem tabela de tradução. NÃO há default:
-- o id vem sempre do domínio.
create table if not exists grupos (
  id             text primary key,
  chaveamento_id uuid not null references chaveamentos(id) on delete cascade,
  indice         int not null,                -- 0-based, ordem determinística
  unique (chaveamento_id, indice)
);

create table if not exists grupo_duplas (
  grupo_id  text not null references grupos(id) on delete cascade,
  dupla_id  uuid not null references duplas(id) on delete cascade,
  primary key (grupo_id, dupla_id)
);

-- -----------------------------------------------------------------------------
-- Jogos (matches): upper, lower, grande final e round-robin de grupo.
-- As ligações `avanca_*`/`encaminha_*` materializam o grafo do bracket, para
-- reconstruir a progressão de forma determinística a partir do banco.
-- -----------------------------------------------------------------------------
-- `id`, `grupo_id` e as ligações de avanço (`avanca_*_para`,
-- `encaminha_*_para`) são TEXT: materializam o grafo do bracket usando os
-- MatchId/GroupId ESTÁVEIS do domínio (ex.: "upper-r1-j0", "grupo-0-s1-s2",
-- "grupo-0"). Os mappers preservam `jogos.id === Match.id`, então o valor de
-- `avanca_vencedor_para` já É o MatchId de destino — reconstruir o grafo é
-- direto e determinístico, sem tradução uuid↔string. As FKs que apontam para
-- `duplas` (dupla_a/dupla_b/vencedor_id) seguem uuid, pois os PairId são uuids
-- reais gerados pela store.
create table if not exists jogos (
  id             text primary key,
  chaveamento_id uuid not null references chaveamentos(id) on delete cascade,
  side           text not null check (side in ('upper','lower','grande-final','grupo')),
  grupo_id       text references grupos(id) on delete cascade,  -- quando side='grupo'
  rodada         int not null,
  ordem          int not null,                -- posição estável na rodada
  dupla_a        uuid references duplas(id),  -- null = indefinido
  dupla_b        uuid references duplas(id),
  a_bye          boolean not null default false,
  b_bye          boolean not null default false,
  vencedor_id    uuid references duplas(id),
  registrado_em  timestamptz,
  ordem_disputa  int,                         -- número do jogo na fila do torneio (null = não numerado)
  avanca_vencedor_para text references jogos(id),
  avanca_vencedor_slot text check (avanca_vencedor_slot in ('a','b')),
  encaminha_perdedor_para text references jogos(id),
  encaminha_perdedor_slot text check (encaminha_perdedor_slot in ('a','b'))
);

-- Unicidade da posição (rodada, ordem) de um jogo dentro do seu chaveamento.
-- Para jogos de GRUPO, a `ordem` reinicia em 0 por grupo, então a unicidade
-- precisa incluir `grupo_id` — senão o jogo 0 do grupo 0 colide com o jogo 0
-- do grupo 1. Para jogos de MATA-MATA (grupo_id IS NULL), a unicidade é por
-- (side, rodada, ordem). Usamos DOIS índices únicos parciais:
create unique index if not exists jogos_grupo_pos_unico
  on jogos (chaveamento_id, grupo_id, rodada, ordem)
  where grupo_id is not null;

create unique index if not exists jogos_matamata_pos_unico
  on jogos (chaveamento_id, side, rodada, ordem)
  where grupo_id is null;

create index if not exists jogos_chaveamento_side_rodada_ordem_idx
  on jogos (chaveamento_id, side, rodada, ordem);

-- =============================================================================
-- Row Level Security (RLS) — VERSÃO ATUAL (sem autenticação)
-- -----------------------------------------------------------------------------
-- Política desta fase:
--   * Leitura pública (select) liberada em TODAS as tabelas.
--   * Escrita (insert/update/delete) permitida ao papel anônimo (anon) APENAS
--     nas tabelas de organização: categorias, duplas, chaveamentos, grupos,
--     grupo_duplas e jogos. É a barreira mínima enquanto não há auth (R9.3).
--   * `campeonatos` NÃO recebe escrita anon: é populada pelo script de
--     migração idempotente usando o cliente admin (service role), que
--     contorna RLS.
--
-- FASE 2a (futuro): as políticas de escrita abaixo passarão a exigir papel
-- AUTENTICADO (ex.: `to authenticated`) e as escritas migrarão para rotas de
-- servidor usando o cliente admin. NÃO habilite escrita autenticada aqui ainda.
-- =============================================================================

-- Habilita RLS por tabela.
alter table campeonatos  enable row level security;
alter table categorias   enable row level security;
alter table duplas       enable row level security;
alter table chaveamentos enable row level security;
alter table grupos       enable row level security;
alter table grupo_duplas enable row level security;
alter table jogos        enable row level security;

-- -----------------------------------------------------------------------------
-- Leitura pública (select) em TODAS as tabelas.
-- -----------------------------------------------------------------------------
drop policy if exists campeonatos_select_publico on campeonatos;
create policy campeonatos_select_publico on campeonatos
  for select using (true);

drop policy if exists categorias_select_publico on categorias;
create policy categorias_select_publico on categorias
  for select using (true);

drop policy if exists duplas_select_publico on duplas;
create policy duplas_select_publico on duplas
  for select using (true);

drop policy if exists chaveamentos_select_publico on chaveamentos;
create policy chaveamentos_select_publico on chaveamentos
  for select using (true);

drop policy if exists grupos_select_publico on grupos;
create policy grupos_select_publico on grupos
  for select using (true);

drop policy if exists grupo_duplas_select_publico on grupo_duplas;
create policy grupo_duplas_select_publico on grupo_duplas
  for select using (true);

drop policy if exists jogos_select_publico on jogos;
create policy jogos_select_publico on jogos
  for select using (true);

-- -----------------------------------------------------------------------------
-- Escrita anônima (anon) nas tabelas de ORGANIZAÇÃO apenas.
-- FASE 2a: trocar `to anon` por `to authenticated` em cada policy abaixo.
-- -----------------------------------------------------------------------------
drop policy if exists categorias_escrita_anon on categorias;
create policy categorias_escrita_anon on categorias
  for all to anon using (true) with check (true);

drop policy if exists duplas_escrita_anon on duplas;
create policy duplas_escrita_anon on duplas
  for all to anon using (true) with check (true);

drop policy if exists chaveamentos_escrita_anon on chaveamentos;
create policy chaveamentos_escrita_anon on chaveamentos
  for all to anon using (true) with check (true);

drop policy if exists grupos_escrita_anon on grupos;
create policy grupos_escrita_anon on grupos
  for all to anon using (true) with check (true);

drop policy if exists grupo_duplas_escrita_anon on grupo_duplas;
create policy grupo_duplas_escrita_anon on grupo_duplas
  for all to anon using (true) with check (true);

drop policy if exists jogos_escrita_anon on jogos;
create policy jogos_escrita_anon on jogos
  for all to anon using (true) with check (true);
