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
// As propriedades abaixo exercitam `classificarGrupo` e
// `selecionarClassificados` de ../src/domain/bracket/standings.ts. A estratégia
// comum é: gerar um grupo REAL via `gerarChaveamento` ("fase de grupos"),
// extrair UM grupo e os seus jogos de round-robin (side "grupo") e ATRIBUIR
// vencedores a todos os jogos de forma determinística, a partir de uma lista de
// escolhas geradas pelo fast-check. Assim obtemos um grupo completo e
// previsível para comparar com um oráculo independente.

import {
  classificarGrupo,
  selecionarClassificados,
} from "../src/domain/bracket/standings";
import type { Group, Match, PairId, Standing } from "../src/domain/bracket/types";

// ---------------------------------------------------------------------------
// Utilitários compartilhados pelas Properties 19 e 20
// ---------------------------------------------------------------------------

/** Resultado sorteado de um jogo: quem vence, placar do perdedor e margem (>= 1). */
interface Escolha {
  bit: number; // 0 → vence A; 1 → vence B
  perdedor: number; // pontos do perdedor
  margem: number; // vencedor = perdedor + margem (nunca há empate)
}

const arbEscolha: fc.Arbitrary<Escolha> = fc.record({
  bit: fc.integer({ min: 0, max: 1 }),
  perdedor: fc.integer({ min: 0, max: 20 }),
  margem: fc.integer({ min: 1, max: 10 }),
});

/** Gerador de resultados, um por jogo possível (até 40*39/2). */
const arbEscolhas = fc.array(arbEscolha, { minLength: 1, maxLength: 60 });

/**
 * Gera um bracket de fase de grupos a partir de (n, g) e devolve os grupos e os
 * jogos de grupo. Retorna `null` quando o gerador rejeita a entrada.
 */
function gerarGruposReais(
  n: number,
  g: number,
  classificadosPorGrupo: number,
): { grupos: Group[]; jogos: Match[] } | null {
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
  };
}

/**
 * Atribui placar/vencedor aos jogos do grupo, na ordem de `grupo.jogos`, a
 * partir de `escolhas` (reinicia se acabar). Se `limite` for informado, só os
 * primeiros `limite` jogos são decididos; os demais ficam como estão.
 * Devolve novos `Match` (não muta os de entrada).
 */
function atribuirResultados(
  grupo: Group,
  jogos: ReadonlyArray<Match>,
  escolhas: ReadonlyArray<Escolha>,
  limite: number = Number.POSITIVE_INFINITY,
): Match[] {
  const porId = new Map<string, Match>();
  for (const j of jogos) porId.set(j.id, j);

  const resultado: Match[] = [];
  let k = 0;
  for (const matchId of grupo.jogos) {
    const jogo = porId.get(matchId);
    if (!jogo) continue;
    if (k >= limite) {
      resultado.push(jogo);
      k++;
      continue;
    }
    const e = escolhas[k % escolhas.length];
    k++;
    const vencedor = e.perdedor + e.margem;
    const placarA = e.bit === 0 ? vencedor : e.perdedor;
    const placarB = e.bit === 0 ? e.perdedor : vencedor;
    resultado.push({
      ...jogo,
      placarA,
      placarB,
      vencedorId: e.bit === 0 ? jogo.a.pairId : jogo.b.pairId,
      registradoEm: "2026-02-01T00:00:00.000Z",
    });
  }
  return resultado;
}

/**
 * ORÁCULO INDEPENDENTE de classificação, reescrito sem reusar a produção.
 * Considera só jogos decididos e ordena por:
 *   1) pontos (3 por vitória) desc;
 *   2) saldo (pontos feitos − sofridos) desc;
 *   3) confronto direto (vitórias nos jogos entre as duplas empatadas em 1 e 2);
 *   4) pontos feitos desc;
 *   5) pairId (ordem estável; seeding NÃO influencia).
 */
