-- =============================================================================
-- MIGRAÇÃO: colocação final de cada dupla (duplas.colocacao)
-- -----------------------------------------------------------------------------
-- Posição em que a dupla terminou a categoria (1 = campeã), calculada pelo
-- ranking final (src/domain/bracket/ranking.ts). Fica null enquanto a final não
-- foi decidida. A tela de organizar grava ao decidir/desfazer a final e limpa ao
-- gerar o chaveamento de novo. O perfil e a lista de jogadores leem daqui.
--
-- Aditiva: só cria uma coluna anulável. Não mexe em dados existentes.
-- Idempotente: pode ser executada mais de uma vez.
-- Aplicar: SQL Editor do Supabase -> colar tudo -> Run.
-- Depois: npx vite-node scripts/preencher-colocacoes.ts --aplicar (campeonatos já encerrados).
-- =============================================================================
alter table duplas
  add column if not exists colocacao int
    check (colocacao is null or colocacao >= 1);

-- Lista de jogadores: só as duplas com colocação interessam.
create index if not exists duplas_colocacao_idx
  on duplas (colocacao)
  where colocacao is not null;
