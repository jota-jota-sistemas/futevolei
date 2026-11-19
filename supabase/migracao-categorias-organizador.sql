-- =============================================================================
-- MIGRAÇÃO: proteção da remoção de categorias (organizador)
-- -----------------------------------------------------------------------------
-- Para bancos que JÁ aplicaram migracao-organizadores.sql. O site agora permite
-- criar e remover categorias de um campeonato (administrador e dono do evento).
-- Remover uma categoria apaga em CASCATA as duplas, o chaveamento e os jogos
-- dela; por isso o banco recusa essa remoção ao ORGANIZADOR quando há duplas
-- (a tela também confere antes, e mostra "Remova as duplas antes").
--
-- O administrador, o SQL Editor e os scripts de carga (service role) não são
-- afetados: o trigger só age sobre organizadores (mesmo padrão dos triggers de
-- migracao-organizadores.sql).
--
-- Idempotente: pode ser executada mais de uma vez.
-- Aplicar: SQL Editor do Supabase -> colar tudo -> Run (depois de
-- migracao-organizadores.sql).
--
-- Este conteúdo é o mesmo bloco "CATEGORIAS: PROTEÇÃO DE REMOÇÃO" do final de
-- schema.sql; em um banco novo basta rodar o schema.sql inteiro.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- CATEGORIAS: PROTEÇÃO DE REMOÇÃO
-- -----------------------------------------------------------------------------
-- O organizador (que não é administrador) não apaga categoria com duplas. O erro
-- é uma violação de chave estrangeira (23503): o site mostra a mensagem certa.
create or replace function public.proteger_categoria_com_duplas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.eh_organizador() and not public.eh_admin() then
    if exists (select 1 from public.duplas d where d.categoria_id = old.id) then
      raise exception 'CATEGORIA_COM_DUPLAS' using errcode = '23503';
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists proteger_categoria_com_duplas on categorias;
create trigger proteger_categoria_com_duplas
  before delete on categorias
  for each row execute function public.proteger_categoria_com_duplas();
