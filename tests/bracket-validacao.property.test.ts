// Feature: criar-chaveamento-campeonato — Property tests dos validadores de domínio.
//
// Este arquivo concentra os property-based tests (fast-check) dos validadores
// puros da feature de chaveamento. Cada propriedade do design tem o seu próprio
// `describe`, tagueado com `// Feature: criar-chaveamento-campeonato, Property N: {texto}`.
//
// IMPORTANTE: este arquivo receberá, nas próximas tarefas, mais `describe`s:
//   - Property 2: Validação de nomes de atletas              (tarefa 2.3)
//   - Property 3: Nome duplicado insensível a espaços e caixa (tarefa 2.4)
//   - Property 4: Listagem de duplas ordenada e determinística (tarefa 2.5)
//   - Property 5: Validação de formato                        (tarefa 3.3)
//   - Property 6: Validação de classificados por grupo        (tarefa 3.4)
//   - Property 7: Validação de número de grupos               (tarefa 3.5)
// Por ora, SOMENTE a Property 1 está implementada aqui.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  validarNomeDupla,
  validarNomesAtletas,
  validarNomeNaoDuplicado,
  chaveNomeDupla,
  listarDuplasOrdenadas,
} from "../src/domain/pairs/validation";
import {
  validarFormato,
  validarClassificadosPorGrupo,
  validarNumeroDeGrupos,
} from "../src/domain/bracket/config";
import type { Pair } from "../src/domain/bracket/types";

const MIN_LEN = 1;
const MAX_LEN = 80;

/** Verdadeiro sse o comprimento após trim está em [1, 80] — oráculo da propriedade. */
function nomeDeveSerAceito(nome: string): boolean {
  const n = nome.trim().length;
  return n >= MIN_LEN && n <= MAX_LEN;
}

// Feature: criar-chaveamento-campeonato, Property 1: Validação de nome de dupla
//
// Para toda string de nome de dupla, a validação ACEITA sse, após remover
// espaços nas extremidades, o comprimento está entre 1 e 80; caso contrário
// rejeita com NOME_DUPLA_INVALIDO.
//
// Validates: Requirements 1.2
describe("Feature: criar-chaveamento-campeonato, Property 1: Validação de nome de dupla", () => {
  /**
   * Gerador amplo de nomes, com peso proposital em casos de fronteira:
   * strings quaisquer, strings com espaços nas extremidades, vazias, só
   * espaços e muito longas (> 80). Cobre tanto o lado aceito quanto o rejeitado.
   */
  const arbNome: fc.Arbitrary<string> = fc.oneof(
    // Strings arbitrárias (qualquer unicode).
    fc.string(),
    // Strings curtas que, com espaços adicionados, podem virar válidas/ inválidas.
    fc.string({ minLength: 0, maxLength: 5 }),
    // Caso só-espaços (deve ser rejeitado: trim -> "").
    fc.nat({ max: 10 }).map((n) => " ".repeat(n)),
    // Conteúdo válido envolto por espaços nas extremidades (trim deixa 1..80).
    fc
      .tuple(
        fc.nat({ max: 5 }),
        fc.string({ minLength: 1, maxLength: 80 }).filter((s) => s.trim().length >= 1),
        fc.nat({ max: 5 })
      )
      .map(([esq, meio, dir]) => " ".repeat(esq) + meio + " ".repeat(dir)),
    // Muito longa (> 80 após trim) — deve ser rejeitada.
    fc.string({ minLength: 81, maxLength: 200 }).filter((s) => s.trim().length > 80),
    // Exatamente no limite superior (80 após trim) — deve ser aceita.
    fc.string({ minLength: 80, maxLength: 80 }).map((s) => s.replace(/\s/g, "x"))
  );

  it("aceita sse o comprimento após trim está entre 1 e 80 (bicondicional)", () => {
    fc.assert(
      fc.property(arbNome, (nome) => {
        const resultado = validarNomeDupla(nome);
        expect(resultado.ok).toBe(nomeDeveSerAceito(nome));
      }),
      { numRuns: 200 }
    );
  });

  it("quando rejeita, o erro é sempre NOME_DUPLA_INVALIDO", () => {
    fc.assert(
      fc.property(arbNome, (nome) => {
        const resultado = validarNomeDupla(nome);
        if (!resultado.ok) {
          expect(resultado.erro.code).toBe("NOME_DUPLA_INVALIDO");
        }
      }),
      { numRuns: 200 }
    );
  });

  it("quando aceita, devolve o nome original inalterado", () => {
    fc.assert(
      fc.property(arbNome, (nome) => {
        const resultado = validarNomeDupla(nome);
        if (resultado.ok) {
          expect(resultado.valor).toBe(nome);
        }
      }),
      { numRuns: 200 }
    );
  });
});

