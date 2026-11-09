import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { gerarChaveamento } from "../src/domain/bracket/generator";
import type { Bracket, Pair } from "../src/domain/bracket/types";

// Este arquivo concentra as propriedades da FASE DE GRUPOS. Por ora contém
// apenas a Property 18 (round-robin). As Properties 19 (classificação
// determinística) e 20 (transferência de X classificados por grupo) serão
// adicionadas aqui pelas tarefas 9.2 e 9.3, cada uma em seu próprio `describe`.

// ---------------------------------------------------------------------------
// Geradores
// ---------------------------------------------------------------------------

/**
 * Constrói N duplas com seeds consecutivos 1..N (seeding válido). O conteúdo
 * dos nomes/atletas é irrelevante para a estrutura do round-robin; apenas a
 * identidade (`id`) e o `seed` importam para o gerador.
 */
function construirDuplas(n: number): Pair[] {
  const duplas: Pair[] = [];
  for (let seed = 1; seed <= n; seed++) {
    const criadoEm = `2026-01-01T00:00:${String(seed % 60).padStart(2, "0")}.000Z`;
    duplas.push({
      id: `dupla-${seed}`,
      nomeDupla: `Dupla ${seed}`,
      atletaA: `Atleta A${seed}`,
      atletaB: `Atleta B${seed}`,
      seed,
      criadoEm,
    });
  }
  return duplas;
}

/**
 * Entrada válida para a FASE DE GRUPOS:
 *  - N duplas (4..40) com seeds 1..N;
 *  - numeroDeGrupos G no intervalo válido 1..floor(N/2);
 *  - classificadosPorGrupo no intervalo válido 1..(menorGrupo-1), sempre >= 1.
 *
 * O menor grupo da distribuição serpentina tem tamanho floor(N/G); exigimos
 * floor(N/G) >= 2 (via G <= floor(N/2)) para que exista ao menos um
 * classificado válido (1..menorGrupo-1).
 */
const arbEntradaGrupos = fc
  .integer({ min: 4, max: 40 })
  .chain((n) => {
    const maxGrupos = Math.floor(n / 2);
    return fc.integer({ min: 1, max: maxGrupos }).chain((g) => {
      const menorGrupo = Math.floor(n / g);
      // classificadosPorGrupo: 1..(menorGrupo-1). Com G<=floor(N/2), menorGrupo>=2.
      return fc
        .integer({ min: 1, max: Math.max(1, menorGrupo - 1) })
        .map((classificadosPorGrupo) => ({ n, g, classificadosPorGrupo }));
    });
  });

