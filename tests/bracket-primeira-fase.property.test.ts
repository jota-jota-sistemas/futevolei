import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { gerarChaveamento } from "../src/domain/bracket/generator";
import type { Bracket, Pair } from "../src/domain/bracket/types";

// Feature: criar-chaveamento-campeonato, Property 15: Cada dupla aparece exatamente uma vez na primeira fase
//
// Para toda geração válida (2..128 duplas, ambos os formatos), o multiset de
// duplas presentes na PRIMEIRA FASE é exatamente o conjunto das duplas
// cadastradas, cada uma ocorrendo uma única vez:
//   - "fase de grupos": a união das duplas de todos os grupos
//     (bracket.grupos[*].duplas);
//   - "dupla eliminação": os participantes reais (pairId != null, ignorando
//     byes) da 1ª rodada da chave de vencedores (side "upper", rodada 1).
//
// Validates: Requirements 4.5

// ---------------------------------------------------------------------------
// Geradores
// ---------------------------------------------------------------------------

/**
 * Constrói N duplas com seeds consecutivos 1..N (seeding válido). Só a
 * identidade (`id`) e o `seed` importam para a estrutura da primeira fase;
 * nomes/atletas são preenchidos de forma determinística e não vazia.
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
 * Entrada válida para DUPLA ELIMINAÇÃO: N em 2..128 com seeds 1..N.
 */
const arbEntradaEliminacao = fc.integer({ min: 2, max: 128 });

/**
 * Entrada válida por construção para a FASE DE GRUPOS:
 *  - N duplas (4..40) com seeds 1..N;
 *  - numeroDeGrupos G no intervalo válido 1..floor(N/2) (garante menorGrupo>=2);
 *  - classificadosPorGrupo no intervalo válido 1..(menorGrupo-1).
 */
const arbEntradaGrupos = fc.integer({ min: 4, max: 40 }).chain((n) => {
  const maxGrupos = Math.floor(n / 2);
  return fc.integer({ min: 1, max: maxGrupos }).chain((g) => {
    const menorGrupo = Math.floor(n / g);
    return fc
      .integer({ min: 1, max: Math.max(1, menorGrupo - 1) })
      .map((classificadosPorGrupo) => ({ n, g, classificadosPorGrupo }));
  });
});

// ---------------------------------------------------------------------------
// Property 15
// ---------------------------------------------------------------------------

describe("Feature: criar-chaveamento-campeonato, Property 15: Cada dupla aparece exatamente uma vez na primeira fase", () => {
  it("(fase de grupos) a união das duplas dos grupos é exatamente o conjunto cadastrado, cada uma em um único grupo", () => {
    fc.assert(
      fc.property(arbEntradaGrupos, ({ n, g, classificadosPorGrupo }) => {
        const duplas = construirDuplas(n);
        const resultado = gerarChaveamento({
          duplas,
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

        // Conjunto esperado: todos os ids cadastrados.
        const esperado = new Set(bracket.duplas.map((d) => d.id));

        // Multiset da primeira fase: cada id, quantas vezes aparece somando
        // todos os grupos. Cada aparição deve ser única (um grupo só).
        const ocorrencias = new Map<string, number>();
        for (const grupo of bracket.grupos) {
          for (const pairId of grupo.duplas) {
            ocorrencias.set(pairId, (ocorrencias.get(pairId) ?? 0) + 1);
          }
        }

        // (1) Nenhuma dupla repetida entre grupos: toda ocorrência é exatamente 1.
        for (const [pairId, vezes] of ocorrencias) {
          expect(vezes).toBe(1);
          // E toda dupla presente é uma dupla cadastrada (sem intrusos).
          expect(esperado.has(pairId)).toBe(true);
        }

        // (2) O conjunto coberto é EXATAMENTE o conjunto cadastrado.
        expect(new Set(ocorrencias.keys())).toEqual(esperado);

        // (3) Contagem total = N (reforça o multiset como conjunto, sem sobra).
        const totalMembros = bracket.grupos.reduce(
          (acc, grupo) => acc + grupo.duplas.length,
          0,
        );
        expect(totalMembros).toBe(n);
      }),
      { numRuns: 200 },
    );
  });

  it("(dupla eliminação) as duplas reais da 1ª rodada da upper são exatamente o conjunto cadastrado, cada uma uma única vez (byes ignorados)", () => {
    fc.assert(
      fc.property(arbEntradaEliminacao, (m) => {
        const duplas = construirDuplas(m);
        const resultado = gerarChaveamento({
          duplas,
          config: { formato: "dupla eliminação" },
        });

        expect(resultado.ok).toBe(true);
        if (!resultado.ok) return;

        const bracket: Bracket = resultado.bracket;

        // Conjunto esperado: todos os ids cadastrados.
        const esperado = new Set(bracket.duplas.map((d) => d.id));

        // 1ª rodada da chave de vencedores.
        const upperR1 = bracket.matches.filter(
          (jogo) => jogo.side === "upper" && jogo.rodada === 1,
        );

        // Coleta os participantes REAIS de ambos os slots, ignorando byes e
        // slots indefinidos (pairId == null).
        const ocorrencias = new Map<string, number>();
        const registrar = (
          pairId: string | null,
          bye: boolean | undefined,
        ): void => {
          if (bye === true) return; // byes não contam
          if (pairId === null) return; // slot indefinido não conta
          ocorrencias.set(pairId, (ocorrencias.get(pairId) ?? 0) + 1);
        };
        for (const jogo of upperR1) {
          registrar(jogo.a.pairId, jogo.a.bye);
          registrar(jogo.b.pairId, jogo.b.bye);
        }

        // (1) Toda dupla real aparece EXATAMENTE uma vez na 1ª rodada da upper.
        for (const [pairId, vezes] of ocorrencias) {
          expect(vezes).toBe(1);
          expect(esperado.has(pairId)).toBe(true);
        }

        // (2) O conjunto coberto é EXATAMENTE o conjunto cadastrado (toda dupla
        //     real presente uma vez, sem faltar nenhuma e sem intrusos).
        expect(new Set(ocorrencias.keys())).toEqual(esperado);

        // (3) O total de participantes reais da 1ª rodada é exatamente M.
        expect(ocorrencias.size).toBe(m);
      }),
      { numRuns: 200 },
    );
  });
});