// Feature: criar-chaveamento-campeonato, Property 2: Validação de nomes de atletas
//
// Para todo par de nomes de atletas (A, B), a validação ACEITA sse ambos têm
// comprimento entre 1 e 80 após trim; se exatamente um é inválido, rejeita com
// NOME_ATLETA_INVALIDO apontando o atleta correto (A ou B). Quando ambos são
// inválidos, A tem prioridade (conforme o código: A é verificado primeiro).
//
// Validates: Requirements 1.3
describe("Feature: criar-chaveamento-campeonato, Property 2: Validação de nomes de atletas", () => {
  /** Verdadeiro sse o comprimento após trim está em [1, 80]. */
  function valido(nome: string): boolean {
    const n = nome.trim().length;
    return n >= MIN_LEN && n <= MAX_LEN;
  }

  /**
   * Gerador de nomes de atleta com peso em fronteiras: strings quaisquer,
   * só-espaços (inválido), conteúdo válido com espaços nas pontas, e muito
   * longos (> 80, inválido). Cobre os lados aceito e rejeitado.
   */
  const arbNomeAtleta: fc.Arbitrary<string> = fc.oneof(
    fc.string(),
    fc.string({ minLength: 0, maxLength: 5 }),
    fc.nat({ max: 10 }).map((n) => " ".repeat(n)),
    fc
      .tuple(
        fc.nat({ max: 5 }),
        fc.string({ minLength: 1, maxLength: 80 }).filter((s) => s.trim().length >= 1),
        fc.nat({ max: 5 })
      )
      .map(([esq, meio, dir]) => " ".repeat(esq) + meio + " ".repeat(dir)),
    fc.string({ minLength: 81, maxLength: 200 }).filter((s) => s.trim().length > 80)
  );

  it("aceita sse ambos têm 1..80 após trim (bicondicional)", () => {
    fc.assert(
      fc.property(arbNomeAtleta, arbNomeAtleta, (a, b) => {
        const resultado = validarNomesAtletas(a, b);
        expect(resultado.ok).toBe(valido(a) && valido(b));
      }),
      { numRuns: 200 }
    );
  });

  it("quando exatamente um é inválido, aponta o atleta correto", () => {
    fc.assert(
      fc.property(arbNomeAtleta, arbNomeAtleta, (a, b) => {
        const aOk = valido(a);
        const bOk = valido(b);
        const resultado = validarNomesAtletas(a, b);
        if (aOk && !bOk) {
          expect(resultado.ok).toBe(false);
          if (!resultado.ok) {
            expect(resultado.erro.code).toBe("NOME_ATLETA_INVALIDO");
            if (resultado.erro.code === "NOME_ATLETA_INVALIDO") {
              expect(resultado.erro.qual).toBe("B");
            }
          }
        } else if (!aOk && bOk) {
          expect(resultado.ok).toBe(false);
          if (!resultado.ok) {
            expect(resultado.erro.code).toBe("NOME_ATLETA_INVALIDO");
            if (resultado.erro.code === "NOME_ATLETA_INVALIDO") {
              expect(resultado.erro.qual).toBe("A");
            }
          }
        }
      }),
      { numRuns: 200 }
    );
  });

  it("quando ambos são inválidos, A tem prioridade", () => {
    const arbInvalido: fc.Arbitrary<string> = fc.oneof(
      fc.nat({ max: 10 }).map((n) => " ".repeat(n)),
      fc.string({ minLength: 81, maxLength: 200 }).filter((s) => s.trim().length > 80)
    );
    fc.assert(
      fc.property(arbInvalido, arbInvalido, (a, b) => {
        const resultado = validarNomesAtletas(a, b);
        expect(resultado.ok).toBe(false);
        if (!resultado.ok && resultado.erro.code === "NOME_ATLETA_INVALIDO") {
          expect(resultado.erro.qual).toBe("A");
        }
      }),
      { numRuns: 200 }
    );
  });

  it("quando aceita, devolve os nomes originais inalterados", () => {
    const arbValido: fc.Arbitrary<string> = fc
      .tuple(
        fc.nat({ max: 5 }),
        fc.string({ minLength: 1, maxLength: 80 }).filter((s) => s.trim().length >= 1),
        fc.nat({ max: 5 })
      )
      .map(([esq, meio, dir]) => " ".repeat(esq) + meio + " ".repeat(dir))
      .filter((s) => s.trim().length >= 1 && s.trim().length <= 80);
    fc.assert(
      fc.property(arbValido, arbValido, (a, b) => {
        const resultado = validarNomesAtletas(a, b);
        expect(resultado.ok).toBe(true);
        if (resultado.ok) {
          expect(resultado.valor.atletaA).toBe(a);
          expect(resultado.valor.atletaB).toBe(b);
        }
      }),
      { numRuns: 200 }
    );
  });
});

