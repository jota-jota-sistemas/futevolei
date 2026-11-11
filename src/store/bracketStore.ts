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
  Match,
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
  matchParaJogoRow,
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
  /**
   * Vínculos OPCIONAIS com jogadores cadastrados (ids de `jogadores`). Ausente
   * ou inválido = dupla só com texto, como antes. Alimenta o histórico de
   * duplas do perfil do jogador.
   */
  jogadorAId?: string | null;
  jogadorBId?: string | null;
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
  /**
   * Grava SÓ os jogos informados (upsert em lote, sem apagar nada) e a campeã.
   * Caminho rápido para registrar placar: uma ida ao banco para os jogos, em
   * paralelo com a atualização do chaveamento. O chaveamento já deve existir.
   */
  salvarJogos(
    ref: CategoryRef,
    jogos: ReadonlyArray<Match>,
    campeaId: PairId | null,
  ): Promise<Result<void>>;
  /**
   * Assina, via Supabase Realtime, as mudanças do chaveamento da categoria
   * (jogos e linha do chaveamento). `aoMudar` é chamado a cada evento; quem
   * chama decide como recarregar. Devolve a função que cancela a assinatura.
   * Falhas de conexão não lançam: a tela segue funcionando sem tempo real.
   */
  assinarMudancas(ref: CategoryRef, aoMudar: () => void): Promise<() => void>;
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id de jogador utilizável: UUID válido ou null (qualquer outra coisa é ignorada). */
function idDeJogador(valor: string | null | undefined): string | null {
  return typeof valor === "string" && UUID.test(valor) ? valor : null;
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

  // id da linha `chaveamentos` por categoria, aprendido ao salvar/carregar.
  const chaveamentoIdPorCategoria = new Map<string, string>();

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

      // Vínculos opcionais com jogadores cadastrados. O mesmo jogador não pode
      // ocupar os dois lugares (o banco também barra, com um check).
      const jogadorAId = idDeJogador(dados.jogadorAId);
      const jogadorBId = idDeJogador(dados.jogadorBId);
      if (jogadorAId !== null && jogadorAId === jogadorBId) {
        return { ok: false, erro: { code: "NOME_ATLETA_INVALIDO", qual: "B" } };
      }

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
        // Só inclui as chaves quando há vínculo: sem jogador, o payload é o mesmo de sempre.
        ...(jogadorAId !== null ? { jogador_a_id: jogadorAId } : {}),
        ...(jogadorBId !== null ? { jogador_b_id: jogadorBId } : {}),
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
        chaveamentoIdPorCategoria.set(ref.categoriaId, chaveamentoId);

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
    // Caminho rápido: grava só os jogos alterados + campeã
    // -----------------------------------------------------------------------
    async salvarJogos(
      ref: CategoryRef,
      jogos: ReadonlyArray<Match>,
      campeaId: PairId | null,
    ): Promise<Result<void>> {
      const client = await obterClient();
      try {
        let chaveamentoId = chaveamentoIdPorCategoria.get(ref.categoriaId);
        if (chaveamentoId === undefined) {
          const { data, error } = await client
            .from("chaveamentos")
            .select("id")
            .eq("categoria_id", ref.categoriaId)
            .maybeSingle();
          if (error || !data) return erroPersistencia();
          chaveamentoId = (data as { id: string }).id;
          chaveamentoIdPorCategoria.set(ref.categoriaId, chaveamentoId);
        }

        const linhas = jogos.map((m) => matchParaJogoRow(m, chaveamentoId as string));
        const [resJogos, resChav] = await Promise.all([
          linhas.length > 0
            ? client.from("jogos").upsert(linhas, { onConflict: "id" })
            : Promise.resolve({ error: null }),
          client
            .from("chaveamentos")
            .update({ campea_id: campeaId, atualizado_em: agoraISO() })
            .eq("id", chaveamentoId),
        ]);
        if (resJogos.error || resChav.error) return erroPersistencia();
      } catch {
        return erroPersistencia();
      }
      return { ok: true, valor: undefined };
    },

    // -----------------------------------------------------------------------
    // Tempo real: avisa quando jogos/chaveamento da categoria mudam
    // -----------------------------------------------------------------------
    async assinarMudancas(
      ref: CategoryRef,
      aoMudar: () => void,
    ): Promise<() => void> {
      try {
        const client = await obterClient();

        let chaveamentoId = chaveamentoIdPorCategoria.get(ref.categoriaId);
        if (chaveamentoId === undefined) {
          const { data } = await client
            .from("chaveamentos")
            .select("id")
            .eq("categoria_id", ref.categoriaId)
            .maybeSingle();
          if (data) {
            chaveamentoId = (data as { id: string }).id;
            chaveamentoIdPorCategoria.set(ref.categoriaId, chaveamentoId);
          }
        }

        let canal = client
          .channel(`chaveamento-${ref.categoriaId}-${novoId()}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "chaveamentos",
              filter: `categoria_id=eq.${ref.categoriaId}`,
            },
            () => aoMudar(),
          );
        // Os jogos só podem ser filtrados quando o chaveamento já existe; se
        // ele for criado depois, o evento em `chaveamentos` avisa a tela.
        if (chaveamentoId !== undefined) {
          canal = canal.on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "jogos",
              filter: `chaveamento_id=eq.${chaveamentoId}`,
            },
            () => aoMudar(),
          );
        }
        canal.subscribe();

        return () => {
          void client.removeChannel(canal);
        };
      } catch {
        return () => {};
      }
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

        chaveamentoIdPorCategoria.set(ref.categoriaId, chaveamentoId);

        // 2) Duplas, grupos e jogos são independentes entre si: busca em paralelo.
        const [duplasResp, gruposResp, jogosResp] = await Promise.all([
          client.from("duplas").select("*").eq("categoria_id", ref.categoriaId),
          client.from("grupos").select("*").eq("chaveamento_id", chaveamentoId),
          client.from("jogos").select("*").eq("chaveamento_id", chaveamentoId),
        ]);
        if (duplasResp.error || gruposResp.error || jogosResp.error) {
          return erroLeitura();
        }
        const grupos = (gruposResp.data ?? []) as GrupoRow[];

        // 3) Associações grupo ↔ dupla (dependem dos grupos acima).
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