function oraculoClassificacao(
  grupo: Group,
  jogos: ReadonlyArray<Match>,
): PairId[] {
  const decididos = jogos.filter(
    (j) => j.vencedorId !== null && j.a.pairId !== null && j.b.pairId !== null,
  );
  const vit = new Map<PairId, number>();
  const pro = new Map<PairId, number>();
  const contra = new Map<PairId, number>();
  for (const id of grupo.duplas) {
    vit.set(id, 0);
    pro.set(id, 0);
    contra.set(id, 0);
  }
  for (const j of decididos) {
    const a = j.a.pairId as PairId;
    const b = j.b.pairId as PairId;
    pro.set(a, (pro.get(a) as number) + (j.placarA ?? 0));
    contra.set(a, (contra.get(a) as number) + (j.placarB ?? 0));
    pro.set(b, (pro.get(b) as number) + (j.placarB ?? 0));
    contra.set(b, (contra.get(b) as number) + (j.placarA ?? 0));
    const v = j.vencedorId as PairId;
    vit.set(v, (vit.get(v) as number) + 1);
  }
  const pts = (id: PairId): number => 3 * (vit.get(id) as number);
  const saldo = (id: PairId): number => (pro.get(id) as number) - (contra.get(id) as number);

  const diretas = (id: PairId, entre: ReadonlySet<PairId>): number => {
    let total = 0;
    for (const j of decididos) {
      if (j.vencedorId !== id) continue;
      if (entre.has(j.a.pairId as PairId) && entre.has(j.b.pairId as PairId)) total += 1;
    }
    return total;
  };

  return [...grupo.duplas].sort((x, y) => {
    if (pts(x) !== pts(y)) return pts(y) - pts(x);
    if (saldo(x) !== saldo(y)) return saldo(y) - saldo(x);
    const empatadas = new Set(
      grupo.duplas.filter((id) => pts(id) === pts(x) && saldo(id) === saldo(x)),
    );
    const dx = diretas(x, empatadas);
    const dy = diretas(y, empatadas);
    if (dx !== dy) return dy - dx;
    if (pro.get(x) !== pro.get(y)) return (pro.get(y) as number) - (pro.get(x) as number);
    return x.localeCompare(y);
  });
}

// ---------------------------------------------------------------------------
// Property 19: Classificação por pontos (3/vitória), saldo, confronto direto
// ---------------------------------------------------------------------------