// Feature: criar-chaveamento-campeonato, Property 3: Detecção de nome duplicado é insensível a espaços e caixa
//
// Para todo nome de dupla e qualquer variação dele obtida alterando espaços nas
// extremidades e/ou a caixa das letras, a verificação de duplicidade considera
// as duas formas equivalentes (acusa NOME_DUPLICADO quando a variação existe na
// lista); e NÃO acusa quando não há correspondência.
//
// Validates: Requirements 1.4
describe("Feature: criar-chaveamento-campeonato, Property 3: Detecção de nome duplicado é insensível a espaços e caixa", () => {
  /** Nome-base não vazio após trim (serve de semente para variações). */
  const arbNomeBase: fc.Arbitrary<string> = fc
    .string({ minLength: 1, maxLength: 60 })
    .filter((s) => s.trim().length >= 1);

  /**
   * Produz uma variação de `nome` alterando espaços nas extremidades e caixa,
   * preservando a mesma chave de comparação (trim + lowercase).
   */
  function arbVariacao(nome: string): fc.Arbitrary<string> {
    const nucleo = nome.trim();
    return fc
      .tuple(
        fc.nat({ max: 4 }),
        fc.nat({ max: 4 }),
        fc.array(fc.boolean(), { minLength: nucleo.length, maxLength: nucleo.length })
      )
      .map(([esq, dir, caixa]) => {
        const transformado = Array.from(nucleo)
          .map((ch, i) => (caixa[i] ? ch.toUpperCase() : ch.toLowerCase()))
          .join("");
        return " ".repeat(esq) + transformado + " ".repeat(dir);
      });
  }

  it("qualquer variação por espaços/caixa de um nome existente acusa NOME_DUPLICADO", () => {
    fc.assert(
      fc.property(
        arbNomeBase.chain((base) =>
          fc.tuple(fc.constant(base), arbVariacao(base), fc.array(fc.string(), { maxLength: 5 }))
        ),
        ([base, variacao, extras]) => {
          const existentes = [...extras, base];
          const resultado = validarNomeNaoDuplicado(variacao, existentes);
          expect(resultado.ok).toBe(false);
          if (!resultado.ok) {
            expect(resultado.erro.code).toBe("NOME_DUPLICADO");
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("não acusa duplicata quando nenhuma entrada compartilha a chave normalizada", () => {
    fc.assert(
      fc.property(
        arbNomeBase,
        fc.array(fc.string(), { maxLength: 8 }),
        (nome, existentes) => {
          const chave = chaveNomeDupla(nome);
          const semColisao = existentes.filter((e) => chaveNomeDupla(e) !== chave);
          const resultado = validarNomeNaoDuplicado(nome, semColisao);
          expect(resultado.ok).toBe(true);
          if (resultado.ok) {
            expect(resultado.valor).toBe(nome);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});

// Feature: criar-chaveamento-campeonato, Property 4: Listagem de duplas é ordenação determinística por (nome, criação)
//
// Para toda lista de Pair, a listagem retorna uma permutação da entrada,
// não-decrescente pela chave composta (nome em caixa baixa, criadoEm), é
// determinística (mesma entrada e qualquer permutação dela produzem a mesma
// saída) e não muta a entrada.
//
// Validates: Requirements 1.7
describe("Feature: criar-chaveamento-campeonato, Property 4: Listagem de duplas é ordenação determinística por (nome, criação)", () => {
  /**
   * Gera uma lista de Pairs com nomes variados (de um conjunto pequeno, para
   * forçar empates de nome que exercitam o desempate por criadoEm) e com id e
   * criadoEm DISTINTOS entre si. Distinguir a chave composta (nome, criadoEm)
   * é proposital: dois Pairs com o mesmo nome E o mesmo criadoEm formariam um
   * empate total, caso em que a ordem relativa depende da ordem de entrada e a
   * saída não é função apenas do conteúdo — ambiguidade fora do escopo desta
   * propriedade de determinismo. O desempate por criadoEm continua exercitado
   * porque nomes repetem com criadoEm diferentes.
   */
  const arbNomeDupla = fc.constantFrom("Alfa", "alfa", " Beta ", "Gama", "delta");

  const arbDuplas: fc.Arbitrary<Pair[]> = fc
    .uniqueArray(fc.integer({ min: 0, max: 1_000_000 }), { maxLength: 20 })
    .chain((instantes) =>
      fc.tuple(
        ...instantes.map((ms, i) =>
          arbNomeDupla.map<Pair>((nomeDupla) => ({
            id: `00000000-0000-1000-8000-${String(i).padStart(12, "0")}`,
            nomeDupla,
            atletaA: "A",
            atletaB: "B",
            seed: 1,
            criadoEm: new Date(1_700_000_000_000 + ms).toISOString(),
          }))
        )
      )
    )
    .map((duplas) => duplas as Pair[]);

  /** Chave composta usada pelo oráculo de ordenação. */
  function chave(p: Pair): [string, string] {
    return [p.nomeDupla.trim().toLowerCase(), p.criadoEm];
  }

  function naoDecrescente(lista: readonly Pair[]): boolean {
    for (let i = 1; i < lista.length; i++) {
      const [na, ca] = chave(lista[i - 1]);
      const [nb, cb] = chave(lista[i]);
      if (na > nb) return false;
      if (na === nb && ca > cb) return false;
    }
    return true;
  }

  /** Multiconjunto de ids para verificar permutação. */
  function idsOrdenados(lista: readonly Pair[]): string[] {
    return lista.map((p) => p.id).sort();
  }

  it("a saída é não-decrescente por (nome em caixa baixa, criadoEm)", () => {
    fc.assert(
      fc.property(arbDuplas, (duplas) => {
        expect(naoDecrescente(listarDuplasOrdenadas(duplas))).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  it("a saída é permutação da entrada (mesmo multiconjunto de ids)", () => {
    fc.assert(
      fc.property(arbDuplas, (duplas) => {
        const saida = listarDuplasOrdenadas(duplas);
        expect(saida.length).toBe(duplas.length);
        expect(idsOrdenados(saida)).toEqual(idsOrdenados(duplas));
      }),
      { numRuns: 200 }
    );
  });

  it("é determinística: qualquer permutação da entrada produz a mesma saída", () => {
    fc.assert(
      fc.property(
        arbDuplas.chain((duplas) =>
          fc.tuple(fc.constant(duplas), fc.shuffledSubarray(duplas, { minLength: duplas.length }))
        ),
        ([original, permutada]) => {
          const a = listarDuplasOrdenadas(original);
          const b = listarDuplasOrdenadas(permutada);
          expect(a.map((p) => p.id)).toEqual(b.map((p) => p.id));
        }
      ),
      { numRuns: 200 }
    );
  });

  it("não muta a lista de entrada", () => {
    fc.assert(
      fc.property(arbDuplas, (duplas) => {
        const antes = duplas.map((p) => p.id);
        listarDuplasOrdenadas(duplas);
        expect(duplas.map((p) => p.id)).toEqual(antes);
      }),
      { numRuns: 200 }
    );
  });
});

// Feature: criar-chaveamento-campeonato, Property 5: Validação de formato
//
// Para toda string de formato, a validação ACEITA sse o valor é exatamente
// "fase de grupos" ou "dupla eliminação"; caso contrário rejeita com
// FORMATO_INVALIDO.
//
// Validates: Requirements 2.1, 2.2
describe("Feature: criar-chaveamento-campeonato, Property 5: Validação de formato", () => {
  const VALIDOS = ["fase de grupos", "dupla eliminação"] as const;

  /** Strings arbitrárias, misturadas com os dois valores válidos. */
  const arbFormato: fc.Arbitrary<string> = fc.oneof(
    fc.string(),
    fc.constantFrom(...VALIDOS),
    // Quase-válidos para exercitar a exatidão (caixa/espaços alteram o valor).
    fc.constantFrom("Fase de grupos", " fase de grupos", "dupla eliminacao", "DUPLA ELIMINAÇÃO", "")
  );

  it("aceita sse é exatamente um dos dois valores válidos (bicondicional)", () => {
    fc.assert(
      fc.property(arbFormato, (formato) => {
        const esperado = (VALIDOS as readonly string[]).includes(formato);
        const resultado = validarFormato(formato);
        expect(resultado.ok).toBe(esperado);
        if (resultado.ok) {
          expect(resultado.valor).toBe(formato);
        } else {
          expect(resultado.erro.code).toBe("FORMATO_INVALIDO");
        }
      }),
      { numRuns: 200 }
    );
  });
});

// Feature: criar-chaveamento-campeonato, Property 6: Validação de classificados por grupo
//
// Para todo N, número de grupos g válido e valor c, a validação ACEITA sse c é
// inteiro e 1 ≤ c < menorGrupo (menorGrupo = ⌊N/g⌋); caso contrário rejeita com
// CLASSIFICADOS_INVALIDO.
//
// Validates: Requirements 2.3, 2.4
describe("Feature: criar-chaveamento-campeonato, Property 6: Validação de classificados por grupo", () => {
  /** Gera (n, g) com g válido (1 ≤ g ≤ ⌊N/2⌋) e menorGrupo ≥ 1. */
  const arbNG: fc.Arbitrary<{ n: number; g: number }> = fc
    .integer({ min: 2, max: 128 })
    .chain((n) => fc.integer({ min: 1, max: Math.floor(n / 2) }).map((g) => ({ n, g })));

  /** Candidatos a c cobrindo dentro e fora do intervalo, inteiros e não inteiros. */
  function arbC(menorGrupo: number): fc.Arbitrary<number> {
    return fc.oneof(
      fc.integer({ min: 1, max: Math.max(1, menorGrupo - 1) }), // possivelmente válido
      fc.constant(0),
      fc.integer({ min: -5, max: 0 }),
      fc.integer({ min: menorGrupo, max: menorGrupo + 5 }), // >= menorGrupo (inválido)
      fc.double({ min: 1, max: menorGrupo + 2, noNaN: true }).filter((x) => !Number.isInteger(x))
    );
  }

  it("aceita sse c é inteiro e 1 ≤ c < ⌊N/g⌋ (bicondicional)", () => {
    fc.assert(
      fc.property(
        arbNG.chain(({ n, g }) => {
          const menorGrupo = Math.floor(n / g);
          return fc.tuple(fc.constant(n), fc.constant(g), arbC(menorGrupo));
        }),
        ([n, g, c]) => {
          const menorGrupo = Math.floor(n / g);
          const esperado = Number.isInteger(c) && c >= 1 && c < menorGrupo;
          const resultado = validarClassificadosPorGrupo(c, n, g);
          expect(resultado.ok).toBe(esperado);
          if (resultado.ok) {
            expect(resultado.valor).toBe(c);
          } else {
            expect(resultado.erro.code).toBe("CLASSIFICADOS_INVALIDO");
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("rejeita quando o número de grupos é inválido, independentemente de c", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 128 }),
        fc.integer({ min: 1, max: 10 }),
        (n, c) => {
          const gInvalido = Math.floor(n / 2) + 1; // acima do máximo permitido
          const resultado = validarClassificadosPorGrupo(c, n, gInvalido);
          expect(resultado.ok).toBe(false);
          if (!resultado.ok) {
            expect(resultado.erro.code).toBe("CLASSIFICADOS_INVALIDO");
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});

// Feature: criar-chaveamento-campeonato, Property 7: Validação de número de grupos
//
// Para todo N e valor g, a validação ACEITA sse g é inteiro e 1 ≤ g ≤ ⌊N/2⌋;
// caso contrário rejeita com GRUPOS_INVALIDO.
//
// Validates: Requirements 2.5, 2.6
describe("Feature: criar-chaveamento-campeonato, Property 7: Validação de número de grupos", () => {
  /** Candidatos a g cobrindo dentro e fora do intervalo, inteiros e não inteiros. */
  function arbG(n: number): fc.Arbitrary<number> {
    const maximo = Math.floor(n / 2);
    return fc.oneof(
      fc.integer({ min: 1, max: Math.max(1, maximo) }), // possivelmente válido
      fc.constant(0),
      fc.integer({ min: -5, max: 0 }),
      fc.integer({ min: maximo + 1, max: maximo + 10 }), // > ⌊N/2⌋ (inválido)
      fc.double({ min: 1, max: maximo + 2, noNaN: true }).filter((x) => !Number.isInteger(x))
    );
  }

  it("aceita sse g é inteiro e 1 ≤ g ≤ ⌊N/2⌋ (bicondicional)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 256 }).chain((n) => fc.tuple(fc.constant(n), arbG(n))),
        ([n, g]) => {
          const maximo = Math.floor(n / 2);
          const esperado = Number.isInteger(g) && g >= 1 && g <= maximo;
          const resultado = validarNumeroDeGrupos(g, n);
          expect(resultado.ok).toBe(esperado);
          if (resultado.ok) {
            expect(resultado.valor).toBe(g);
          } else {
            expect(resultado.erro.code).toBe("GRUPOS_INVALIDO");
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
