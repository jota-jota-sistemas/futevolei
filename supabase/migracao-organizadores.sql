-- =============================================================================
-- MIGRAÇÃO: organizadores (papel, donos de evento e escrita por organizador)
-- -----------------------------------------------------------------------------
-- Para bancos que JÁ aplicaram o schema.sql com os blocos de autenticação,
-- eventos e "GERENCIAR CAMPEONATOS" (migracao-gerenciar-campeonatos.sql).
-- Contém só o que muda para um organizador gerenciar os PRÓPRIOS eventos:
--   * tabela `organizadores`: qualquer conta logada se cadastra (pelo botão
--     "Quero ser organizador" em /conta) e lê só o próprio registro;
--   * tabela `campeonato_organizadores`: os donos de cada evento (vários donos);
--   * funções eh_organizador() e pode_gerenciar_*() (admin OU dono);
--   * policies de escrita do organizador em campeonatos e nas tabelas de
--     organização (categorias, duplas, chaveamentos, grupos e jogos);
--   * triggers: o criador vira dono, o organizador não altera id/fonte/id_origem,
--     não apaga evento com categorias e não remove o último dono.
--
-- Idempotente: pode ser executada mais de uma vez.
-- Aplicar: SQL Editor do Supabase -> colar tudo -> Run (depois da migração
-- migracao-gerenciar-campeonatos.sql).
--
-- Remover alguém do papel (SQL Editor):
--   delete from organizadores where email = 'pessoa@exemplo.com';
-- Isso também remove a pessoa dos donos dos eventos (cascata); eventos que
-- ficarem sem dono passam a ser geridos só por administradores.
--
-- Este conteúdo é o mesmo bloco "ORGANIZADORES" do final de schema.sql; em um
-- banco novo basta rodar o schema.sql inteiro.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ORGANIZADORES (papel, donos e escrita por organizador)
-- -----------------------------------------------------------------------------
-- Papel de organizador: aberto a qualquer conta logada (sem aprovação). O
-- e-mail vem SEMPRE do JWT do login verificado (Google ou link mágico), nunca
-- de um campo digitado. Entrar no site não dá acesso a evento nenhum: o
-- organizador só gerencia os eventos em que é DONO (`campeonato_organizadores`).
-- Eventos sem dono (coletados e seed) só os administradores gerenciam.

-- E-mail da conta logada (minúsculas, sem espaços nas pontas); '' sem login.
create or replace function public.email_logado()
returns text
language sql
stable
as $$
  select lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public.email_logado() from public;
grant execute on function public.email_logado() to authenticated;

create table if not exists organizadores (
  email     text primary key check (email = lower(btrim(email)) and email <> ''),
  criado_em timestamptz not null default now()
);
alter table organizadores enable row level security;
revoke all on organizadores from anon;

-- A conta logada é de um organizador? Usada pelas policies e pelo site (rpc).
create or replace function public.eh_organizador()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organizadores o
    where o.email = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
  );
$$;
revoke all on function public.eh_organizador() from public;
grant execute on function public.eh_organizador() to authenticated;

-- Cada conta lê e cria só o PRÓPRIO registro; o administrador lê e remove todos.
drop policy if exists organizadores_select_proprio on organizadores;
create policy organizadores_select_proprio on organizadores
  for select to authenticated using (email = public.email_logado());

drop policy if exists organizadores_select_admin on organizadores;
create policy organizadores_select_admin on organizadores
  for select to authenticated using (public.eh_admin());

drop policy if exists organizadores_insert_proprio on organizadores;
create policy organizadores_insert_proprio on organizadores
  for insert to authenticated with check (email = public.email_logado());

drop policy if exists organizadores_delete_admin on organizadores;
create policy organizadores_delete_admin on organizadores
  for delete to authenticated using (public.eh_admin());

-- Donos de cada evento. A FK em `organizadores` garante que só um organizador
-- pode ser dono; remover o organizador (ou o evento) remove o vínculo.
create table if not exists campeonato_organizadores (
  campeonato_id text not null references campeonatos(id) on delete cascade,
  email         text not null references organizadores(email) on delete cascade,
  criado_em     timestamptz not null default now(),
  primary key (campeonato_id, email)
);
create index if not exists campeonato_organizadores_email_idx
  on campeonato_organizadores (email);
