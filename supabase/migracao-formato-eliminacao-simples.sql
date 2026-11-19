-- =============================================================================
-- MIGRAÇÃO: formato "eliminação simples" nas categorias
-- -----------------------------------------------------------------------------
-- A tela de organização oferece "Eliminação simples" e o domínio a gera, mas o
-- `check` de categorias.formato só aceitava 'fase de grupos' e 'dupla
-- eliminação': escolher esse formato falhava ao salvar. Esta migração troca o
-- `check` para aceitar os três formatos.
--
-- Não mexe em dados. A tabela chaveamentos não tem `check` de formato.
-- Idempotente: pode ser executada mais de uma vez.
-- Aplicar: SQL Editor do Supabase -> colar tudo -> Run.
--
-- Em um banco novo basta rodar o schema.sql inteiro (o `check` já está atualizado).
-- =============================================================================
alter table categorias drop constraint if exists categorias_formato_check;
alter table categorias
  add constraint categorias_formato_check
  check (formato in ('fase de grupos','dupla eliminação','eliminação simples'));
