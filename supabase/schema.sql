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
-- ATENÇÃO: as colunas do formato de eventos (cidade, uf, data_fim, ativo, ...)
-- são acrescentadas pelo bloco "EVENTOS" no fim deste arquivo.
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
  placar_a       int check (placar_a is null or placar_a >= 0),  -- pontos de dupla_a
  placar_b       int check (placar_b is null or placar_b >= 0),  -- pontos de dupla_b (sem empate)
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
-- Jogadores (perfil público) e vínculo com as duplas
-- -----------------------------------------------------------------------------
-- Cadastro estável de atletas. A `duplas` é uma INSCRIÇÃO por categoria e
-- guarda os atletas como texto livre (`atleta_a`/`atleta_b`); estes dois campos
-- CONTINUAM existindo e funcionam como foto do nome no momento da inscrição,
-- então renomear um jogador depois não altera chaveamentos já gerados.
--
-- O vínculo é feito por duas colunas OPCIONAIS em `duplas` (uma dupla tem
-- sempre 2 atletas): duplas antigas e inscrições com atleta convidado seguem
-- válidas só com texto. Um futuro ranking sai de `jogos.vencedor_id` →
-- `duplas` → `jogador_a_id`/`jogador_b_id`, sem tabela de pontos.
--
-- ATENÇÃO (privacidade): a leitura de todas as tabelas é pública. Por isso esta
-- tabela só guarda dados que podem ser exibidos a qualquer visitante: NÃO
-- adicione e-mail, telefone, CPF ou data de nascimento aqui. Dados privados
-- exigem uma tabela separada com RLS própria (Fase 2a, com autenticação).
-- =============================================================================
create table if not exists jogadores (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null check (char_length(btrim(nome)) between 1 and 80),
  apelido        text check (apelido is null or char_length(btrim(apelido)) between 1 and 40),
  genero         text check (genero is null or genero in ('masculino','feminino')),
  categoria      text check (categoria is null or char_length(btrim(categoria)) between 1 and 40),  -- nível do jogador (vocabulário em utils/categorias.ts, validado na aplicação)
  cidade         text check (cidade is null or char_length(btrim(cidade)) between 1 and 80),
  uf             char(2) check (uf is null or uf ~ '^[A-Z]{2}$'),
  instagram      text check (instagram is null or instagram ~ '^[a-z0-9._]{1,30}$'),  -- só o @usuario, sem "@"
  ativo          boolean not null default true,       -- false = arquivado (some das listagens)
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

-- Bancos que já aplicaram a versão anterior desta tabela (sem `categoria`)
-- ganham a coluna aqui; `if not exists` torna a linha inofensiva nos demais.
alter table jogadores
  add column if not exists categoria text
    check (categoria is null or char_length(btrim(categoria)) between 1 and 40);

-- Busca/ordenação por nome sem diferenciar caixa nem espaços nas pontas.
-- Nomes repetidos são PERMITIDOS (homônimos existem); o formulário só avisa.
create index if not exists jogadores_nome_idx on jogadores (lower(btrim(nome)));

-- Vínculo com a dupla. `on delete restrict`: um jogador com histórico não pode
-- ser apagado (a aplicação arquiva em vez disso).
alter table duplas
  add column if not exists jogador_a_id uuid references jogadores(id) on delete restrict,
  add column if not exists jogador_b_id uuid references jogadores(id) on delete restrict;

-- A mesma pessoa não pode ocupar os dois lugares da dupla.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'duplas_jogadores_distintos'
  ) then
    alter table duplas add constraint duplas_jogadores_distintos
      check (jogador_a_id is null or jogador_b_id is null or jogador_a_id <> jogador_b_id);
  end if;
end $$;

create index if not exists duplas_jogador_a_idx on duplas (jogador_a_id);
create index if not exists duplas_jogador_b_idx on duplas (jogador_b_id);

-- =============================================================================
-- Row Level Security (RLS) — com autenticação (Supabase Auth)
-- -----------------------------------------------------------------------------
-- Política atual:
--   * Leitura pública (select) liberada nas tabelas de eventos e jogadores.
--   * Escrita (insert/update/delete) só para administradores (eh_admin(), pelo
--     e-mail do JWT) nas tabelas de organização e em jogadores. Não existe mais
--     escrita anônima.
--   * Um usuário vinculado a um jogador edita só o próprio registro.
--   * `perfis` e `administradores` não têm leitura pública.
--   * `campeonatos` NÃO recebe escrita pela API: é populada pelo script de
--     migração idempotente usando o cliente admin (service role), que
--     contorna RLS.
-- =============================================================================

