import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { gerarChaveamento } from "../src/domain/bracket/generator";
import type { BracketConfig, Pair } from "../src/domain/bracket/types";

// ---------------------------------------------------------------------------
// Property tests de CONTAGEM/estrutura do Bracket_Generator (dupla eliminação).
//
// Este arquivo concentra as propriedades do gerador ligadas a limites e
// contagem de jogos. A Property 14 está implementada abaixo; as Properties 16
// (byes completam a potência de dois) e 17 (2M−2 jogos decisivos) recebem o
// seu próprio `describe` em tarefas seguintes — por isso os helpers de geração
// de duplas ficam no topo, compartilháveis entre os blocos.
// ---------------------------------------------------------------------------

/** Config de mata-mata: o limite [2,128] é checado antes do switch de formato. */
const CONFIG_DUPLA_ELIMINACAO: BracketConfig = { formato: "dupla eliminação" };

/**
 * Gera uma dupla "válida" determinística a partir de um seed consecutivo.
 * ids únicos (derivados do seed), nomes/atletas não vazios e `seed` = posição.
 */
function duplaComSeed(seed: number): Pair {
  return {
    id: `dupla-${seed}`,
    nomeDupla: `Dupla ${seed}`,
    atletaA: `Atleta A${seed}`,
    atletaB: `Atleta B${seed}`,
    seed,
    criadoEm: `2026-01-01T00:00:${String(seed % 60).padStart(2, "0")}.000Z`,
  };
}

/**
 * Lista de N duplas válidas com seeds consecutivos 1..N: ids únicos, nomes e
 * atletas não vazios, seeds = 1..N sem lacuna/repetição.
 */
function duplasComSeedConsecutivo(n: number): Pair[] {
  return Array.from({ length: n }, (_, i) => duplaComSeed(i + 1));
}

