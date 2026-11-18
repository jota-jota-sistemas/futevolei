-- =============================================================================
-- MIGRAÇÃO: eventos no formato do torneios.json
-- -----------------------------------------------------------------------------
-- Para bancos que JÁ aplicaram o schema.sql anterior. Contém só o que mudou na
-- tabela `campeonatos`:
--   * colunas data_fim, cidade, uf, endereco, preco, preco_texto, inscricao,
--     fonte, id_origem (único), ativo, listado e atualizado_em;
--   * local, foto e descricao deixam de ser obrigatórios;
--   * checks de UF e de data_fim;
--   * leitura pública passa a mostrar só eventos ativos.
--
-- Idempotente: pode ser executada mais de uma vez.
-- Aplicar: SQL Editor do Supabase -> colar tudo -> Run.
-- Depois: rodar supabase/seed-eventos.sql para carregar os eventos.
--
-- ATENÇÃO: o site lê esta tabela no build. Ordem de entrega: migração, seed e,
-- só então, deploy.
--
-- Este conteúdo é o mesmo bloco "EVENTOS" do final de schema.sql; em um banco
-- novo basta rodar o schema.sql inteiro.
-- =============================================================================

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