-- Habilita RLS por tabela.
alter table campeonatos  enable row level security;
alter table categorias   enable row level security;
alter table duplas       enable row level security;
alter table chaveamentos enable row level security;
alter table grupos       enable row level security;
alter table grupo_duplas enable row level security;
alter table jogos        enable row level security;
alter table jogadores    enable row level security;

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

drop policy if exists jogadores_select_publico on jogadores;
create policy jogadores_select_publico on jogadores
  for select using (true);

-- -----------------------------------------------------------------------------
-- AUTENTICAÇÃO (Supabase Auth) e ESCRITA
-- -----------------------------------------------------------------------------
-- Quem pode escrever: apenas administradores (e-mail listado em `administradores`).
-- Qualquer pessoa pode ENTRAR (Google ou link mágico), mas entrar não dá acesso
-- de escrita: o RLS confere o e-mail do JWT contra a tabela abaixo.
--
-- Como adicionar um administrador (no SQL Editor do Supabase):
--   insert into administradores (email) values ('pessoa@exemplo.com')
--     on conflict do nothing;
-- O e-mail é guardado em minúsculas.

create table if not exists administradores (
  email text primary key check (email = lower(btrim(email)))
);
alter table administradores enable row level security;
-- Sem nenhuma policy: a tabela NÃO é legível pela API (nem por anon, nem por
-- authenticated). Só a função eh_admin() (security definer) a consulta.
revoke all on administradores from anon, authenticated;

-- O usuário do JWT é administrador? Usada pelas policies e pelo site (rpc).
create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.administradores a
    where a.email = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
  );
$$;
revoke all on function public.eh_admin() from public;
grant execute on function public.eh_admin() to authenticated;

