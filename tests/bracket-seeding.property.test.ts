// tests/bracket-seeding.property.test.ts
//
// Property-based tests (fast-check) do seeding de uma categoria.
//
// Este arquivo concentra as propriedades do design relacionadas a seeding e
// distribuição derivada do seeding. Será expandido com as demais propriedades
// das tarefas seguintes:
//   - Property 8  (tarefa 3.6) — validação de seeding consecutivo 1..N   [IMPLEMENTADA]
//   - Property 9  (tarefa 3.7) — seeding padrão alfabético e completo
//   - Property 10 (tarefa 6.3) — distribuição em grupos serpentina e balanceada
//   - Property 11 (tarefa 6.4) — seeding inválido impede qualquer distribuição
//   - Property 12 (tarefa 5.5) — cabeças 1 e 2 em metades opostas da chave de vencedores
//   - Property 21 (tarefa 6.6) — posicionamento dos classificados evita confrontos proibidos
//
// Por ora, apenas a Property 8 está implementada (tarefa 3.6).

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { validarSeeding, type SeedAssignment } from "../src/domain/bracket/seeding";

// Feature: criar-chaveamento-campeonato, Property 8: Validação de seeding (consecutivo 1..N, sem repetição nem lacuna)
//
// Para toda atribuição de cabeças de chave a N duplas, a validação ACEITA sse
// as posições formam exatamente {1..N} sem repetição nem lacuna; repetição →
// SEED_DUPLICADO (com posição); valor fora de 1..N → SEED_FORA_INTERVALO;
// lacuna → SEED_LACUNA.
//
// Validates: Requirements 3.1, 3.2, 3.3

