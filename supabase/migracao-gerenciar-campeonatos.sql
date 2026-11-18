-- =============================================================================
-- MIGRAÇÃO: gerenciar campeonatos (eventos) pelo site
-- -----------------------------------------------------------------------------
-- Para bancos que JÁ aplicaram o schema.sql com o bloco "EVENTOS". Contém só o
-- que muda para a área /gerenciar_campeonatos:
--   * administradores (eh_admin()) leem TODOS os eventos, inclusive arquivados
--     (a leitura pública continua mostrando só os ativos);
--   * administradores criam, alteram e excluem eventos.
--
-- Idempotente: pode ser executada mais de uma vez.
-- Aplicar: SQL Editor do Supabase -> colar tudo -> Run.
--
-- ATENÇÃO: excluir um evento apaga em cascata categorias, duplas, chaveamentos
-- e jogos. A tela só exclui eventos SEM categorias; com categorias, arquiva.
--
-- Este conteúdo é o mesmo bloco "GERENCIAR CAMPEONATOS" do final de schema.sql;
-- em um banco novo basta rodar o schema.sql inteiro.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- GERENCIAR CAMPEONATOS (escrita por administradores)
-- -----------------------------------------------------------------------------
-- A leitura pública (campeonatos_select_publico) segue mostrando só `ativo`.
-- Políticas permissivas se somam (OR): o admin lê também os arquivados.
drop policy if exists campeonatos_select_admin on campeonatos;
create policy campeonatos_select_admin on campeonatos
  for select to authenticated using (public.eh_admin());

drop policy if exists campeonatos_escrita_admin on campeonatos;
create policy campeonatos_escrita_admin on campeonatos
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
