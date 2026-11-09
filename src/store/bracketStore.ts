// src/store/bracketStore.ts
//
// Bracket_Store — a ÚNICA fronteira de I/O da feature de chaveamento.
//
// Este módulo define a interface `BracketStore` (contrato "Bracket_Store" da
// seção Components do design.md) e uma implementação de navegador
// (`criarBracketStoreBrowser`) sobre o cliente público `supabase`
// (`src/lib/supabase.ts`), que depende das políticas de RLS do banco.
//
// Toda a lógica de domínio (validação de duplas/seeding, geração, progressão,
// serialização) é pura e vive em `src/domain`. Esta store apenas:
//   - valida duplas candidatas (R1.1–R1.4) reutilizando `pairs/validation.ts`,
//   - gera id e `criadoEm` na BORDA (a store é a borda de I/O; aqui o relógio
//     e `crypto.randomUUID()` são permitidos),
//   - traduz linhas ↔ domínio com os mappers de `mappers.ts`,
//   - mapeia erros de escrita → FALHA_PERSISTENCIA (R7.2) e de leitura →
//     FALHA_LEITURA (R7.6).
//
// Segurança para o browser: só importa `supabase` (cliente público) e código de
// domínio puro. Nada de `supabase.server.ts` (admin) aqui — a implementação de
// servidor da Fase 2a é um módulo separado que satisfaz a MESMA interface.

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Bracket,
  BracketConfig,
  Pair,
  PairId,
} from "../domain/bracket/types";
import type { Result } from "../domain/result";
import type { SeedAssignment } from "../domain/bracket/seeding";

import {
  listarDuplasOrdenadas,
  validarDuplaCandidata,
} from "../domain/pairs/validation";

import {
  bracketParaLinhas,
  duplaRowParaPair,
  linhasParaBracket,
  type ChaveamentoLinhas,
  type ChaveamentoRow,
  type DuplaRow,
  type GrupoDuplaRow,
  type GrupoRow,
  type JogoRow,
} from "./mappers";

// ---------------------------------------------------------------------------
// Tipos do contrato
// ---------------------------------------------------------------------------

/** Referência a uma categoria (unidade de chaveamento). */
export interface CategoryRef {
  campeonatoId: string;
  categoriaId: string;
}

/** Dados de entrada para criar uma dupla (R1.1). */
export interface NovaDupla {
  nomeDupla: string;
  atletaA: string;
  atletaB: string;
}

/**
 * Contrato de persistência do chaveamento. A UI e o domínio dependem apenas
 * desta interface; a implementação concreta (browser hoje, servidor na Fase 2a)
 * é intercambiável.
 */
export interface BracketStore {
  // Duplas (R1)
  adicionarDupla(ref: CategoryRef, dados: NovaDupla): Promise<Result<Pair>>;
  removerDupla(duplaId: PairId): Promise<Result<void>>; // bloqueia se há bracket (R1.6)
  listarDuplas(ref: CategoryRef): Promise<Result<Pair[]>>; // ordenação R1.7; vazio R1.8

  // Formato/seeding (R2/R3)
  salvarConfig(ref: CategoryRef, config: BracketConfig): Promise<Result<void>>;
  salvarSeeding(ref: CategoryRef, seeds: SeedAssignment[]): Promise<Result<void>>;

  // Chaveamento (R7)
  salvarChaveamento(ref: CategoryRef, bracket: Bracket): Promise<Result<void>>; // upsert/sobrescreve (R7.1)
  carregarChaveamento(ref: CategoryRef): Promise<Result<Bracket | null>>; // null => estado vazio (R7.4)
}

// ---------------------------------------------------------------------------
// Helpers internos de erro (bordas de I/O)
// ---------------------------------------------------------------------------

/** Falha de escrita (insert/update/delete/upsert) → FALHA_PERSISTENCIA (R7.2). */
function erroPersistencia(): Result<never> {
  return { ok: false, erro: { code: "FALHA_PERSISTENCIA" } };
}

/** Falha de leitura (select) → FALHA_LEITURA (R7.6). */
function erroLeitura(): Result<never> {
  return { ok: false, erro: { code: "FALHA_LEITURA" } };
}

/** Gera um identificador único na borda de I/O. */
function novoId(): string {
  return crypto.randomUUID();
}

/** Carimbo de criação/atualização na borda de I/O (ISO). */
function agoraISO(): string {
  return new Date().toISOString();
}