describe("Feature: criar-chaveamento-campeonato, Property 14: Número de duplas fora de [2,128] é rejeitado", () => {
  // Validates: Requirements 4.3, 4.4

  it("(insuficiente) listas com 0 ou 1 dupla são rejeitadas com DUPLAS_INSUFICIENTES e sem produzir jogos (Validates: Requirements 4.3)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 }), (n) => {
        const resultado = gerarChaveamento({
          duplas: duplasComSeedConsecutivo(n),
          config: CONFIG_DUPLA_ELIMINACAO,
        });
        expect(resultado.ok).toBe(false);
        if (resultado.ok) return;
        expect(resultado.erro.code).toBe("DUPLAS_INSUFICIENTES");
        // Nenhum bracket/jogo é produzido no ramo de rejeição.
        expect("bracket" in resultado).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it("(excesso) listas com mais de 128 duplas são rejeitadas com DUPLAS_EXCEDEM_LIMITE e sem produzir jogos (Validates: Requirements 4.4)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 129, max: 160 }), (n) => {
        const resultado = gerarChaveamento({
          duplas: duplasComSeedConsecutivo(n),
          config: CONFIG_DUPLA_ELIMINACAO,
        });
        expect(resultado.ok).toBe(false);
        if (resultado.ok) return;
        expect(resultado.erro.code).toBe("DUPLAS_EXCEDEM_LIMITE");
        // Nenhum bracket/jogo é produzido no ramo de rejeição.
        expect("bracket" in resultado).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it("(limite 2..128) o código de erro corresponde exatamente ao lado violado (Validates: Requirements 4.3, 4.4)", () => {
    // Combina os dois ramos fora do intervalo [2,128] num único gerador e
    // confere que o code retornado é o esperado para cada tamanho.
    const foraDoIntervalo = fc.oneof(
      fc.integer({ min: 0, max: 1 }),
      fc.integer({ min: 129, max: 160 }),
    );
    fc.assert(
      fc.property(foraDoIntervalo, (n) => {
        const resultado = gerarChaveamento({
          duplas: duplasComSeedConsecutivo(n),
          config: CONFIG_DUPLA_ELIMINACAO,
        });
        expect(resultado.ok).toBe(false);
        if (resultado.ok) return;
        const esperado = n < 2 ? "DUPLAS_INSUFICIENTES" : "DUPLAS_EXCEDEM_LIMITE";
        expect(resultado.erro.code).toBe(esperado);
        expect(["DUPLAS_INSUFICIENTES", "DUPLAS_EXCEDEM_LIMITE"]).toContain(
          resultado.erro.code,
        );
      }),
      { numRuns: 200 },
    );
  });
});

// Feature: criar-chaveamento-campeonato, Property 16: Byes completam a potência de dois e favorecem as melhores cabeças
describe("Feature: criar-chaveamento-campeonato, Property 16: Byes completam a potência de dois e favorecem as melhores cabeças", () => {
  // Validates: Requirements 4.6

  /** Próxima potência de dois ≥ n (independente do gerador). */
  function proximaPotenciaDeDois(n: number): number {
    let s = 1;
    while (s < n) s *= 2;
    return s;
  }

  it("(byes na 1ª rodada da upper) o número de byes é (próxima potência de dois ≥ M) − M e os byes caem sobre as melhores cabeças (Validates: Requirements 4.6)", () => {
    // Verificação (documentada):
    //   1. Gerar o chaveamento de dupla eliminação com M duplas (seeds 1..M).
    //   2. Isolar os jogos da 1ª rodada da chave de vencedores (side="upper",
    //      rodada=1). Em cada jogo os slots a/b já vêm preenchidos pelo gerador:
    //      uma dupla real (pairId != null, bye != true) ou um bye (bye === true).
    //   3. Contar os slots com bye === true nessa rodada e confirmar que a
    //      contagem é exatamente (próxima potência de dois ≥ M) − M.
    //   4. Para CADA bye, o adversário (o outro slot do MESMO jogo) é uma dupla
    //      real. Esses adversários são precisamente as melhores cabeças: o
    //      conjunto de seeds dos adversários de bye deve ser {1, 2, ..., B}, onde
    //      B = número de byes — ou seja, exatamente as B menores cabeças.
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 128 }), (m) => {
        const resultado = gerarChaveamento({
          duplas: duplasComSeedConsecutivo(m),
          config: CONFIG_DUPLA_ELIMINACAO,
        });
        expect(resultado.ok).toBe(true);
        if (!resultado.ok) return;

        const { bracket } = resultado;
        const s = proximaPotenciaDeDois(m);
        const byesEsperados = s - m;

        // 1ª rodada da chave de vencedores.
        const upperR1 = bracket.matches.filter(
          (jogo) => jogo.side === "upper" && jogo.rodada === 1,
        );

        // Mapa pairId -> seed, para traduzir adversários de bye em cabeças.
        const seedDoPairId = new Map<string, number>();
        for (const d of bracket.duplas) seedDoPairId.set(d.id, d.seed);

        // Conta byes e coleta os seeds dos adversários de cada bye.
        let totalByes = 0;
        const seedsAdversariosDeBye: number[] = [];
        for (const jogo of upperR1) {
          const aBye = jogo.a.bye === true;
          const bBye = jogo.b.bye === true;
          if (aBye) {
            totalByes++;
            // Adversário do bye é o outro slot: deve ser uma dupla real.
            expect(jogo.b.bye === true).toBe(false);
            expect(jogo.b.pairId).not.toBeNull();
            const seed = seedDoPairId.get(jogo.b.pairId as string);
            expect(seed).toBeDefined();
            seedsAdversariosDeBye.push(seed as number);
          }
          if (bBye) {
            totalByes++;
            expect(jogo.a.bye === true).toBe(false);
            expect(jogo.a.pairId).not.toBeNull();
            const seed = seedDoPairId.get(jogo.a.pairId as string);
            expect(seed).toBeDefined();
            seedsAdversariosDeBye.push(seed as number);
          }
          // Nunca um jogo bye×bye na 1ª rodada (M ≥ 2 ⇒ byes < S/2).
          expect(aBye && bBye).toBe(false);
        }

        // (contagem) byes = (próxima potência de dois ≥ M) − M.
        expect(totalByes).toBe(byesEsperados);

        // (melhores cabeças) os adversários de bye são exatamente as B menores
        // cabeças: o conjunto de seeds deve ser {1,2,...,B}.
        const ordenados = [...seedsAdversariosDeBye].sort((x, y) => x - y);
        const esperado = Array.from({ length: byesEsperados }, (_, i) => i + 1);
        expect(ordenados).toEqual(esperado);
      }),
      { numRuns: 200 },
    );
  });

  it("(sem byes quando M é potência de dois) a 1ª rodada da upper não tem bye e todos os slots são duplas reais (Validates: Requirements 4.6)", () => {
    // Caso-âncora complementar: para M potência de dois (2,4,8,...,128) não há
    // bye algum — reforça que byes aparecem SOMENTE para completar a potência.
    const potencias = [2, 4, 8, 16, 32, 64, 128];
    fc.assert(
      fc.property(fc.constantFrom(...potencias), (m) => {
        const resultado = gerarChaveamento({
          duplas: duplasComSeedConsecutivo(m),
          config: CONFIG_DUPLA_ELIMINACAO,
        });
        expect(resultado.ok).toBe(true);
        if (!resultado.ok) return;

        const upperR1 = resultado.bracket.matches.filter(
          (jogo) => jogo.side === "upper" && jogo.rodada === 1,
        );
        for (const jogo of upperR1) {
          expect(jogo.a.bye === true).toBe(false);
          expect(jogo.b.bye === true).toBe(false);
          expect(jogo.a.pairId).not.toBeNull();
          expect(jogo.b.pairId).not.toBeNull();
        }
      }),
      { numRuns: 200 },
    );
  });
});