alter table campeonato_organizadores enable row level security;
revoke all on campeonato_organizadores from anon;

-- A conta logada é administradora OU dona do evento?
create or replace function public.pode_gerenciar_campeonato(p_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.eh_admin() or exists (
    select 1 from public.campeonato_organizadores co
    where co.campeonato_id = p_id
      and co.email = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
  );
$$;
revoke all on function public.pode_gerenciar_campeonato(text) from public;
grant execute on function public.pode_gerenciar_campeonato(text) to authenticated;

-- Helpers que seguem a cadeia de posse: categoria -> evento; dupla e
-- chaveamento -> categoria.
create or replace function public.pode_gerenciar_categoria(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.categorias c
    where c.id = p_id and public.pode_gerenciar_campeonato(c.campeonato_id)
  );
$$;
revoke all on function public.pode_gerenciar_categoria(uuid) from public;
grant execute on function public.pode_gerenciar_categoria(uuid) to authenticated;

create or replace function public.pode_gerenciar_dupla(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.duplas d
    where d.id = p_id and public.pode_gerenciar_categoria(d.categoria_id)
  );
$$;
revoke all on function public.pode_gerenciar_dupla(uuid) from public;
grant execute on function public.pode_gerenciar_dupla(uuid) to authenticated;

create or replace function public.pode_gerenciar_chaveamento(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chaveamentos ch
    where ch.id = p_id and public.pode_gerenciar_categoria(ch.categoria_id)
  );
$$;
revoke all on function public.pode_gerenciar_chaveamento(uuid) from public;
grant execute on function public.pode_gerenciar_chaveamento(uuid) to authenticated;

-- Donos do evento: o dono (e o administrador) vê, adiciona e remove donos.
drop policy if exists campeonato_organizadores_select on campeonato_organizadores;
create policy campeonato_organizadores_select on campeonato_organizadores
  for select to authenticated using (public.pode_gerenciar_campeonato(campeonato_id));

drop policy if exists campeonato_organizadores_insert on campeonato_organizadores;
create policy campeonato_organizadores_insert on campeonato_organizadores
  for insert to authenticated with check (public.pode_gerenciar_campeonato(campeonato_id));

drop policy if exists campeonato_organizadores_delete on campeonato_organizadores;
create policy campeonato_organizadores_delete on campeonato_organizadores
  for delete to authenticated using (public.pode_gerenciar_campeonato(campeonato_id));

-- Campeonatos: o organizador vê (inclusive arquivados), altera, apaga e cria os
-- PRÓPRIOS. As policies de administrador continuam valendo (permissivas somam).
drop policy if exists campeonatos_select_organizador on campeonatos;
create policy campeonatos_select_organizador on campeonatos
  for select to authenticated using (public.pode_gerenciar_campeonato(id));

drop policy if exists campeonatos_update_organizador on campeonatos;
create policy campeonatos_update_organizador on campeonatos
  for update to authenticated
  using (public.pode_gerenciar_campeonato(id))
  with check (public.pode_gerenciar_campeonato(id));

drop policy if exists campeonatos_delete_organizador on campeonatos;
create policy campeonatos_delete_organizador on campeonatos
  for delete to authenticated using (public.pode_gerenciar_campeonato(id));

drop policy if exists campeonatos_insert_organizador on campeonatos;
create policy campeonatos_insert_organizador on campeonatos
  for insert to authenticated
  with check (public.eh_organizador() and fonte = 'manual' and id_origem is null);

-- Tabelas de organização: o organizador escreve só nos eventos que gerencia.
-- Referências a duplas também precisam ser de eventos dele.
drop policy if exists categorias_escrita_organizador on categorias;
create policy categorias_escrita_organizador on categorias
  for all to authenticated
  using (public.pode_gerenciar_campeonato(campeonato_id))
  with check (public.pode_gerenciar_campeonato(campeonato_id));

drop policy if exists duplas_escrita_organizador on duplas;
create policy duplas_escrita_organizador on duplas
  for all to authenticated
  using (public.pode_gerenciar_categoria(categoria_id))
  with check (public.pode_gerenciar_categoria(categoria_id));

drop policy if exists chaveamentos_escrita_organizador on chaveamentos;
create policy chaveamentos_escrita_organizador on chaveamentos
  for all to authenticated
  using (public.pode_gerenciar_categoria(categoria_id))
  with check (
    public.pode_gerenciar_categoria(categoria_id)
    and (campea_id is null or public.pode_gerenciar_dupla(campea_id))
  );

drop policy if exists grupos_escrita_organizador on grupos;
create policy grupos_escrita_organizador on grupos
  for all to authenticated
  using (public.pode_gerenciar_chaveamento(chaveamento_id))
  with check (public.pode_gerenciar_chaveamento(chaveamento_id));

drop policy if exists grupo_duplas_escrita_organizador on grupo_duplas;
create policy grupo_duplas_escrita_organizador on grupo_duplas
  for all to authenticated
  using (
    exists (
      select 1 from grupos g
      where g.id = grupo_duplas.grupo_id and public.pode_gerenciar_chaveamento(g.chaveamento_id)
    )
  )
  with check (
    exists (
      select 1 from grupos g
      where g.id = grupo_duplas.grupo_id and public.pode_gerenciar_chaveamento(g.chaveamento_id)
    )
    and public.pode_gerenciar_dupla(dupla_id)
  );

drop policy if exists jogos_escrita_organizador on jogos;
create policy jogos_escrita_organizador on jogos
  for all to authenticated
  using (public.pode_gerenciar_chaveamento(chaveamento_id))
  with check (
    public.pode_gerenciar_chaveamento(chaveamento_id)
    and (dupla_a is null or public.pode_gerenciar_dupla(dupla_a))
    and (dupla_b is null or public.pode_gerenciar_dupla(dupla_b))
    and (vencedor_id is null or public.pode_gerenciar_dupla(vencedor_id))
  );

-- Trigger (a): quem cria um evento sendo organizador (e não administrador)
-- vira dono dele, dentro do banco (não depende do site).
create or replace function public.vincular_criador_ao_campeonato()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.eh_organizador() and not public.eh_admin() then
    insert into public.campeonato_organizadores (campeonato_id, email)
    values (new.id, public.email_logado())
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists vincular_criador_ao_campeonato on campeonatos;
create trigger vincular_criador_ao_campeonato
  after insert on campeonatos
  for each row execute function public.vincular_criador_ao_campeonato();

-- Trigger (b): o organizador (que não é administrador) não altera `id`,
-- `fonte` nem `id_origem`. Scripts de carga (service role, SQL Editor) não são
-- organizadores e seguem livres.
create or replace function public.proteger_campos_do_campeonato()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.eh_organizador() and not public.eh_admin() then
    if new.id is distinct from old.id
       or new.fonte is distinct from old.fonte
       or new.id_origem is distinct from old.id_origem then
      raise exception 'CAMPOS_PROTEGIDOS' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_campos_do_campeonato on campeonatos;
create trigger proteger_campos_do_campeonato
  before update on campeonatos
  for each row execute function public.proteger_campos_do_campeonato();

-- Trigger (c): o organizador não apaga evento com categorias (a cascata
-- apagaria duplas, chaveamentos e jogos). O erro é uma violação de chave
-- estrangeira (23503): o site arquiva o evento em vez de apagar.
create or replace function public.proteger_campeonato_com_categorias()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.eh_organizador() and not public.eh_admin() then
    if exists (select 1 from public.categorias c where c.campeonato_id = old.id) then
      raise exception 'CAMPEONATO_COM_CATEGORIAS' using errcode = '23503';
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists proteger_campeonato_com_categorias on campeonatos;
create trigger proteger_campeonato_com_categorias
  before delete on campeonatos
  for each row execute function public.proteger_campeonato_com_categorias();

-- Trigger (d): o organizador não remove o ÚLTIMO dono do evento (ele ficaria
-- sem dono). Quando o próprio evento está sendo apagado, a remoção em cascata
-- é permitida.
create or replace function public.proteger_ultimo_dono()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.eh_organizador() and not public.eh_admin() then
    if exists (select 1 from public.campeonatos c where c.id = old.campeonato_id)
       and not exists (
         select 1 from public.campeonato_organizadores co
         where co.campeonato_id = old.campeonato_id and co.email <> old.email
       ) then
      raise exception 'ULTIMO_DONO' using errcode = 'P0001';
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists proteger_ultimo_dono on campeonato_organizadores;
create trigger proteger_ultimo_dono
  before delete on campeonato_organizadores
  for each row execute function public.proteger_ultimo_dono();