/**
 * Resolve o cliente público `supabase` SOB DEMANDA. O import é dinâmico de
 * propósito: `src/lib/supabase.ts` lança se as variáveis de ambiente do
 * Supabase estiverem ausentes, então importá-lo no topo deste módulo quebraria
 * qualquer consumidor (e os testes com cliente mockado) mesmo sem usar o
 * cliente real. Só quem chama `criarBracketStoreBrowser()` sem injetar um
 * `client` paga o custo de carregar o cliente real.
 */
async function clientePublicoPadrao(): Promise<SupabaseClient> {
  const mod = await import("../lib/supabase");
  return mod.supabase;
}

// ---------------------------------------------------------------------------
// Implementação browser (RLS)
// ---------------------------------------------------------------------------

/**
 * Cria a implementação de navegador do `BracketStore` sobre `supabase`.
 *
 * O `client` é injetável para permitir testes com um cliente mockado
 * (tarefa 14.3); em produção usa o cliente público real de `src/lib/supabase.ts`.
 *
 * ## Estratégia de sobrescrita de `salvarChaveamento` (R7.1)
 *
 * Um chaveamento é identificado unicamente pela categoria
 * (`chaveamentos.categoria_id UNIQUE`). Para sobrescrever de forma coerente:
 *   1. Faz-se `upsert` da linha `chaveamentos` com `onConflict: "categoria_id"`,
 *      obtendo o `id` da linha (novo ou existente).
 *   2. Apagam-se TODAS as linhas subordinadas desse chaveamento
 *      (`grupos` e `jogos` por `chaveamento_id`). Como `grupo_duplas` referencia
 *      `grupos` com `on delete cascade`, ela é limpa junto. Apaga-se `jogos`
 *      antes de `grupos` para respeitar a FK `jogos.grupo_id`.
 *   3. Reinsere-se o conteúdo novo (`grupos`, `grupo_duplas`, `jogos`) a partir
 *      de `bracketParaLinhas`.
 * Esse delete+insert garante que o estado final seja exatamente o novo bracket
 * (nenhum resíduo da versão anterior), que é a semântica de "sobrescreve" de R7.1.
 * As duplas (R1) são gerenciadas à parte e não são tocadas aqui.
 */