// Feature: criar-chaveamento-campeonato, Property 17: Dupla eliminação produz exatamente 2M−2 jogos decisivos
describe("Feature: criar-chaveamento-campeonato, Property 17: Dupla eliminação produz exatamente 2M−2 jogos decisivos", () => {
  // Validates: Requirements 4.7

  it("(contagem de decisivos) somando upper + lower + grande final há exatamente 2M−2 jogos cujos dois slots são duplas reais, sem bye (Validates: Requirements 4.7)", () => {
    // Abordagem de contagem (documentada):
    //   O gerador PROPAGA os byes pelo grafo de avanço/encaminhamento: todo slot
    //   que só pode ser ocupado por um walkover recebe `bye: true`. Assim, após a
    //   geração, um jogo é DECISIVO sse NENHUM de seus dois slots é bye
    //   (a.bye !== true && b.bye !== true) — critério válido tanto para a 1ª
    //   rodada quanto para as rodadas futuras, cujos byes já vêm propagados.
    //
    //   Contamos diretamente, em TODOS os jogos (grupo não se aplica aqui: é só
    //   dupla eliminação), quantos satisfazem esse critério e exigimos que o
    //   total seja exatamente 2·M − 2. Isso alinha a contagem ao que o gerador
    //   produz: slots indefinidos que NÃO foram marcados como bye correspondem a
    //   confrontos reais futuros (duas duplas reais chegarão até ali).
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 128 }), (m) => {
        const resultado = gerarChaveamento({
          duplas: duplasComSeedConsecutivo(m),
          config: CONFIG_DUPLA_ELIMINACAO,
        });
        expect(resultado.ok).toBe(true);
        if (!resultado.ok) return;

        const decisivos = resultado.bracket.matches.filter(
          (jogo) => jogo.a.bye !== true && jogo.b.bye !== true,
        );

        expect(decisivos.length).toBe(2 * m - 2);
      }),
      { numRuns: 200 },
    );
  });

  it("(decomposição por chave) decisivos = (M−1) na upper + (M−2) na lower + 1 na grande final (Validates: Requirements 4.7)", () => {
    // Verificação cruzada da estrutura: além do total 2M−2, confere a divisão
    // por chave esperada para dupla eliminação com grande final única:
    //   - upper: M−1 jogos decisivos (uma eliminação simples sobre M duplas).
    //   - lower: M−2 jogos decisivos.
    //   - grande final: 1 jogo decisivo.
    // Vale também para potências de dois e não-potências (byes propagados só
    // removem jogos NÃO decisivos).
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 128 }), (m) => {
        const resultado = gerarChaveamento({
          duplas: duplasComSeedConsecutivo(m),
          config: CONFIG_DUPLA_ELIMINACAO,
        });
        expect(resultado.ok).toBe(true);
        if (!resultado.ok) return;

        const decisivo = (side: string) =>
          resultado.bracket.matches.filter(
            (jogo) =>
              jogo.side === side &&
              jogo.a.bye !== true &&
              jogo.b.bye !== true,
          ).length;

        expect(decisivo("upper")).toBe(m - 1);
        expect(decisivo("lower")).toBe(m - 2);
        expect(decisivo("grande-final")).toBe(1);
      }),
      { numRuns: 200 },
    );
  });
});
