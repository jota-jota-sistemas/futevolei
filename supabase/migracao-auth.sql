-- =============================================================================
-- MIGRAÇÃO: login (Supabase Auth) e escrita só para administradores
-- -----------------------------------------------------------------------------
-- Para bancos que JÁ aplicaram o schema.sql anterior. Contém só o que mudou:
--   * tabelas administradores e perfis, função eh_admin() e trigger de perfil;
--   * remoção das policies de escrita anônima (*_escrita_anon);
--   * novas policies de escrita para administradores e de edição do próprio
--     jogador vinculado.
--
-- Pré-requisito: as tabelas de organização e jogadores já existem.
-- Idempotente: pode ser executada mais de uma vez.
-- Aplicar: SQL Editor do Supabase -> colar tudo -> Run.
-- Depois: inserir o primeiro administrador (exemplo no fim deste arquivo).
--
-- ATENÇÃO: logo após rodar, ninguém consegue escrever até existir ao menos um
-- administrador em `administradores`.
--
-- Este conteúdo é o mesmo bloco "AUTENTICAÇÃO" do final de schema.sql; em um
-- banco novo basta rodar o schema.sql inteiro.
-- =============================================================================

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
-- Primeiro administrador (troque o e-mail, em minúsculas, e rode):
-- -----------------------------------------------------------------------------
-- insert into administradores (email) values ('voce@exemplo.com')
--   on conflict do nothing;

-- =============================================================================
-- OPCIONAL: dados de exemplo para TESTAR o fluxo de login
-- -----------------------------------------------------------------------------
-- Tudo comentado de propósito: não rode em produção sem querer. Para usar,
-- tire os "-- " das linhas desejadas. O SQL Editor ignora o RLS, então os
-- inserts funcionam.
-- =============================================================================

-- 1) Jogadores de exemplo (para testar o vínculo em /conta e o gerenciamento).
-- insert into jogadores (nome, apelido, genero, cidade, uf, instagram)
-- select * from (values
--   ('Ana Souza',    'Aninha', 'feminino',  'São Paulo', 'SP', 'ana.souza'),
--   ('Bruno Lima',   'Bru',    'masculino', 'Santos',    'SP', 'brunolima'),
--   ('Carla Mendes', null,     'feminino',  'Campinas',  'SP', null),
--   ('Diego Alves',  'Dig',    'masculino', 'Cotia',     'SP', 'diegoalves')
-- ) as v(nome, apelido, genero, cidade, uf, instagram)
-- where not exists (select 1 from jogadores j where j.nome = v.nome);

-- 2) Conferir administradores, jogadores e contas que já entraram.
--    (o perfil é criado no primeiro login)
-- select email from administradores;
-- select id, nome, apelido, cidade from jogadores order by nome;
-- select u.email, p.nome, p.jogador_id
--   from auth.users u left join perfis p on p.id = u.id;

-- 3) Refazer o teste.
-- Liberar o vínculo de uma conta com um jogador:
-- update perfis set jogador_id = null
--   where id = (select id from auth.users where email = 'voce@exemplo.com');
-- Tirar o acesso de administrador:
-- delete from administradores where email = 'voce@exemplo.com';

-- Roteiro de teste:
--   a) Visitante: /gerenciar_jogadores deve ir para /entrar.
--   b) Conta comum (e-mail fora de administradores): "Acesso restrito" e menu
--      só com "Minha conta".
--   c) Em /conta, vincule "Ana Souza"; vincular o mesmo jogador a outra conta
--      deve dar "já está vinculado a outra conta".
--   d) Conta administradora: /gerenciar_jogadores e /campeonatos/<id>/organizar
--      abrem, e o menu mostra "Gerenciar".