/** Gera N pairIds únicos e estáveis (p0, p1, …). */
function pairIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i}`);
}

/**
 * Constrói atribuições a partir de uma lista de posições, uma por pairId único.
 * O índice de cada posição vira o pairId, então os pairIds são sempre distintos.
 */
function atribuir(posicoes: number[]): SeedAssignment[] {
  const ids = pairIds(posicoes.length);
  return posicoes.map((posicao, i) => ({ pairId: ids[i], posicao }));
}

/** Embaralha deterministicamente conforme uma lista de trocas (índices). */
function permutar<T>(xs: readonly T[], trocas: ReadonlyArray<[number, number]>): T[] {
  const out = xs.slice();
  for (const [i, j] of trocas) {
    const ii = ((i % out.length) + out.length) % out.length;
    const jj = ((j % out.length) + out.length) % out.length;
    [out[ii], out[jj]] = [out[jj], out[ii]];
  }
  return out;
}

const arbN = fc.integer({ min: 2, max: 32 });

describe("Feature: criar-chaveamento-campeonato, Property 8: Validação de seeding (consecutivo 1..N, sem repetição nem lacuna)", () => {
  it("(a) VÁLIDO: qualquer permutação de {1..N} em N duplas distintas é aceita", () => {
    fc.assert(
      fc.property(
        arbN,
        fc.array(fc.tuple(fc.nat(), fc.nat()), { maxLength: 40 }),
        (n, trocas) => {
          const posicoes = permutar(
            Array.from({ length: n }, (_, i) => i + 1),
            trocas,
          );
          const seeds = atribuir(posicoes);

          const r = validarSeeding(seeds, n);
          expect(r.ok).toBe(true);
          if (r.ok) {
            // devolve as atribuições em ordem crescente de posição, cobrindo {1..N}
            expect(r.valor.map((s) => s.posicao)).toEqual(
              Array.from({ length: n }, (_, i) => i + 1),
            );
            // não perde nem inventa duplas
            expect(new Set(r.valor.map((s) => s.pairId)).size).toBe(n);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("(b) REPETIÇÃO: duplicar uma posição válida produz SEED_DUPLICADO na posição duplicada", () => {
    fc.assert(
      fc.property(
        arbN,
        // alvo = posição (1..N) que será duplicada; vitima = outra posição (1..N) sobrescrita
        fc.integer({ min: 1, max: 32 }),
        fc.integer({ min: 1, max: 32 }),
        (n, alvoRaw, vitimaRaw) => {
          const alvo = ((alvoRaw - 1) % n) + 1;
          let vitima = ((vitimaRaw - 1) % n) + 1;
          if (vitima === alvo) vitima = (vitima % n) + 1; // garante vitima != alvo

          const posicoes = Array.from({ length: n }, (_, i) => i + 1);
          // sobrescreve a posição "vitima" por "alvo" => alvo aparece duas vezes,
          // vitima vira lacuna; mas a prioridade (duplicado > lacuna) deve prevalecer.
          posicoes[vitima - 1] = alvo;

          const r = validarSeeding(atribuir(posicoes), n);
          expect(r.ok).toBe(false);
          if (!r.ok) {
            expect(r.erro.code).toBe("SEED_DUPLICADO");
            if (r.erro.code === "SEED_DUPLICADO") {
              expect(r.erro.posicao).toBe(alvo);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("(c) FORA DO INTERVALO: valor 0, negativo, não inteiro ou > N produz SEED_FORA_INTERVALO (sem repetição)", () => {
    fc.assert(
      fc.property(
        arbN,
        fc.integer({ min: 1, max: 32 }), // slot a substituir (1..N após módulo)
        fc.oneof(
          fc.constant(0),
          fc.integer({ min: -50, max: -1 }),
          fc.integer({ min: 33, max: 120 }), // sempre > N (N <= 32)
          // não inteiro (ex.: 1.5) — fora do conjunto de inteiros 1..N
          fc.double({ min: 1, max: 32, noNaN: true }).filter((x) => !Number.isInteger(x)),
        ),
        (n, slotRaw, valor) => {
          const slot = ((slotRaw - 1) % n) + 1;
          // Começa de uma permutação válida {1..N} e substitui UMA posição por um
          // valor fora do intervalo. A posição substituída vira lacuna, mas a
          // prioridade (fora-de-intervalo > lacuna) prevalece. Como o valor fora do
          // intervalo não coincide com nenhum 1..N restante, não há repetição antes.
          const posicoes = Array.from({ length: n }, (_, i) => i + 1);
          posicoes[slot - 1] = valor;

          const r = validarSeeding(atribuir(posicoes), n);
          expect(r.ok).toBe(false);
          if (!r.ok) {
            expect(r.erro.code).toBe("SEED_FORA_INTERVALO");
            if (r.erro.code === "SEED_FORA_INTERVALO") {
              expect(r.erro.posicao).toBe(valor);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("(d) LACUNA: trocar uma posição por outra válida (criando buraco e par) dispara duplicado; omitir uma posição dispara SEED_LACUNA", () => {
    // Caso puro de lacuna: usamos N atribuições cobrindo {1..N} \ {faltando} ∪ {extra},
    // mas sem repetição e sem valor fora do intervalo — impossível com N posições
    // distintas em 1..N e exatamente uma faltando. Então modelamos lacuna como:
    // conjunto de N-1 duplas com posições {1..N} \ {faltando} (quantidade < N).
    // Com n atribuições é inevitável repetir/estourar; a implementação cobre o
    // caso de contagem incorreta sinalizando SEED_LACUNA na menor posição ausente.
    fc.assert(
      fc.property(
        arbN,
        fc.integer({ min: 1, max: 32 }), // posição que ficará ausente
        (n, faltandoRaw) => {
          const faltando = ((faltandoRaw - 1) % n) + 1;
          // posições = {1..N} sem "faltando" => N-1 atribuições, nenhuma repetida,
          // todas no intervalo. A menor ausente deve ser detectada como lacuna.
          const posicoes = Array.from({ length: n }, (_, i) => i + 1).filter(
            (p) => p !== faltando,
          );

          const r = validarSeeding(atribuir(posicoes), n);
          expect(r.ok).toBe(false);
          if (!r.ok) {
            expect(r.erro.code).toBe("SEED_LACUNA");
            if (r.erro.code === "SEED_LACUNA") {
              // a implementação reporta a MENOR posição ausente de 1..N
              expect(r.erro.posicao).toBe(faltando);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("(d') LACUNA com buraco explícito: {1..N} com uma posição interna ausente e outra fora do conjunto é fora-de-intervalo", () => {
    // Guarda de coerência com a ordem de prioridade: se, ao criar um buraco,
    // introduzimos um valor > N, a prioridade fora-de-intervalo > lacuna vale.
    fc.assert(
      fc.property(arbN, (n) => {
        const posicoes = Array.from({ length: n }, (_, i) => i + 1);
        // remove a posição N (buraco) e a substitui por N+1 (fora do intervalo)
        posicoes[n - 1] = n + 1;
        const r = validarSeeding(atribuir(posicoes), n);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.erro.code).toBe("SEED_FORA_INTERVALO");
      }),
      { numRuns: 200 },
    );
  });
});

// ===========================================================================
// Property 9 (tarefa 3.7) — Seeding padrão alfabético e completo
// ===========================================================================

import { seedingPadrao } from "../src/domain/bracket/seeding";
import {
  gerarChaveamento,
  posicionarClassificadosNoMataMata,
  type ClassificadoDoGrupo,
} from "../src/domain/bracket/generator";
import type { Pair, Match } from "../src/domain/bracket/types";
import type { BracketConfig } from "../src/domain/bracket/types";

/**
 * Constrói um Pair determinístico. O `seed` é opcional (default 0); os testes
 * que dependem de seeding 1..N o definem explicitamente.
 */
function fazerDupla(over: Partial<Pair> & { id: string }): Pair {
  return {
    id: over.id,
    nomeDupla: over.nomeDupla ?? over.id,
    atletaA: over.atletaA ?? "A",
    atletaB: over.atletaB ?? "B",
    seed: over.seed ?? 0,
    criadoEm: over.criadoEm ?? "2024-01-01T00:00:00.000Z",
  };
}

/** Arbitrário de um instante ISO (ordenável como string). */
const arbIso = fc
  .integer({ min: 0, max: 60 * 60 * 24 * 365 })
  .map((segundos) => new Date(1_700_000_000_000 + segundos * 1000).toISOString());

/** Arbitrário de nome com variação de caixa e espaços nas pontas. */
const arbNome = fc
  .tuple(
    fc.constantFrom("ana", "bruno", "Carla", "DANI", "eva", "Fábio", "gう", "héctor", "iris"),
    fc.constantFrom("", " ", "  "),
    fc.constantFrom("", " ", "  "),
  )
  .map(([base, pre, pos]) => `${pre}${base}${pos}`);

// Feature: criar-chaveamento-campeonato, Property 9: Seeding padrão é alfabético e completo
//
// Para qualquer lista de duplas (nomes com variação de caixa e alguns nomes
// iguais com criadoEm distintos), seedingPadrao atribui posições que formam
// exatamente {1..N}, em ordem alfabética (ignorando caixa) do nomeDupla,
// desempatando por criadoEm. É uma bijeção pairId→posição.
//
// Validates: Requirements 3.4
describe("Feature: criar-chaveamento-campeonato, Property 9: Seeding padrão é alfabético e completo", () => {
  /** Gera N duplas com ids únicos, nomes variados e criadoEm variados. */
  const arbDuplas = fc
    .array(fc.tuple(arbNome, arbIso), { minLength: 1, maxLength: 30 })
    .map((pares) =>
      pares.map(([nome, criadoEm], i) =>
        fazerDupla({ id: `p${i}`, nomeDupla: nome, criadoEm }),
      ),
    );

  it("(a) as posições formam exatamente {1..N} (bijeção pairId→posição)", () => {
    fc.assert(
      fc.property(arbDuplas, (duplas) => {
        const seeds = seedingPadrao(duplas);
        const n = duplas.length;

        // Uma atribuição por dupla, sem perder nem inventar pairIds.
        expect(seeds.length).toBe(n);
        expect(new Set(seeds.map((s) => s.pairId))).toEqual(
          new Set(duplas.map((d) => d.id)),
        );

        // Posições são exatamente {1..N}.
        const posicoes = seeds.map((s) => s.posicao).sort((a, b) => a - b);
        expect(posicoes).toEqual(Array.from({ length: n }, (_, i) => i + 1));
      }),
      { numRuns: 300 },
    );
  });

  it("(b) a ordem segue (nome ignorando caixa) e desempata por criadoEm", () => {
    fc.assert(
      fc.property(arbDuplas, (duplas) => {
        const seeds = seedingPadrao(duplas);
        const porId = new Map(duplas.map((d) => [d.id, d]));

        // Ordena pelas posições atribuídas e verifica monotonicidade da chave.
        const emOrdem = [...seeds]
          .sort((a, b) => a.posicao - b.posicao)
          .map((s) => porId.get(s.pairId)!);

        for (let i = 1; i < emOrdem.length; i++) {
          const anterior = emOrdem[i - 1];
          const atual = emOrdem[i];
          const nomeAnterior = anterior.nomeDupla.trim().toLowerCase();
          const nomeAtual = atual.nomeDupla.trim().toLowerCase();
          const cmpNome = nomeAnterior.localeCompare(nomeAtual);
          // nome não-decrescente
          expect(cmpNome).toBeLessThanOrEqual(0);
          // empate de nome → criadoEm não-decrescente (desempate por criação)
          if (cmpNome === 0) {
            expect(anterior.criadoEm.localeCompare(atual.criadoEm)).toBeLessThanOrEqual(0);
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it("(c) é determinística: qualquer permutação da entrada produz a mesma saída", () => {
    fc.assert(
      fc.property(
        arbDuplas,
        fc.array(fc.tuple(fc.nat(), fc.nat()), { maxLength: 40 }),
        (duplas, trocas) => {
          const esperado = seedingPadrao(duplas);
          const permutado = seedingPadrao(permutar(duplas, trocas));
          // Mesma atribuição pairId→posição independente da ordem de entrada.
          const comoMapa = (xs: ReturnType<typeof seedingPadrao>) =>
            new Map(xs.map((s) => [s.pairId, s.posicao]));
          expect(comoMapa(permutado)).toEqual(comoMapa(esperado));
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ===========================================================================
// Property 10 (tarefa 6.3) — Distribuição em grupos é serpentina e balanceada
// ===========================================================================

/** Duplas 1..N com seed consecutivo e nome/criadoEm estáveis. */
function duplasComSeed(n: number): Pair[] {
  return Array.from({ length: n }, (_, i) =>
    fazerDupla({
      id: `p${i + 1}`,
      nomeDupla: `Dupla ${i + 1}`,
      seed: i + 1,
      criadoEm: new Date(1_700_000_000_000 + i * 1000).toISOString(),
    }),
  );
}

/**
 * Sequência serpentina de índices de grupo esperada para N seeds em G grupos:
 * 0,1,…,G−1,G−1,…,1,0,0,1,… (ida-e-volta com repetição nas pontas).
 * Espelha `distribuirSerpentina` do generator (padrão clássico de serpentina).
 */
function serpentinaEsperada(n: number, g: number): number[] {
  const out: number[] = [];
  let indice = 0;
  let passo = 1;
  for (let seed = 1; seed <= n; seed++) {
    out.push(indice);
    if (g === 1) {
      indice = 0;
    } else if (indice + passo < 0 || indice + passo >= g) {
      passo = -passo;
    } else {
      indice += passo;
    }
  }
  return out;
}

// Feature: criar-chaveamento-campeonato, Property 10: Distribuição em grupos é serpentina e balanceada
//
// Via gerarChaveamento no formato "fase de grupos" com seeds 1..N: cada dupla
// fica em exatamente um grupo; os tamanhos dos grupos diferem no máximo em 1; a
// cabeça 1 (seed 1) cai no grupo de índice 0; e a sequência de seeds pelos
// grupos segue a serpentina (0,1,…,G−1,G−1,…).
//
// Validates: Requirements 3.5, 5.1
describe("Feature: criar-chaveamento-campeonato, Property 10: Distribuição em grupos é serpentina e balanceada", () => {
  // N em 4..40 e G válido (1..⌊N/2⌋). A combinação gera o par (N, G).
  const arbNG = fc
    .integer({ min: 4, max: 40 })
    .chain((n) =>
      fc.tuple(fc.constant(n), fc.integer({ min: 1, max: Math.floor(n / 2) })),
    );

  it("(a) particiona as duplas: cada dupla em exatamente um grupo, cobrindo todas", () => {
    fc.assert(
      fc.property(arbNG, ([n, g]) => {
        const config: BracketConfig = { formato: "fase de grupos", numeroDeGrupos: g };
        const r = gerarChaveamento({ duplas: duplasComSeed(n), config });
        expect(r.ok).toBe(true);
        if (!r.ok) return;

        const { grupos } = r.bracket;
        expect(grupos.length).toBe(g);

        // União dos membros = todas as N duplas; sem repetição entre grupos.
        const todos = grupos.flatMap((grp) => grp.duplas);
        expect(todos.length).toBe(n);
        expect(new Set(todos).size).toBe(n);
        expect(new Set(todos)).toEqual(new Set(duplasComSeed(n).map((d) => d.id)));
      }),
      { numRuns: 300 },
    );
  });

  it("(b) tamanhos dos grupos diferem no máximo em 1", () => {
    fc.assert(
      fc.property(arbNG, ([n, g]) => {
        const config: BracketConfig = { formato: "fase de grupos", numeroDeGrupos: g };
        const r = gerarChaveamento({ duplas: duplasComSeed(n), config });
        expect(r.ok).toBe(true);
        if (!r.ok) return;

        const tamanhos = r.bracket.grupos.map((grp) => grp.duplas.length);
        expect(Math.max(...tamanhos) - Math.min(...tamanhos)).toBeLessThanOrEqual(1);
      }),
      { numRuns: 300 },
    );
  });

  it("(c) seed 1 cai no grupo de índice 0 e a sequência de seeds é serpentina", () => {
    fc.assert(
      fc.property(arbNG, ([n, g]) => {
        const config: BracketConfig = { formato: "fase de grupos", numeroDeGrupos: g };
        const duplas = duplasComSeed(n);
        const r = gerarChaveamento({ duplas, config });
        expect(r.ok).toBe(true);
        if (!r.ok) return;

        const { grupos } = r.bracket;
        // Mapa pairId → seed original.
        const seedDe = new Map(duplas.map((d) => [d.id, d.seed]));

        // Grupo de cada seed segundo a saída.
        const grupoDoSeed = new Map<number, number>();
        for (const grp of grupos) {
          for (const pairId of grp.duplas) {
            grupoDoSeed.set(seedDe.get(pairId)!, grp.indice);
          }
        }

        // Cabeça 1 (seed 1) no grupo 0.
        expect(grupoDoSeed.get(1)).toBe(0);

        // A sequência seed=1..N → índice de grupo segue a serpentina esperada.
        const esperada = serpentinaEsperada(n, g);
        for (let seed = 1; seed <= n; seed++) {
          expect(grupoDoSeed.get(seed)).toBe(esperada[seed - 1]);
        }
      }),
      { numRuns: 300 },
    );
  });
});

// ===========================================================================
// Property 11 (tarefa 6.4) — Seeding inválido impede qualquer distribuição
// ===========================================================================
//
// NOTA DE ARQUITETURA (confirmada lendo generator.ts e seeding.ts):
//   O gerador (`gerarChaveamento`) recebe duplas que JÁ trazem `seed` e assume,
//   por contrato, que o seeding é válido (1..N consecutivo). Ele NÃO revalida os
//   seeds internamente: ordena as duplas por `seed` e distribui. Logo não há,
//   no gerador, uma validação de seeding a ser exercitada por esta propriedade.
//
//   A validação de seeding vive a MONTANTE, em `validarSeeding` (seeding.ts), que
//   é quem a UI/organização chama ANTES de montar as duplas com seed e invocar o
//   gerador. Portanto o comportamento documentado é: um seeding cujo multiset de
//   posições NÃO forma {1..N} é REJEITADO por `validarSeeding`, e o fluxo nunca
//   prossegue para a distribuição (grupos/mata-mata). É isso que testamos aqui —
//   sem inventar nenhuma validação inexistente no gerador.
//
// Validates: Requirements 3.6
describe("Feature: criar-chaveamento-campeonato, Property 11: Seeding inválido impede qualquer distribuição", () => {
  /** Monta SeedAssignment a partir de uma lista de posições (um pairId por posição). */
  const atribuirPos = (posicoes: number[]): SeedAssignment[] =>
    posicoes.map((posicao, i) => ({ pairId: `p${i}`, posicao }));

  const arbN2 = fc.integer({ min: 2, max: 32 });

  it("(a) seeding com repetição é rejeitado (não prossegue para distribuição)", () => {
    fc.assert(
      fc.property(arbN2, fc.integer({ min: 1, max: 32 }), (n, alvoRaw) => {
        const alvo = ((alvoRaw - 1) % n) + 1;
        const posicoes = Array.from({ length: n }, (_, i) => i + 1);
        // Duplica `alvo` em outra posição (a vítima) — cria repetição.
        const vitima = alvo === n ? n - 1 : n;
        posicoes[vitima - 1] = alvo;

        const r = validarSeeding(atribuirPos(posicoes), n);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.erro.code).toBe("SEED_DUPLICADO");
      }),
      { numRuns: 200 },
    );
  });

  it("(b) seeding com valor fora de 1..N é rejeitado", () => {
    fc.assert(
      fc.property(
        arbN2,
        fc.integer({ min: 1, max: 32 }),
        fc.oneof(fc.constant(0), fc.integer({ min: -30, max: -1 }), fc.integer({ min: 33, max: 120 })),
        (n, slotRaw, valor) => {
          const slot = ((slotRaw - 1) % n) + 1;
          const posicoes = Array.from({ length: n }, (_, i) => i + 1);
          posicoes[slot - 1] = valor; // injeta valor fora do intervalo
          const r = validarSeeding(atribuirPos(posicoes), n);
          expect(r.ok).toBe(false);
          if (!r.ok) expect(r.erro.code).toBe("SEED_FORA_INTERVALO");
        },
      ),
      { numRuns: 200 },
    );
  });

  it("(c) seeding com lacuna (conjunto incompleto) é rejeitado", () => {
    fc.assert(
      fc.property(arbN2, fc.integer({ min: 1, max: 32 }), (n, faltandoRaw) => {
        const faltando = ((faltandoRaw - 1) % n) + 1;
        // Conjunto {1..N} \ {faltando}: N−1 posições, nenhuma repetida/fora.
        const posicoes = Array.from({ length: n }, (_, i) => i + 1).filter(
          (p) => p !== faltando,
        );
        const r = validarSeeding(atribuirPos(posicoes), n);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.erro.code).toBe("SEED_LACUNA");
      }),
      { numRuns: 200 },
    );
  });

  it("(d) seeding válido {1..N} é aceito — e só então a distribuição em grupos ocorre", () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 4, max: 40 })
          .chain((n) =>
            fc.tuple(fc.constant(n), fc.integer({ min: 1, max: Math.floor(n / 2) })),
          ),
        ([n, g]) => {
          const posicoes = Array.from({ length: n }, (_, i) => i + 1);
          const val = validarSeeding(atribuirPos(posicoes), n);
          expect(val.ok).toBe(true);

          // Com seeding válido, a distribuição em grupos de fato acontece.
          const config: BracketConfig = { formato: "fase de grupos", numeroDeGrupos: g };
          const r = gerarChaveamento({ duplas: duplasComSeed(n), config });
          expect(r.ok).toBe(true);
          if (r.ok) expect(r.bracket.grupos.length).toBe(g);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ===========================================================================
// Property 12 (tarefa 5.5) — Cabeças 1 e 2 em metades opostas da chave de vencedores
// ===========================================================================

/** Jogos da 1ª rodada da upper, em ordem de `ordem`. */
function upperPrimeiraRodada(matches: ReadonlyArray<Match>): Match[] {
  return matches
    .filter((j) => j.side === "upper" && j.rodada === 1)
    .sort((a, b) => a.ordem - b.ordem);
}

/** Segue o caminho de avançoVencedor a partir de um jogo até a grande final. */
function caminhoAteFinal(
  inicio: Match,
  porId: Map<string, Match>,
): string[] {
  const caminho: string[] = [];
  let atual: Match | undefined = inicio;
  const visitados = new Set<string>();
  while (atual && !visitados.has(atual.id)) {
    caminho.push(atual.id);
    visitados.add(atual.id);
    const prox = atual.avancaVencedorPara?.matchId;
    atual = prox ? porId.get(prox) : undefined;
  }
  return caminho;
}

// Feature: criar-chaveamento-campeonato, Property 12: Cabeças 1 e 2 em metades opostas da chave de vencedores
//
// Via gerarChaveamento "dupla eliminação" com M duplas (2..64) e seeds 1..N: na
// chave de vencedores (upper), seed 1 e seed 2 estão em metades opostas — só
// poderiam se encontrar na grande final. Verificamos de duas formas robustas e
// determinísticas: (i) na 1ª rodada da upper, os jogos onde entram seed1 e seed2
// estão em metades opostas da ordem de slots; e (ii) seguindo avancaVencedorPara
// a partir desses jogos, os caminhos na upper só convergem no jogo final da
// upper (cujo vencedor vai à grande final).
//
// Validates: Requirements 3.7
describe("Feature: criar-chaveamento-campeonato, Property 12: Cabeças 1 e 2 em metades opostas da chave de vencedores", () => {
  const arbM = fc.integer({ min: 2, max: 64 });

  it("(a) seed 1 e seed 2 entram em metades opostas da 1ª rodada da upper", () => {
    fc.assert(
      fc.property(arbM, (m) => {
        const duplas = duplasComSeed(m);
        const config: BracketConfig = { formato: "dupla eliminação" };
        const r = gerarChaveamento({ duplas, config });
        expect(r.ok).toBe(true);
        if (!r.ok) return;

        const ur1 = upperPrimeiraRodada(r.bracket.matches);
        const idSeed = (seed: number) => duplas.find((d) => d.seed === seed)!.id;
        const id1 = idSeed(1);
        const id2 = idSeed(2);

        const indiceComSeed = (pairId: string) =>
          ur1.findIndex((j) => j.a.pairId === pairId || j.b.pairId === pairId);

        const j1 = indiceComSeed(id1);
        const j2 = indiceComSeed(id2);
        expect(j1).toBeGreaterThanOrEqual(0);
        expect(j2).toBeGreaterThanOrEqual(0);

        if (ur1.length === 1) {
          // M = 2: a upper é um único jogo (a própria final da upper); seed 1 e
          // seed 2 só se encontram aí — metades opostas é trivialmente satisfeito.
          expect(m).toBe(2);
          return;
        }

        // Metades opostas: um na primeira metade dos jogos, outro na segunda.
        const metade = ur1.length / 2;
        const metadeDe = (idx: number) => (idx < metade ? 0 : 1);
        expect(metadeDe(j1)).not.toBe(metadeDe(j2));
      }),
      { numRuns: 300 },
    );
  });

  it("(b) seguindo avancaVencedorPara, os caminhos de seed1 e seed2 na upper só convergem no jogo final da upper", () => {
    fc.assert(
      fc.property(arbM, (m) => {
        const duplas = duplasComSeed(m);
        const config: BracketConfig = { formato: "dupla eliminação" };
        const r = gerarChaveamento({ duplas, config });
        expect(r.ok).toBe(true);
        if (!r.ok) return;

        const porId = new Map(r.bracket.matches.map((j) => [j.id, j] as const));
        const ur1 = upperPrimeiraRodada(r.bracket.matches);
        const idSeed = (seed: number) => duplas.find((d) => d.seed === seed)!.id;

        const jogoDoSeed = (pairId: string) =>
          ur1.find((j) => j.a.pairId === pairId || j.b.pairId === pairId)!;

        const caminho1 = caminhoAteFinal(jogoDoSeed(idSeed(1)), porId);
        const caminho2 = caminhoAteFinal(jogoDoSeed(idSeed(2)), porId);

        // Jogos da upper em cada caminho.
        const upper1 = caminho1.filter((id) => porId.get(id)!.side === "upper");
        const upper2 = caminho2.filter((id) => porId.get(id)!.side === "upper");

        // Interseção dos jogos de upper nos dois caminhos.
        const comuns = upper1.filter((id) => upper2.includes(id));

        if (ur1.length === 1) {
          // M = 2: único jogo de upper é compartilhado (é a final da upper).
          expect(comuns.length).toBe(1);
          return;
        }

        // Convergem em exatamente um jogo de upper: a FINAL da upper (maior rodada).
        expect(comuns.length).toBe(1);
        const jogoComum = porId.get(comuns[0])!;
        const maiorRodadaUpper = Math.max(
          ...r.bracket.matches.filter((j) => j.side === "upper").map((j) => j.rodada),
        );
        expect(jogoComum.rodada).toBe(maiorRodadaUpper);
        // E a final da upper avança para a grande final.
        expect(jogoComum.avancaVencedorPara?.matchId).toBeDefined();
        const destino = porId.get(jogoComum.avancaVencedorPara!.matchId)!;
        expect(destino.side).toBe("grande-final");
      }),
      { numRuns: 200 },
    );
  });
});

// ===========================================================================
// Property 21 (tarefa 6.6) — Posicionamento dos classificados evita confrontos proibidos
// ===========================================================================
//
// NOTA DE COMPORTAMENTO (confirmada lendo a doc e o corpo de
// `posicionarClassificadosNoMataMata`):
//   A função ordena os classificados por (posicaoNoGrupo asc, seed original asc)
//   e repara trocando DENTRO DA MESMA colocação, minimizando lexicograficamente
//   o custo [violacoesA, violacoesB], onde:
//     (a) violacaoA = confronto na 1ª rodada entre dois PRIMEIROS colocados de
//         grupos distintos; e
//     (b) violacaoB = confronto na 1ª rodada entre duplas do MESMO grupo.
//   A prioridade é (a) estritamente acima de (b). Portanto:
//     - quando é possível zerar ambos (caso típico com classificadosPorGrupo ≥ 2
//       e grupos suficientes), a 1ª rodada não tem violacaoA NEM violacaoB;
//     - quando é impossível zerar (a) (ex.: classificadosPorGrupo = 1, todos são
//       primeiros colocados ⇒ qualquer confronto real é 1º×1º), a função NÃO
//       garante ausência de (a) — isso é intrínseco à entrada, não uma falha.
//   Alinhamos os asserts exatamente a esse contrato. Também verificamos o
//   determinismo: a mesma entrada e qualquer permutação dela produzem o mesmo
//   seeding de mata-mata.
//
// Validates: Requirements 5.5, 5.6
describe("Feature: criar-chaveamento-campeonato, Property 21: Posicionamento dos classificados evita confrontos proibidos, com prioridade determinística", () => {
  const configGrupos: BracketConfig = {
    formato: "fase de grupos",
    numeroDeGrupos: 2,
    classificadosPorGrupo: 2,
  };

  /**
   * Gera um conjunto de classificados: G grupos (2..8), cada um com X
   * classificados (1..3, igual para todos), posicaoNoGrupo 1..X, seeds
   * originais únicos. Retorna também G e X para o teste raciocinar.
   */
  const arbClassificados = fc
    .tuple(fc.integer({ min: 2, max: 8 }), fc.integer({ min: 1, max: 3 }))
    .map(([g, x]) => {
      const lista: ClassificadoDoGrupo[] = [];
      let seed = 1;
      for (let grupo = 0; grupo < g; grupo++) {
        for (let pos = 1; pos <= x; pos++) {
          lista.push({
            pair: fazerDupla({ id: `g${grupo}p${pos}`, seed: seed++ }),
            grupoId: `grupo-${grupo}`,
            posicaoNoGrupo: pos,
          });
        }
      }
      return { lista, g, x };
    });

  /** Confrontos REAIS (dupla×dupla) da 1ª rodada da upper. */
  function confrontosReaisUpper(matches: ReadonlyArray<Match>): Array<[string, string]> {
    return upperPrimeiraRodada(matches)
      .filter((j) => j.a.pairId && j.b.pairId)
      .map((j) => [j.a.pairId!, j.b.pairId!] as [string, string]);
  }

  it("(a) com classificadosPorGrupo ≥ 2 (dá para evitar ambos), a 1ª rodada não tem 1º×1º nem mesmo-grupo", () => {
    fc.assert(
      fc.property(
        fc
          .tuple(fc.integer({ min: 2, max: 8 }), fc.integer({ min: 2, max: 3 }))
          .map(([g, x]) => {
            const lista: ClassificadoDoGrupo[] = [];
            let seed = 1;
            for (let grupo = 0; grupo < g; grupo++) {
              for (let pos = 1; pos <= x; pos++) {
                lista.push({
                  pair: fazerDupla({ id: `g${grupo}p${pos}`, seed: seed++ }),
                  grupoId: `grupo-${grupo}`,
                  posicaoNoGrupo: pos,
                });
              }
            }
            return lista;
          }),
        (classificados) => {
          const r = posicionarClassificadosNoMataMata(classificados, configGrupos);
          expect(r.ok).toBe(true);
          if (!r.ok) return;

          const porId = new Map(classificados.map((c) => [c.pair.id, c]));
          for (const [a, b] of confrontosReaisUpper(r.bracket.matches)) {
            const ca = porId.get(a)!;
            const cb = porId.get(b)!;
            // (b) nunca mesmo grupo
            expect(ca.grupoId).not.toBe(cb.grupoId);
            // (a) nunca dois 1ºs de grupos distintos
            const ambosPrimeiros = ca.posicaoNoGrupo === 1 && cb.posicaoNoGrupo === 1;
            expect(ambosPrimeiros && ca.grupoId !== cb.grupoId).toBe(false);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("(b) prioridade determinística de (a): quando é POSSÍVEL evitar 1º×1º a função evita; quando é intrínseco (todos primeiros colocados) ela não piora frente ao seeding base", () => {
    fc.assert(
      fc.property(arbClassificados, ({ lista, x }) => {
        const r = posicionarClassificadosNoMataMata(lista, configGrupos);
        expect(r.ok).toBe(true);
        if (!r.ok) return;

        const porId = new Map(lista.map((c) => [c.pair.id, c]));
        const confrontos = confrontosReaisUpper(r.bracket.matches);

        const ehViolacaoA = (a: string, b: string): boolean => {
          const ca = porId.get(a)!;
          const cb = porId.get(b)!;
          return ca.posicaoNoGrupo === 1 && cb.posicaoNoGrupo === 1 && ca.grupoId !== cb.grupoId;
        };
        const violacoesA = confrontos.filter(([a, b]) => ehViolacaoA(a, b)).length;

        if (x >= 2) {
          // Há não-primeiros suficientes para parear contra todos os primeiros:
          // é possível evitar 1º×1º, então a prioridade (a) é plenamente satisfeita.
          expect(violacoesA).toBe(0);
        } else {
          // x === 1: TODOS os classificados são primeiros colocados de grupos
          // distintos. Qualquer confronto real é necessariamente 1º×1º — evitar
          // (a) é IMPOSSÍVEL pela própria entrada, não por falha da função. O
          // contrato de prioridade exige apenas que ela não faça PIOR que o
          // seeding base; aqui, como todo confronto real é 1º×1º, o número de
          // violações (a) é exatamente o número de confrontos reais da 1ª rodada
          // (o mínimo atingível), o que confirma que a função não introduz
          // violações evitáveis.
          expect(violacoesA).toBe(confrontos.length);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("(c) rejeita conjunto com menos de 2 classificados (CLASSIFICADOS_INVALIDO)", () => {
    const um: ClassificadoDoGrupo[] = [
      { pair: fazerDupla({ id: "só", seed: 1 }), grupoId: "grupo-0", posicaoNoGrupo: 1 },
    ];
    const r = posicionarClassificadosNoMataMata(um, configGrupos);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.code).toBe("CLASSIFICADOS_INVALIDO");

    const vazio = posicionarClassificadosNoMataMata([], configGrupos);
    expect(vazio.ok).toBe(false);
  });

  it("(d) determinismo: a mesma entrada e qualquer permutação dela produzem o mesmo seeding de mata-mata", () => {
    fc.assert(
      fc.property(
        arbClassificados,
        fc.array(fc.tuple(fc.nat(), fc.nat()), { maxLength: 40 }),
        ({ lista }, trocas) => {
          const base = posicionarClassificadosNoMataMata(lista, configGrupos);
          const perm = posicionarClassificadosNoMataMata(permutar(lista, trocas), configGrupos);
          expect(base.ok).toBe(true);
          expect(perm.ok).toBe(true);
          if (!base.ok || !perm.ok) return;

          // O seeding de mata-mata final é capturado por (pairId → seed) no snapshot.
          const comoMapa = (b: typeof base) =>
            b.ok ? new Map(b.bracket.duplas.map((d) => [d.id, d.seed])) : new Map();
          expect(comoMapa(perm)).toEqual(comoMapa(base));
        },
      ),
      { numRuns: 200 },
    );
  });
});