// Feature: criar-chaveamento-campeonato, Property 19: Classificação do grupo é determinística e ordenada por (pontos, saldo, confronto direto, pontos feitos)
//
// `classificarGrupo` considera apenas jogos decididos (classificação parcial):
//   (a) nunca é null; sem jogos decididos todos têm zeros; parcial cobre o grupo;
//   (b) a ordem casa com o oráculo independente (grupo completo e parcial);
//   (c) é determinística;
//   (d) posicao é 1..g sem repetição e cobre todas as duplas;
//   (e) pontos = 3 × vitórias e saldo bate com a soma dos placares.
//
// Validates: Requirements 5.3
describe("Feature: criar-chaveamento-campeonato, Property 19: Classificação do grupo é determinística e ordenada por (pontos, saldo, confronto direto, pontos feitos)", () => {
  it("(a) classificação parcial: nunca é null; sem jogos decididos todos têm zeros", () => {
    fc.assert(
      fc.property(arbEntradaGrupos, arbEscolhas, ({ n, g, classificadosPorGrupo }, escolhas) => {
        const reais = gerarGruposReais(n, g, classificadosPorGrupo);
        fc.pre(reais !== null);
        if (reais === null) return;

        for (const grupo of reais.grupos) {
          const jogosDoGrupo = reais.jogos.filter((m) => m.grupoId === grupo.id);

          const vazia = classificarGrupo(grupo, jogosDoGrupo);
          expect(vazia).toHaveLength(grupo.duplas.length);
          for (const s of vazia) {
            expect(s.jogos).toBe(0);
            expect(s.pontos).toBe(0);
            expect(s.saldo).toBe(0);
          }

          const parcial = atribuirResultados(grupo, jogosDoGrupo, escolhas, 1);
          expect(classificarGrupo(grupo, parcial)).toHaveLength(grupo.duplas.length);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("(b) a ordem casa com o oráculo independente (completo e parcial)", () => {
    fc.assert(
      fc.property(
        arbEntradaGrupos,
        arbEscolhas,
        fc.integer({ min: 0, max: 40 }),
        ({ n, g, classificadosPorGrupo }, escolhas, limite) => {
          const reais = gerarGruposReais(n, g, classificadosPorGrupo);
          fc.pre(reais !== null);
          if (reais === null) return;

          for (const grupo of reais.grupos) {
            const jogosDoGrupo = reais.jogos.filter((m) => m.grupoId === grupo.id);
            for (const lim of [Number.POSITIVE_INFINITY, limite]) {
              const jogos = atribuirResultados(grupo, jogosDoGrupo, escolhas, lim);
              const classificacao = classificarGrupo(grupo, jogos);
              expect(classificacao.map((s) => s.pairId)).toEqual(
                oraculoClassificacao(grupo, jogos),
              );
              // Pontos desc ao longo da tabela.
              for (let i = 1; i < classificacao.length; i++) {
                expect(classificacao[i - 1].pontos).toBeGreaterThanOrEqual(
                  classificacao[i].pontos,
                );
              }
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("(c) é determinística: mesma entrada produz a mesma saída", () => {
    fc.assert(
      fc.property(arbEntradaGrupos, arbEscolhas, ({ n, g, classificadosPorGrupo }, escolhas) => {
        const reais = gerarGruposReais(n, g, classificadosPorGrupo);
        fc.pre(reais !== null);
        if (reais === null) return;

        for (const grupo of reais.grupos) {
          const jogosDoGrupo = reais.jogos.filter((m) => m.grupoId === grupo.id);
          const completos = atribuirResultados(grupo, jogosDoGrupo, escolhas);
          expect(classificarGrupo(grupo, completos)).toEqual(
            classificarGrupo(grupo, completos),
          );
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

        for (const grupo of reais.grupos) {
          const jogosDoGrupo = reais.jogos.filter((m) => m.grupoId === grupo.id);
          const completos = atribuirResultados(grupo, jogosDoGrupo, escolhas);
          const classificacao = classificarGrupo(grupo, completos);

          const gg = grupo.duplas.length;
          expect(classificacao).toHaveLength(gg);
          const posicoes = classificacao.map((s) => s.posicao).sort((a, b) => a - b);
          expect(posicoes).toEqual(Array.from({ length: gg }, (_, i) => i + 1));
          expect(new Set(classificacao.map((s) => s.pairId))).toEqual(new Set(grupo.duplas));
        }
      }),
      { numRuns: 200 },
    );
  });

  it("(e) pontos = 3 × vitórias; soma dos saldos do grupo é zero", () => {
    fc.assert(
      fc.property(arbEntradaGrupos, arbEscolhas, ({ n, g, classificadosPorGrupo }, escolhas) => {
        const reais = gerarGruposReais(n, g, classificadosPorGrupo);
        fc.pre(reais !== null);
        if (reais === null) return;

        for (const grupo of reais.grupos) {
          const jogosDoGrupo = reais.jogos.filter((m) => m.grupoId === grupo.id);
          const completos = atribuirResultados(grupo, jogosDoGrupo, escolhas);
          const classificacao = classificarGrupo(grupo, completos);
          for (const s of classificacao) expect(s.pontos).toBe(3 * s.vitorias);
          expect(classificacao.reduce((acc, s) => acc + s.saldo, 0)).toBe(0);
          expect(classificacao.reduce((acc, s) => acc + s.vitorias, 0)).toBe(grupo.jogos.length);
        }
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 20: Classificação transfere exatamente X duplas por grupo
// ---------------------------------------------------------------------------

// Feature: criar-chaveamento-campeonato, Property 20: Classificação transfere exatamente X duplas por grupo
//
// Para um grupo completo e X = classificadosPorGrupo (1..g-1):
//   - `selecionarClassificados` retorna exatamente X standings, o prefixo de
//     `classificarGrupo`;
//   - retorna null se o grupo não está completo (mesmo havendo tabela parcial);
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
        const x = classificadosPorGrupo;

        for (const grupo of reais.grupos) {
          const jogosDoGrupo = reais.jogos.filter((m) => m.grupoId === grupo.id);
          const completos = atribuirResultados(grupo, jogosDoGrupo, escolhas);

          const classificacao = classificarGrupo(grupo, completos) as Standing[];
          const selecionados = selecionarClassificados(grupo, completos, x) as Standing[];

          expect(selecionados).toHaveLength(x);
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
        const x = classificadosPorGrupo;

        for (const grupo of reais.grupos) {
          if (grupo.jogos.length === 0) continue;
          const jogosDoGrupo = reais.jogos.filter((m) => m.grupoId === grupo.id);
          expect(selecionarClassificados(grupo, jogosDoGrupo, x)).toBeNull();
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

          for (const grupo of reais.grupos) {
            const jogosDoGrupo = reais.jogos.filter((m) => m.grupoId === grupo.id);
            const completos = atribuirResultados(grupo, jogosDoGrupo, escolhas);
            expect(selecionarClassificados(grupo, completos, quantidade)).toEqual([]);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