/** Chave canônica, ordem-independente, de um par de duplas. */
function chavePar(x: string, y: string): string {
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

// ---------------------------------------------------------------------------
// Feature: criar-chaveamento-campeonato, Property 18: Round-robin por grupo tem G(G−1)/2 jogos, um por par
// ---------------------------------------------------------------------------

// Feature: criar-chaveamento-campeonato, Property 18: Round-robin por grupo tem G(G−1)/2 jogos, um por par
//
// Para todo grupo de tamanho g gerado na fase de grupos, existe exatamente um
// jogo para cada par distinto de duplas do grupo, totalizando g(g−1)/2 jogos.
//
// Validates: Requirements 5.2
describe("Feature: criar-chaveamento-campeonato, Property 18: Round-robin por grupo tem G(G−1)/2 jogos, um por par", () => {
  it("cada grupo tem exatamente g(g-1)/2 jogos, um por par distinto, e cada dupla joga g-1 vezes", () => {
    fc.assert(
      fc.property(arbEntradaGrupos, ({ n, g, classificadosPorGrupo }) => {
        const resultado = gerarChaveamento({
          duplas: construirDuplas(n),
          config: {
            formato: "fase de grupos",
            numeroDeGrupos: g,
            classificadosPorGrupo,
          },
        });

        // Só exercitamos entradas aceitas pelo gerador.
        fc.pre(resultado.ok);
        if (!resultado.ok) return;

        const bracket: Bracket = resultado.bracket;

        for (const grupo of bracket.grupos) {
          const duplasDoGrupo = grupo.duplas;
          const gg = duplasDoGrupo.length;
          const membros = new Set(duplasDoGrupo);

          // Jogos de grupo (side "grupo") que pertencem a ESTE grupo.
          const jogosDoGrupo = bracket.matches.filter(
            (m) => m.side === "grupo" && m.grupoId === grupo.id,
          );

          // (1) Número de jogos é exatamente g(g-1)/2.
          expect(jogosDoGrupo.length).toBe((gg * (gg - 1)) / 2);

          // (2) Exatamente UM jogo por par distinto: sem par repetido, sem par
          // faltando e sem jogo com dupla de fora do grupo.
          const paresVistos = new Set<string>();
          for (const jogo of jogosDoGrupo) {
            const a = jogo.a.pairId;
            const b = jogo.b.pairId;

            // Ambos os participantes são duplas definidas do grupo.
            expect(a).not.toBeNull();
            expect(b).not.toBeNull();
            expect(membros.has(a as string)).toBe(true);
            expect(membros.has(b as string)).toBe(true);
            // Não pode ser uma dupla contra ela mesma.
            expect(a).not.toBe(b);

            const chave = chavePar(a as string, b as string);
            // Nenhum par repetido.
            expect(paresVistos.has(chave)).toBe(false);
            paresVistos.add(chave);
          }

          // O conjunto de pares cobertos é exatamente o conjunto de todos os
          // pares distintos possíveis do grupo.
          const paresEsperados = new Set<string>();
          for (let i = 0; i < duplasDoGrupo.length; i++) {
            for (let j = i + 1; j < duplasDoGrupo.length; j++) {
              paresEsperados.add(chavePar(duplasDoGrupo[i], duplasDoGrupo[j]));
            }
          }
          expect(paresVistos).toEqual(paresEsperados);

          // (3) Cada dupla do grupo aparece em exatamente g-1 jogos.
          const aparicoes = new Map<string, number>();
          for (const id of duplasDoGrupo) aparicoes.set(id, 0);
          for (const jogo of jogosDoGrupo) {
            aparicoes.set(jogo.a.pairId as string, (aparicoes.get(jogo.a.pairId as string) ?? 0) + 1);
            aparicoes.set(jogo.b.pairId as string, (aparicoes.get(jogo.b.pairId as string) ?? 0) + 1);
          }
          for (const id of duplasDoGrupo) {
            expect(aparicoes.get(id)).toBe(gg - 1);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});

// ===========================================================================
// Properties 19 e 20 — Group_Standings (classificação de grupo)
// ===========================================================================
//
// As propriedades abaixo exercitam `classificarGrupo`, `indiceDeSeed` e
// `selecionarClassificados` de ../src/domain/bracket/standings.ts. A estratégia
// comum é: gerar um grupo REAL via `gerarChaveamento` ("fase de grupos"),
// extrair UM grupo e os seus jogos de round-robin (side "grupo") e ATRIBUIR
// vencedores a todos os jogos de forma determinística, a partir de uma lista de
// escolhas geradas pelo fast-check. Assim obtemos um grupo completo e
// previsível para comparar com um oráculo independente.

import {
  classificarGrupo,
  indiceDeSeed,
  selecionarClassificados,
  type SeedIndex,
} from "../src/domain/bracket/standings";
import type { Group, Match, PairId, Standing } from "../src/domain/bracket/types";

// ---------------------------------------------------------------------------
// Utilitários compartilhados pelas Properties 19 e 20
// ---------------------------------------------------------------------------

/**
 * Gera um bracket de fase de grupos a partir de (n, g) e devolve os grupos e os
 * jogos de grupo. Retorna `null` quando o gerador rejeita a entrada (não
 * deveria ocorrer dentro de `arbEntradaGrupos`, que já restringe o domínio).
 */
function gerarGruposReais(
  n: number,
  g: number,
  classificadosPorGrupo: number,
): { grupos: Group[]; jogos: Match[]; seedIndex: SeedIndex } | null {
  const duplas = construirDuplas(n);
  const resultado = gerarChaveamento({
    duplas,
    config: {
      formato: "fase de grupos",
      numeroDeGrupos: g,
      classificadosPorGrupo,
    },
  });
  if (!resultado.ok) return null;
  const bracket = resultado.bracket;
  return {
    grupos: bracket.grupos,
    jogos: bracket.matches.filter((m) => m.side === "grupo"),
    seedIndex: indiceDeSeed(bracket.duplas),
  };
}

/**
 * Atribui um vencedor a CADA jogo do grupo de forma determinística, a partir de
 * uma lista de bits `escolhas` (0 → vence o participante A; 1 → vence o B).
 * Devolve novos `Match` (não muta os de entrada). A lista de bits é consumida
 * na ordem de `grupo.jogos`; se acabar, reinicia (comportamento determinístico).
 */
function atribuirVencedores(
  grupo: Group,
  jogos: ReadonlyArray<Match>,
  escolhas: ReadonlyArray<number>,
): Match[] {
  const porId = new Map<PairId, Match>();
  for (const j of jogos) porId.set(j.id, j);

  const resultado: Match[] = [];
  let k = 0;
  for (const matchId of grupo.jogos) {
    const jogo = porId.get(matchId);
    if (!jogo) continue;
    const bit = escolhas.length > 0 ? escolhas[k % escolhas.length] : 0;
    k++;
    const vencedorId = bit === 0 ? jogo.a.pairId : jogo.b.pairId;
    resultado.push({ ...jogo, vencedorId, registradoEm: "2026-02-01T00:00:00.000Z" });
  }
  return resultado;
}

/**
 * ORÁCULO INDEPENDENTE de classificação (R5.3), reescrito do zero sem reusar a
 * implementação de produção. Ordena por:
 *   1) vitórias totais no grupo (desc);
 *   2) confronto direto entre as duplas EMPATADAS em vitórias totais (mini-tabela
 *      restrita aos jogos entre elas, vitórias desc);
 *   3) menor seed (asc) — critério final que sempre desempata (seeds únicos).
 *
 * Caveat documentado (empates triplos cíclicos): quando três (ou mais) duplas
 * empatam em vitórias totais E também empatam no confronto direto entre si
 * (ex.: ciclo A>B>C>A, cada uma com 1 vitória na mini-tabela), o critério (2)
 * não separa ninguém e a decisão recai inteiramente sobre o critério (3), o
 * seed. Este oráculo aplica EXATAMENTE a mesma regra (seed como desempate final),
 * de modo que a comparação com a produção permanece válida mesmo nesses casos —
 * ambos convergem para a ordem por seed entre os cíclicos.
 */
function oraculoClassificacao(
  grupo: Group,
  jogosComVencedor: ReadonlyArray<Match>,
  seedIndex: SeedIndex,
): PairId[] {
  const jogos = jogosComVencedor;

  const vitorias = new Map<PairId, number>();
  for (const id of grupo.duplas) vitorias.set(id, 0);
  for (const j of jogos) {
    if (j.vencedorId !== null && vitorias.has(j.vencedorId)) {
      vitorias.set(j.vencedorId, (vitorias.get(j.vencedorId) as number) + 1);
    }
  }

  const seedDe = (id: PairId): number =>
    seedIndex.get(id) ?? Number.POSITIVE_INFINITY;

  // Vitórias diretas de `id`, contando só jogos entre duplas do conjunto `entre`.
  const diretas = (id: PairId, entre: ReadonlySet<PairId>): number => {
    let total = 0;
    for (const j of jogos) {
      if (j.vencedorId !== id) continue;
      const a = j.a.pairId;
      const b = j.b.pairId;
      if (a === null || b === null) continue;
      if (entre.has(a) && entre.has(b)) total += 1;
    }
    return total;
  };

  return [...grupo.duplas].sort((x, y) => {
    const vx = vitorias.get(x) ?? 0;
    const vy = vitorias.get(y) ?? 0;
    if (vx !== vy) return vy - vx;

    const empatadas = new Set<PairId>();
    for (const id of grupo.duplas) {
      if ((vitorias.get(id) ?? 0) === vx) empatadas.add(id);
    }
    const dx = diretas(x, empatadas);
    const dy = diretas(y, empatadas);
    if (dx !== dy) return dy - dx;

    return seedDe(x) - seedDe(y);
  });
}

/** Gerador de bits de escolha de vencedor, um por jogo possível (até 40*39/2). */
const arbEscolhas = fc.array(fc.integer({ min: 0, max: 1 }), {
  minLength: 1,
  maxLength: 60,
});

// ---------------------------------------------------------------------------
// Feature: criar-chaveamento-campeonato, Property 19: Classificação do grupo é determinística e ordenada por (vitórias, confronto direto, seed)
// ---------------------------------------------------------------------------

// Feature: criar-chaveamento-campeonato, Property 19: Classificação do grupo é determinística e ordenada por (vitórias, confronto direto, seed)
//
// Para todo grupo completo (todos os jogos com vencedor), `classificarGrupo`:
//   (a) só retorna classificação (não-null) quando todos os jogos têm vencedor;
//   (b) a ordem respeita vitórias (desc), depois confronto direto entre
//       empatados, depois seed menor — comparado contra um oráculo independente;
//   (c) é determinística (mesma entrada → mesma saída);
//   (d) atribui posicao 1..g sem repetição.
//
// Validates: Requirements 5.3
describe("Feature: criar-chaveamento-campeonato, Property 19: Classificação do grupo é determinística e ordenada por (vitórias, confronto direto, seed)", () => {
  it("(a) retorna null enquanto houver jogo sem vencedor e não-null quando completo", () => {
    fc.assert(
      fc.property(arbEntradaGrupos, arbEscolhas, ({ n, g, classificadosPorGrupo }, escolhas) => {
        const reais = gerarGruposReais(n, g, classificadosPorGrupo);
        fc.pre(reais !== null);
        if (reais === null) return;
        const { grupos, seedIndex } = reais;

        for (const grupo of grupos) {
          const jogosDoGrupo = reais.jogos.filter((m) => m.grupoId === grupo.id);

          // Grupos degenerados (0 ou 1 dupla) não têm jogos: já são "completos".
          if (grupo.jogos.length > 0) {
            // Sem nenhum vencedor atribuído, a classificação é indefinida.
            expect(classificarGrupo(grupo, jogosDoGrupo, seedIndex)).toBeNull();
          }

          // Com todos os vencedores atribuídos, a classificação existe.
          const completos = atribuirVencedores(grupo, jogosDoGrupo, escolhas);
          const classificacao = classificarGrupo(grupo, completos, seedIndex);
          expect(classificacao).not.toBeNull();
        }
      }),
      { numRuns: 200 },
    );
  });

  it("(b) a ordem casa com o oráculo independente (vitórias → confronto direto → seed)", () => {
    fc.assert(
      fc.property(arbEntradaGrupos, arbEscolhas, ({ n, g, classificadosPorGrupo }, escolhas) => {
        const reais = gerarGruposReais(n, g, classificadosPorGrupo);
        fc.pre(reais !== null);
        if (reais === null) return;
        const { grupos, seedIndex } = reais;

        for (const grupo of grupos) {
          const jogosDoGrupo = reais.jogos.filter((m) => m.grupoId === grupo.id);
          const completos = atribuirVencedores(grupo, jogosDoGrupo, escolhas);

          const classificacao = classificarGrupo(grupo, completos, seedIndex) as Standing[];
          const esperado = oraculoClassificacao(grupo, completos, seedIndex);

          expect(classificacao.map((s) => s.pairId)).toEqual(esperado);

          // Vitórias desc ao longo da classificação (consequência da regra).
          for (let i = 1; i < classificacao.length; i++) {
            expect(classificacao[i - 1].vitorias).toBeGreaterThanOrEqual(
              classificacao[i].vitorias,
            );
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it("(c) é determinística: mesma entrada produz a mesma saída", () => {
    fc.assert(
      fc.property(arbEntradaGrupos, arbEscolhas, ({ n, g, classificadosPorGrupo }, escolhas) => {
        const reais = gerarGruposReais(n, g, classificadosPorGrupo);
        fc.pre(reais !== null);
        if (reais === null) return;
        const { grupos, seedIndex } = reais;

        for (const grupo of grupos) {
          const jogosDoGrupo = reais.jogos.filter((m) => m.grupoId === grupo.id);
          const completos = atribuirVencedores(grupo, jogosDoGrupo, escolhas);

          const primeira = classificarGrupo(grupo, completos, seedIndex);
          const segunda = classificarGrupo(grupo, completos, seedIndex);
          expect(segunda).toEqual(primeira);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("(d) posicao é 1..g sem repetição e cobre todas as duplas do grupo", () => {
    fc.assert(
      fc.property(arbEntradaGrupos, arbEscolhas, ({ n, g, classificadosPorGrupo }, escolhas) => {
        const reais = gerarGruposReais(n, g, classificadosPorGrupo);
        fc.pre(reais !== null);
        if (reais === null) return;
        const { grupos, seedIndex } = reais;

        for (const grupo of grupos) {
          const jogosDoGrupo = reais.jogos.filter((m) => m.grupoId === grupo.id);
          const completos = atribuirVencedores(grupo, jogosDoGrupo, escolhas);
          const classificacao = classificarGrupo(grupo, completos, seedIndex) as Standing[];

          const gg = grupo.duplas.length;
          expect(classificacao).toHaveLength(gg);

          // Posições são exatamente {1..gg}, sem repetição.
          const posicoes = classificacao.map((s) => s.posicao).sort((a, b) => a - b);
          expect(posicoes).toEqual(Array.from({ length: gg }, (_, i) => i + 1));

          // Cobre exatamente as duplas do grupo (sem faltar nem sobrar).
          const idsClassificados = new Set(classificacao.map((s) => s.pairId));
          expect(idsClassificados).toEqual(new Set(grupo.duplas));
        }
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Feature: criar-chaveamento-campeonato, Property 20: Classificação transfere exatamente X duplas por grupo
// ---------------------------------------------------------------------------

// Feature: criar-chaveamento-campeonato, Property 20: Classificação transfere exatamente X duplas por grupo
//
// Para um grupo completo e X = classificadosPorGrupo (1..g-1):
//   - `selecionarClassificados` retorna exatamente X standings, que são os X
//     primeiros da classificação de `classificarGrupo`;
//   - retorna null se o grupo não está completo;
//   - retorna [] se quantidade <= 0.
//
// Validates: Requirements 5.4
describe("Feature: criar-chaveamento-campeonato, Property 20: Classificação transfere exatamente X duplas por grupo", () => {
  it("retorna exatamente X standings, o prefixo da classificação completa", () => {
    fc.assert(
      fc.property(arbEntradaGrupos, arbEscolhas, ({ n, g, classificadosPorGrupo }, escolhas) => {
        const reais = gerarGruposReais(n, g, classificadosPorGrupo);
        fc.pre(reais !== null);
        if (reais === null) return;
        const { grupos, seedIndex } = reais;
        const x = classificadosPorGrupo;

        for (const grupo of grupos) {
          const jogosDoGrupo = reais.jogos.filter((m) => m.grupoId === grupo.id);
          const completos = atribuirVencedores(grupo, jogosDoGrupo, escolhas);

          const classificacao = classificarGrupo(grupo, completos, seedIndex) as Standing[];
          const selecionados = selecionarClassificados(
            grupo,
            completos,
            seedIndex,
            x,
          ) as Standing[];

          // X está no intervalo válido 1..(g-1) <= g, então há exatamente X.
          expect(selecionados).toHaveLength(x);
          // São exatamente o prefixo da classificação completa.
          expect(selecionados).toEqual(classificacao.slice(0, x));
        }
      }),
      { numRuns: 200 },
    );
  });

  it("retorna null quando o grupo ainda não está completo", () => {
    fc.assert(
      fc.property(arbEntradaGrupos, ({ n, g, classificadosPorGrupo }) => {
        const reais = gerarGruposReais(n, g, classificadosPorGrupo);
        fc.pre(reais !== null);
        if (reais === null) return;
        const { grupos, seedIndex } = reais;
        const x = classificadosPorGrupo;

        for (const grupo of grupos) {
          // Só grupos com pelo menos um jogo podem estar incompletos.
          if (grupo.jogos.length === 0) continue;
          const jogosDoGrupo = reais.jogos.filter((m) => m.grupoId === grupo.id);
          // Nenhum vencedor atribuído ⇒ incompleto ⇒ null.
          expect(selecionarClassificados(grupo, jogosDoGrupo, seedIndex, x)).toBeNull();
        }
      }),
      { numRuns: 200 },
    );
  });

  it("retorna [] quando a quantidade é <= 0, mesmo com o grupo completo", () => {
    fc.assert(
      fc.property(
        arbEntradaGrupos,
        arbEscolhas,
        fc.integer({ min: -5, max: 0 }),
        ({ n, g, classificadosPorGrupo }, escolhas, quantidade) => {
          const reais = gerarGruposReais(n, g, classificadosPorGrupo);
          fc.pre(reais !== null);
          if (reais === null) return;
          const { grupos, seedIndex } = reais;

          for (const grupo of grupos) {
            const jogosDoGrupo = reais.jogos.filter((m) => m.grupoId === grupo.id);
            const completos = atribuirVencedores(grupo, jogosDoGrupo, escolhas);
            expect(
              selecionarClassificados(grupo, completos, seedIndex, quantidade),
            ).toEqual([]);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