-- Perfil da conta (um por usuário de auth.users). Dados privados do usuário:
-- só ele mesmo lê e edita. `jogador_id` liga a conta a um jogador cadastrado;
-- `unique` impede dois donos para o mesmo jogador.
create table if not exists perfis (
  id             uuid primary key references auth.users(id) on delete cascade,
  nome           text check (nome is null or char_length(btrim(nome)) between 1 and 80),
  avatar_url     text check (avatar_url is null or char_length(avatar_url) <= 500),
  jogador_id     uuid unique references jogadores(id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
alter table perfis enable row level security;

drop policy if exists perfis_select_proprio on perfis;
create policy perfis_select_proprio on perfis
  for select to authenticated using (id = auth.uid());

drop policy if exists perfis_insert_proprio on perfis;
create policy perfis_insert_proprio on perfis
  for insert to authenticated with check (id = auth.uid());

drop policy if exists perfis_update_proprio on perfis;
create policy perfis_update_proprio on perfis
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Cria o perfil no primeiro login (nome e foto vêm do Google, quando houver).
create or replace function public.criar_perfil_no_primeiro_login()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (id, nome, avatar_url)
  values (
    new.id,
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), 80), ''),
    nullif(left(coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture', ''), 500), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists criar_perfil_no_primeiro_login on auth.users;
create trigger criar_perfil_no_primeiro_login
  after insert on auth.users
  for each row execute function public.criar_perfil_no_primeiro_login();

-- -----------------------------------------------------------------------------
-- Escrita nas tabelas de ORGANIZAÇÃO e em jogadores: só administradores.
-- As policies antigas `*_escrita_anon` (escrita anônima) são REMOVIDAS aqui, o
-- que também protege bancos que aplicaram a versão anterior deste arquivo.
-- -----------------------------------------------------------------------------
drop policy if exists categorias_escrita_anon   on categorias;
drop policy if exists duplas_escrita_anon       on duplas;
drop policy if exists chaveamentos_escrita_anon on chaveamentos;
drop policy if exists grupos_escrita_anon       on grupos;
drop policy if exists grupo_duplas_escrita_anon on grupo_duplas;
drop policy if exists jogos_escrita_anon        on jogos;
drop policy if exists jogadores_escrita_anon    on jogadores;

drop policy if exists categorias_escrita_admin on categorias;
create policy categorias_escrita_admin on categorias
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists duplas_escrita_admin on duplas;
create policy duplas_escrita_admin on duplas
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists chaveamentos_escrita_admin on chaveamentos;
create policy chaveamentos_escrita_admin on chaveamentos
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists grupos_escrita_admin on grupos;
create policy grupos_escrita_admin on grupos
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists grupo_duplas_escrita_admin on grupo_duplas;
create policy grupo_duplas_escrita_admin on grupo_duplas
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists jogos_escrita_admin on jogos;
create policy jogos_escrita_admin on jogos
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists jogadores_escrita_admin on jogadores;
create policy jogadores_escrita_admin on jogadores
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- Um usuário vinculado a um jogador (perfis.jogador_id) pode EDITAR só o próprio
-- registro em `jogadores`. Não cria nem apaga. Atenção: o vínculo é escolhido
-- pelo próprio usuário em /conta; se isso virar problema, passe a exigir
-- confirmação de um administrador antes de gravar `jogador_id`.
drop policy if exists jogadores_update_proprio on jogadores;
create policy jogadores_update_proprio on jogadores
  for update to authenticated
  using (exists (select 1 from perfis p where p.id = auth.uid() and p.jogador_id = jogadores.id))
  with check (exists (select 1 from perfis p where p.id = auth.uid() and p.jogador_id = jogadores.id));

-- -----------------------------------------------------------------------------
-- EVENTOS (formato do torneios.json)
-- -----------------------------------------------------------------------------
-- A tabela `campeonatos` passa a ter a mesma estrutura de um registro de
-- src/data/torneios.json: datas de início e fim, cidade/UF/endereço separados,
-- preço, link de inscrição e a origem do registro. O site lê esta tabela NO
-- BUILD (home, lista e detalhe) e só enxerga eventos com `ativo = true`.
--
-- `id` é a chave usada nas URLs (/campeonatos/<id>) e pelas categorias.
-- `id_origem` guarda o id que o coletor (torneios-ftv.com) gera para o evento;
-- difere de `id` nos eventos que já existiam no formato antigo, para os links
-- antigos continuarem funcionando (o build gera um redirecionamento).
--
-- `local` continua existindo só como texto de apoio de linhas antigas que não
-- têm cidade/UF/endereço preenchidos.
--
-- `ativo` = o evento existe (false = arquivado, some de tudo). `listado` = o
-- evento aparece na home e tem página de detalhe; eventos organizados à mão que
-- não vêm do calendário público ficam `ativo` e não `listado` (só têm as telas
-- de organizar e acompanhar).

alter table campeonatos
  add column if not exists data_fim      date,
  add column if not exists cidade        text,
  add column if not exists uf            char(2),
  add column if not exists endereco      text,
  add column if not exists preco         numeric(10,2),
  add column if not exists preco_texto   text,
  add column if not exists inscricao     text,
  add column if not exists fonte         text,
  add column if not exists id_origem     text,
  add column if not exists ativo         boolean not null default true,
  add column if not exists listado       boolean not null default true,
  add column if not exists atualizado_em timestamptz not null default now();

-- Campos que antes eram obrigatórios deixam de ser (eventos coletados não têm
-- foto nem descrição, e linhas novas não precisam de `local`).
alter table campeonatos
  alter column local     drop not null,
  alter column foto      drop not null,
  alter column descricao drop not null;
alter table campeonatos
  alter column foto      set default '',
  alter column descricao set default '';

-- Um id_origem identifica no máximo um evento (vários nulos são permitidos).
create unique index if not exists campeonatos_id_origem_unico
  on campeonatos (id_origem);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'campeonatos_uf_valida') then
    alter table campeonatos add constraint campeonatos_uf_valida
      check (uf is null or uf ~ '^[A-Z]{2}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'campeonatos_data_fim_valida') then
    alter table campeonatos add constraint campeonatos_data_fim_valida
      check (data_fim is null or data_fim >= data);
  end if;
end $$;

-- Leitura pública: apenas eventos ativos (arquivar = `ativo = false`).
drop policy if exists campeonatos_select_publico on campeonatos;
create policy campeonatos_select_publico on campeonatos
  for select using (ativo);