export function criarBracketStoreBrowser(
  client?: SupabaseClient,
): BracketStore {
  // Cliente injetado tem prioridade (testes/Fase 2a). Sem injeção, resolve o
  // cliente público real sob demanda (cacheado) — ver `clientePublicoPadrao`.
  let clienteCache: SupabaseClient | null = client ?? null;
  async function obterClient(): Promise<SupabaseClient> {
    if (clienteCache === null) {
      clienteCache = await clientePublicoPadrao();
    }
    return clienteCache;
  }

  return {
    // -----------------------------------------------------------------------
    // R1.1–R1.4: adicionar dupla
    // -----------------------------------------------------------------------
    async adicionarDupla(
      ref: CategoryRef,
      dados: NovaDupla,
    ): Promise<Result<Pair>> {
      const client = await obterClient();
      // Lê os nomes já existentes na categoria para checar unicidade (R1.4).
      let existentes: { nome_dupla: string }[];
      try {
        const { data, error } = await client
          .from("duplas")
          .select("nome_dupla")
          .eq("categoria_id", ref.categoriaId);
        if (error) return erroLeitura();
        existentes = data ?? [];
      } catch {
        return erroLeitura();
      }

      // Validação de domínio (R1.2, R1.3, R1.4) antes de qualquer escrita.
      const validada = validarDuplaCandidata(
        dados,
        existentes.map((d) => d.nome_dupla),
      );
      if (!validada.ok) return validada;

      // Gera id e criadoEm na borda; seed indefinido (0 => null na coluna) até
      // o seeding ser definido (R3).
      const pair: Pair = {
        id: novoId(),
        nomeDupla: dados.nomeDupla,
        atletaA: dados.atletaA,
        atletaB: dados.atletaB,
        seed: 0,
        criadoEm: agoraISO(),
      };

      const row: DuplaRow = {
        id: pair.id,
        categoria_id: ref.categoriaId,
        nome_dupla: pair.nomeDupla,
        atleta_a: pair.atletaA,
        atleta_b: pair.atletaB,
        seed: null, // null até seeding definido
        criado_em: pair.criadoEm,
      };

      try {
        const { error } = await client.from("duplas").insert(row);
        if (error) return erroPersistencia();
      } catch {
        return erroPersistencia();
      }

      return { ok: true, valor: pair };
    },

    // -----------------------------------------------------------------------
    // R1.5 / R1.6: remover dupla (bloqueia se a categoria já tem chaveamento)
    // -----------------------------------------------------------------------
    async removerDupla(duplaId: PairId): Promise<Result<void>> {
      const client = await obterClient();
      // Descobre a categoria da dupla para checar se há chaveamento.
      let categoriaId: string | null;
      try {
        const { data, error } = await client
          .from("duplas")
          .select("categoria_id")
          .eq("id", duplaId)
          .maybeSingle();
        if (error) return erroLeitura();
        categoriaId = data?.categoria_id ?? null;
      } catch {
        return erroLeitura();
      }

      // Dupla inexistente: nada a remover; trata como confirmação (idempotente).
      if (categoriaId === null) {
        return { ok: true, valor: undefined };
      }

      // Se já existe chaveamento para a categoria, a remoção é bloqueada (R1.6).
      try {
        const { data, error } = await client
          .from("chaveamentos")
          .select("id")
          .eq("categoria_id", categoriaId)
          .maybeSingle();
        if (error) return erroLeitura();
        if (data) {
          return { ok: false, erro: { code: "REMOCAO_BLOQUEADA" } };
        }
      } catch {
        return erroLeitura();
      }

      // Sem chaveamento: exclui a dupla (R1.5).
      try {
        const { error } = await client.from("duplas").delete().eq("id", duplaId);
        if (error) return erroPersistencia();
      } catch {
        return erroPersistencia();
      }

      return { ok: true, valor: undefined };
    },

    // -----------------------------------------------------------------------
    // R1.7 / R1.8: listar duplas (ordenadas; vazio quando não há duplas)
    // -----------------------------------------------------------------------
    async listarDuplas(ref: CategoryRef): Promise<Result<Pair[]>> {
      const client = await obterClient();
      let rows: DuplaRow[];
      try {
        const { data, error } = await client
          .from("duplas")
          .select("*")
          .eq("categoria_id", ref.categoriaId);
        if (error) return erroLeitura();
        rows = (data ?? []) as DuplaRow[];
      } catch {
        return erroLeitura();
      }

      const pares = rows.map(duplaRowParaPair);
      // Ordenação determinística por (nome em caixa baixa, criadoEm) (R1.7).
      // Lista vazia permanece vazia (R1.8).
      return { ok: true, valor: listarDuplasOrdenadas(pares) };
    },

    // -----------------------------------------------------------------------
    // R2: salvar configuração (formato + parâmetros) na categoria
    // -----------------------------------------------------------------------
    async salvarConfig(
      ref: CategoryRef,
      config: BracketConfig,
    ): Promise<Result<void>> {
      const client = await obterClient();
      try {
        const { error } = await client
          .from("categorias")
          .update({
            formato: config.formato,
            numero_grupos: config.numeroDeGrupos ?? null,
            classificados_por_grupo: config.classificadosPorGrupo ?? null,
          })
          .eq("id", ref.categoriaId);
        if (error) return erroPersistencia();
      } catch {
        return erroPersistencia();
      }
      return { ok: true, valor: undefined };
    },

    // -----------------------------------------------------------------------
    // R3: salvar seeding (posição por dupla) na coluna `duplas.seed`
    // -----------------------------------------------------------------------
    async salvarSeeding(
      _ref: CategoryRef,
      seeds: SeedAssignment[],
    ): Promise<Result<void>> {
      const client = await obterClient();
      // Grava a posição de cada dupla individualmente (um update por dupla).
      // Qualquer falha em qualquer update é reportada como FALHA_PERSISTENCIA.
      try {
        for (const s of seeds) {
          const { error } = await client
            .from("duplas")
            .update({ seed: s.posicao })
            .eq("id", s.pairId);
          if (error) return erroPersistencia();
        }
      } catch {
        return erroPersistencia();
      }
      return { ok: true, valor: undefined };
    },

    // -----------------------------------------------------------------------
    // R7.1: salvar chaveamento (upsert/sobrescreve por categoria)
    // -----------------------------------------------------------------------
    async salvarChaveamento(
      ref: CategoryRef,
      bracket: Bracket,
    ): Promise<Result<void>> {
      const client = await obterClient();
      try {
        // 1) Upsert da linha `chaveamentos` por categoria (unique categoria_id).
        const { data: chavData, error: chavErr } = await client
          .from("chaveamentos")
          .upsert(
            {
              categoria_id: ref.categoriaId,
              formato: bracket.formato,
              config_json: bracket.config,
              campea_id: bracket.campeaId,
              atualizado_em: agoraISO(),
            },
            { onConflict: "categoria_id" },
          )
          .select("id")
          .single();
        if (chavErr || !chavData) return erroPersistencia();

        const chaveamentoId: string = chavData.id;

        // 2) Limpa o conteúdo anterior deste chaveamento (sobrescrita, R7.1).
        //    `jogos` antes de `grupos` (FK jogos.grupo_id); `grupo_duplas` cai
        //    em cascata ao apagar `grupos`.
        const delJogos = await client
          .from("jogos")
          .delete()
          .eq("chaveamento_id", chaveamentoId);
        if (delJogos.error) return erroPersistencia();

        const delGrupos = await client
          .from("grupos")
          .delete()
          .eq("chaveamento_id", chaveamentoId);
        if (delGrupos.error) return erroPersistencia();

        // 3) Reinsere grupos, grupo_duplas e jogos a partir do novo bracket.
        const linhas = bracketParaLinhas(bracket, chaveamentoId);

        if (linhas.grupos.length > 0) {
          const insGrupos = await client.from("grupos").insert(linhas.grupos);
          if (insGrupos.error) return erroPersistencia();
        }

        if (linhas.grupoDuplas.length > 0) {
          const insGD = await client
            .from("grupo_duplas")
            .insert(linhas.grupoDuplas);
          if (insGD.error) return erroPersistencia();
        }

        if (linhas.jogos.length > 0) {
          const insJogos = await client.from("jogos").insert(linhas.jogos);
          if (insJogos.error) return erroPersistencia();
        }
      } catch {
        return erroPersistencia();
      }

      return { ok: true, valor: undefined };
    },

    // -----------------------------------------------------------------------
    // R7.3 / R7.4 / R7.6: carregar chaveamento (null quando não existe)
    // -----------------------------------------------------------------------
    async carregarChaveamento(
      ref: CategoryRef,
    ): Promise<Result<Bracket | null>> {
      const client = await obterClient();
      try {
        // 1) Chaveamento da categoria. Ausência => estado vazio (R7.4).
        const { data: chav, error: chavErr } = await client
          .from("chaveamentos")
          .select("*")
          .eq("categoria_id", ref.categoriaId)
          .maybeSingle();
        if (chavErr) return erroLeitura();
        if (!chav) return { ok: true, valor: null };

        const chaveamento = chav as ChaveamentoRow;
        const chaveamentoId: string = chaveamento.id;

        // 2) Duplas da categoria (snapshot usado na reconstrução).
        const duplasResp = await client
          .from("duplas")
          .select("*")
          .eq("categoria_id", ref.categoriaId);
        if (duplasResp.error) return erroLeitura();

        // 3) Grupos do chaveamento.
        const gruposResp = await client
          .from("grupos")
          .select("*")
          .eq("chaveamento_id", chaveamentoId);
        if (gruposResp.error) return erroLeitura();
        const grupos = (gruposResp.data ?? []) as GrupoRow[];

        // 4) Associações grupo ↔ dupla (filtradas pelos grupos deste chaveamento).
        let grupoDuplas: GrupoDuplaRow[] = [];
        if (grupos.length > 0) {
          const gdResp = await client
            .from("grupo_duplas")
            .select("*")
            .in(
              "grupo_id",
              grupos.map((g) => g.id),
            );
          if (gdResp.error) return erroLeitura();
          grupoDuplas = (gdResp.data ?? []) as GrupoDuplaRow[];
        }

        // 5) Jogos do chaveamento.
        const jogosResp = await client
          .from("jogos")
          .select("*")
          .eq("chaveamento_id", chaveamentoId);
        if (jogosResp.error) return erroLeitura();

        const linhas: ChaveamentoLinhas = {
          chaveamento,
          duplas: (duplasResp.data ?? []) as DuplaRow[],
          grupos,
          grupoDuplas,
          jogos: (jogosResp.data ?? []) as JogoRow[],
        };

        const bracket = linhasParaBracket(linhas);
        // `linhasParaBracket` deixa campeonatoId vazio; a store preenche a
        // partir do CategoryRef.
        bracket.campeonatoId = ref.campeonatoId;

        return { ok: true, valor: bracket };
      } catch {
        return erroLeitura();
      }
    },
  };
}
