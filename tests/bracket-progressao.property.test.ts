import { describe, it, expect } from "vitest";
import fc from "fast-check";
import type { Bracket, Match, MatchId, Pair, PairId } from "../src/domain/bracket/types";
import { gerarChaveamento } from "../src/domain/bracket/generator";
import { registrarVencedor } from "../src/domain/bracket/progression";

/**
 * Property-based tests da progressão do chaveamento (Bracket_Progression).
 * Properties 22 a 28, derivadas dos requisitos R6 do design.md.
 *
 * Todas operam sobre a lógica PURA: `gerarChaveamento` (gerador determinístico)
 * e `registrarVencedor` (avanço imutável). `agora` é um valor ISO fixo injetado,
 * garantindo determinismo.
 */

/** Data/hora fixa injetada em todos os registros, mantendo determinismo. */
const AGORA = "2026-01-01T00:00:00.000Z";

const NUM_RUNS = 200;

// ---------------------------------------------------------------------------
// Helpers de construção e manipulação de brackets
// ---------------------------------------------------------------------------

/**
 * Gera um bracket "dupla eliminação" com M duplas (seeds 1..M), com ids/nomes
 * determinísticos. A ordem de entrada é irrelevante (o gerador reordena por
 * seed), mas mantemos seeds 1..M consecutivos.
 */
function gerarBracketDuplaEliminacao(m: number): Bracket {
  const duplas: Pair[] = Array.from({ length: m }, (_, i) => {
    const seed = i + 1;
    return {
      id: `d${seed}`,
      nomeDupla: `Dupla ${seed}`,
      atletaA: `A${seed}`,
      atletaB: `B${seed}`,
      seed,
      criadoEm: `2025-01-01T00:00:${String(seed).padStart(2, "0")}.000Z`,
    };
  });

  const res = gerarChaveamento({
    duplas,
    config: { formato: "dupla eliminação" },
  });
  if (!res.ok) {
    throw new Error(`gerarChaveamento falhou para M=${m}: ${res.erro.code}`);
  }
  return res.bracket;
}

/** Procura um jogo pelo id (lança se não existir — erro de teste). */
function jogo(bracket: Bracket, matchId: MatchId): Match {
  const j = bracket.matches.find((x) => x.id === matchId);
  if (!j) throw new Error(`jogo não encontrado: ${matchId}`);
  return j;
}

/** Um slot está DEFINIDO quando aponta para uma dupla concreta (sem bye). */
function slotDefinido(p: { pairId: PairId | null; bye?: boolean }): boolean {
  return p.pairId !== null && p.pairId !== undefined;
}

/**
 * Um jogo está PRONTO para registro quando ambos os slots estão definidos
 * (sem bye) e ainda não tem vencedor.
 */
function jogoPronto(j: Match): boolean {
  return (
    j.vencedorId === null &&
    slotDefinido(j.a) &&
    slotDefinido(j.b) &&
    j.side !== "grupo"
  );
}

/** Lista todos os jogos prontos (ordem estável = ordem de `matches`). */
function jogosProntos(bracket: Bracket): Match[] {
  return bracket.matches.filter(jogoPronto);
}

/**
 * "Joga" o bracket inteiro, aplicando resultados deterministicamente até não
 * haver mais jogos prontos. A cada jogo pronto, o vencedor é escolhido por um
 * gerador de booleans (`escolhas`): true => vence o slot A, false => vence o
 * slot B. O ponteiro percorre `escolhas` de forma cíclica para nunca faltar.
 *
 * Retorna o bracket final (encadeando o novo bracket a cada registro) e a lista
 * de passos aplicados (jogo + vencedor), útil para inspeção nas properties.
 */
function jogarBracket(
  inicial: Bracket,
  escolhas: boolean[],
): { final: Bracket; passos: Array<{ matchId: MatchId; vencedorId: PairId }> } {
  let atual = inicial;
  const passos: Array<{ matchId: MatchId; vencedorId: PairId }> = [];
  let i = 0;
  // Limite de segurança: cada jogo decisivo é registrado uma vez; 2M-2 jogos no
  // máximo. Usamos um teto generoso para evitar laço infinito em caso de bug.
  const teto = inicial.matches.length * 4 + 10;
  let passosDados = 0;

  while (passosDados < teto) {
    const prontos = jogosProntos(atual);
    if (prontos.length === 0) break;
    const alvo = prontos[0];
    const venceA = escolhas.length > 0 ? escolhas[i % escolhas.length] : true;
    i++;
    const vencedorId = (venceA ? alvo.a.pairId : alvo.b.pairId) as PairId;
    const res = registrarVencedor(atual, alvo.id, vencedorId, AGORA);
    if (!res.ok) {
      throw new Error(
        `registrarVencedor falhou inesperadamente em ${alvo.id}: ${res.erro.code}`,
      );
    }
    atual = res.bracket;
    passos.push({ matchId: alvo.id, vencedorId });
    passosDados++;
  }

  return { final: atual, passos };
}

/** Todos os pairIds que aparecem em algum slot (definido) de algum jogo. */
function pairIdsNosSlots(bracket: Bracket): Set<PairId> {
  const s = new Set<PairId>();
  for (const j of bracket.matches) {
    if (slotDefinido(j.a)) s.add(j.a.pairId as PairId);
    if (slotDefinido(j.b)) s.add(j.b.pairId as PairId);
  }
  return s;
}

/** Gerador de M (número de duplas) no intervalo [2, 32]. */
const arbM = fc.integer({ min: 2, max: 32 });

/** Gerador de uma sequência de escolhas booleanas para "jogar" o bracket. */
const arbEscolhas = fc.array(fc.boolean(), { minLength: 1, maxLength: 64 });

// ---------------------------------------------------------------------------
// Property 22: Registrar vencedor marca resultado, data e avança
// ---------------------------------------------------------------------------
// Feature: criar-chaveamento-campeonato, Property 22: Registrar vencedor marca resultado, data e avança

describe("Feature: criar-chaveamento-campeonato, Property 22: Registrar vencedor marca resultado, data e avança", () => {
  it("marca vencedorId/registradoEm e posiciona o vencedor no slot de avanço", () => {
    fc.assert(
      fc.property(arbM, fc.boolean(), (m, venceA) => {
        const bracket = gerarBracketDuplaEliminacao(m);
        // Escolhe o primeiro jogo pronto (ambas definidas, sem bye, sem vencedor).
        const pronto = jogosProntos(bracket)[0];
        expect(pronto).toBeDefined();

        const vencedorId = (venceA ? pronto.a.pairId : pronto.b.pairId) as PairId;
        const res = registrarVencedor(bracket, pronto.id, vencedorId, AGORA);
        expect(res.ok).toBe(true);
        if (!res.ok) return;

        const novo = res.bracket;
        const jogado = jogo(novo, pronto.id);
        // Marca resultado e data.
        expect(jogado.vencedorId).toBe(vencedorId);
        expect(jogado.registradoEm).toBe(AGORA);

        // Coloca o vencedor no slot de avanço do próximo jogo, se houver.
        if (pronto.avancaVencedorPara) {
          const destino = jogo(novo, pronto.avancaVencedorPara.matchId);
          const slot =
            pronto.avancaVencedorPara.slot === "a" ? destino.a : destino.b;
          expect(slot.pairId).toBe(vencedorId);
          expect(slot.bye).not.toBe(true);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 23: Vencedor fora do jogo é rejeitado sem alterar estado
// ---------------------------------------------------------------------------
// Feature: criar-chaveamento-campeonato, Property 23: Vencedor fora do jogo é rejeitado sem alterar estado

describe("Feature: criar-chaveamento-campeonato, Property 23: Vencedor fora do jogo é rejeitado sem alterar estado", () => {
  it("retorna VENCEDOR_INVALIDO e o bracket permanece inalterado (imutável)", () => {
    fc.assert(
      fc.property(arbM, (m) => {
        const bracket = gerarBracketDuplaEliminacao(m);
        const pronto = jogosProntos(bracket)[0];
        expect(pronto).toBeDefined();

        const a = pronto.a.pairId as PairId;
        const b = pronto.b.pairId as PairId;
        // Um pairId que NÃO está no jogo (nenhuma dupla usa id "FORA").
        const c: PairId = "dupla-inexistente";
        expect(c).not.toBe(a);
        expect(c).not.toBe(b);

        const original = structuredClone(bracket);
        const res = registrarVencedor(bracket, pronto.id, c, AGORA);
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.erro.code).toBe("VENCEDOR_INVALIDO");

        // Função imutável: a entrada permanece exatamente igual ao original.
        expect(bracket).toEqual(original);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 24: Jogo com dupla indefinida não aceita registro
// ---------------------------------------------------------------------------
// Feature: criar-chaveamento-campeonato, Property 24: Jogo com dupla indefinida não aceita registro

describe("Feature: criar-chaveamento-campeonato, Property 24: Jogo com dupla indefinida não aceita registro", () => {
  it("retorna JOGO_NAO_PRONTO e não altera o estado quando ao menos um slot é indefinido/bye", () => {
    fc.assert(
      fc.property(arbM, (m) => {
        const bracket = gerarBracketDuplaEliminacao(m);
        // Snapshot ÚNICO por run: `registrarVencedor` é imutável (não muta a
        // entrada), então basta clonar/comparar uma vez — clonar a cada jogo
        // dentro do loop é O(runs × jogos × tamanho) e estourava o timeout.
        const original = structuredClone(bracket);

        // Jogos com ao menos um slot indefinido (pairId null; inclui bye).
        const naoProntos = bracket.matches.filter(
          (j) =>
            j.side !== "grupo" &&
            j.vencedorId === null &&
            (!slotDefinido(j.a) || !slotDefinido(j.b)),
        );
        // Pode haver M=2 (potência de dois perfeita, sem indefinidos na R1),
        // mas sempre há rodadas futuras indefinidas (upper R2+, lower, final).
        fc.pre(naoProntos.length > 0);

        for (const alvo of naoProntos) {
          // Tenta registrar uma dupla qualquer (mesmo que uma esteja definida).
          const candidato =
            (alvo.a.pairId as PairId | null) ??
            (alvo.b.pairId as PairId | null) ??
            "qualquer";
          const res = registrarVencedor(
            bracket,
            alvo.id,
            candidato as PairId,
            AGORA,
          );
          expect(res.ok).toBe(false);
          if (res.ok) return;
          expect(res.erro.code).toBe("JOGO_NAO_PRONTO");
        }

        // A entrada permanece intacta após todas as tentativas rejeitadas.
        expect(bracket).toEqual(original);
      }),
      { numRuns: NUM_RUNS },
    );
  }, 20000);
});

// ---------------------------------------------------------------------------
// Property 25: Resultado na upper avança vencedor e encaminha perdedor à lower
// ---------------------------------------------------------------------------
// Feature: criar-chaveamento-campeonato, Property 25: Resultado na chave de vencedores avança vencedor e encaminha perdedor à chave de perdedores

describe("Feature: criar-chaveamento-campeonato, Property 25: Resultado na chave de vencedores avança vencedor e encaminha perdedor à chave de perdedores", () => {
  it("vencedor ocupa o próximo jogo da upper e perdedor ocupa o jogo correspondente da lower", () => {
    fc.assert(
      fc.property(arbM, fc.boolean(), (m, venceA) => {
        const bracket = gerarBracketDuplaEliminacao(m);
        // Jogo pronto da upper cujo perdedor é ENCAMINHADO para um jogo da
        // chave de perdedores (side "lower"). Para M=2 o perdedor da upper vai
        // direto à grande final (não há lower), caso coberto pela Property 28;
        // aqui exigimos um destino na lower (M >= 3).
        const destinoEhLower = (j: Match): boolean => {
          if (!j.encaminhaPerdedorPara) return false;
          const d = bracket.matches.find(
            (x) => x.id === j.encaminhaPerdedorPara!.matchId,
          );
          return d?.side === "lower";
        };
        const alvo = jogosProntos(bracket).find(
          (j) => j.side === "upper" && destinoEhLower(j),
        );
        // Com M >= 3 sempre há jogo upper decisivo com encaminhamento à lower.
        fc.pre(alvo !== undefined);
        const upper = alvo as Match;

        const a = upper.a.pairId as PairId;
        const b = upper.b.pairId as PairId;
        const vencedorId = venceA ? a : b;
        const perdedorId = venceA ? b : a;

        const res = registrarVencedor(bracket, upper.id, vencedorId, AGORA);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        const novo = res.bracket;

        // Vencedor avança na upper (se houver avanço; sempre há para jogo
        // com encaminhamento à lower, pois não é a grande final).
        if (upper.avancaVencedorPara) {
          const destino = jogo(novo, upper.avancaVencedorPara.matchId);
          const slot =
            upper.avancaVencedorPara.slot === "a" ? destino.a : destino.b;
          expect(slot.pairId).toBe(vencedorId);
        }

        // Perdedor é encaminhado ao jogo correspondente da lower.
        const destinoLower = jogo(novo, upper.encaminhaPerdedorPara!.matchId);
        expect(destinoLower.side).toBe("lower");
        const slotLower =
          upper.encaminhaPerdedorPara!.slot === "a"
            ? destinoLower.a
            : destinoLower.b;
        expect(slotLower.pairId).toBe(perdedorId);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 26: Resultado na lower avança vencedor e elimina perdedor
// ---------------------------------------------------------------------------
// Feature: criar-chaveamento-campeonato, Property 26: Resultado na chave de perdedores avança vencedor e elimina perdedor

describe("Feature: criar-chaveamento-campeonato, Property 26: Resultado na chave de perdedores avança vencedor e elimina perdedor", () => {
  it("vencedor avança na lower e o perdedor não aparece em nenhum jogo futuro", () => {
    fc.assert(
      fc.property(arbM, arbEscolhas, (m, escolhas) => {
        const bracket = gerarBracketDuplaEliminacao(m);
        // Joga até surgir um jogo pronto na lower (precisa de perdedores da
        // upper encaminhados). Avança passo a passo e registra o PRIMEIRO
        // jogo pronto da lower que aparecer.
        let atual = bracket;
        let registrouLower = false;
        const teto = bracket.matches.length * 4 + 10;
        let it = 0;
        let idx = 0;

        while (it < teto) {
          const prontos = jogosProntos(atual);
          if (prontos.length === 0) break;

          const lowerPronto = prontos.find((j) => j.side === "lower");
          const alvo = lowerPronto ?? prontos[0];

          const a = alvo.a.pairId as PairId;
          const b = alvo.b.pairId as PairId;
          const venceA =
            escolhas.length > 0 ? escolhas[idx % escolhas.length] : true;
          idx++;
          const vencedorId = venceA ? a : b;
          const perdedorId = venceA ? b : a;

          const res = registrarVencedor(atual, alvo.id, vencedorId, AGORA);
          expect(res.ok).toBe(true);
          if (!res.ok) return;
          const novo = res.bracket;

          if (alvo.side === "lower") {
            // Vencedor avança na lower (se houver ligação de avanço).
            if (alvo.avancaVencedorPara) {
              const destino = jogo(novo, alvo.avancaVencedorPara.matchId);
              const slot =
                alvo.avancaVencedorPara.slot === "a" ? destino.a : destino.b;
              expect(slot.pairId).toBe(vencedorId);
            }
            // Perdedor da lower é ELIMINADO: não aparece em nenhum jogo FUTURO
            // (sem vencedor) do bracket.
            for (const j of novo.matches) {
              if (j.vencedorId !== null) continue;
              expect(j.a.pairId).not.toBe(perdedorId);
              expect(j.b.pairId).not.toBe(perdedorId);
            }
            registrouLower = true;
            break;
          }

          atual = novo;
          it++;
        }

        // Para M pequeno (ex.: 2) pode não existir jogo decisivo na lower.
        // A property só afirma algo quando houve um registro na lower.
        fc.pre(registrouLower || m <= 2);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 27: Correção invalida em cascata os jogos posteriores dependentes
// ---------------------------------------------------------------------------
// Feature: criar-chaveamento-campeonato, Property 27: Correção de vencedor invalida em cascata os jogos posteriores dependentes

describe("Feature: criar-chaveamento-campeonato, Property 27: Correção de vencedor invalida em cascata os jogos posteriores dependentes", () => {
  it("corrigir um vencedor remove a dupla antes avançada dos jogos posteriores dependentes e mantém consistência", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 32 }),
        arbEscolhas,
        (m, escolhas) => {
          const inicial = gerarBracketDuplaEliminacao(m);
          const { final, passos } = jogarBracket(inicial, escolhas);

          // Procura um jogo JÁ registrado cujo avanço do vencedor alimentou
          // um jogo posterior (há dependência observável). Preferimos um jogo
          // da upper de rodada 1 com avanço + encaminhamento.
          const candidato = passos
            .map((p) => jogo(final, p.matchId))
            .find(
              (j) =>
                j.vencedorId !== null &&
                j.avancaVencedorPara !== undefined &&
                slotDefinido(j.a) &&
                slotDefinido(j.b) &&
                j.a.pairId !== j.b.pairId,
            );
          fc.pre(candidato !== undefined);
          const alvo = candidato as Match;

          const a = alvo.a.pairId as PairId;
          const b = alvo.b.pairId as PairId;
          const vencedorAntigo = alvo.vencedorId as PairId;
          const novoVencedor = vencedorAntigo === a ? b : a;

          const res = registrarVencedor(
            final,
            alvo.id,
            novoVencedor,
            AGORA,
          );
          expect(res.ok).toBe(true);
          if (!res.ok) return;
          const corrigido = res.bracket;

          // O slot de avanço do vencedor agora carrega o novo vencedor.
          if (alvo.avancaVencedorPara) {
            const destino = jogo(corrigido, alvo.avancaVencedorPara.matchId);
            const slot =
              alvo.avancaVencedorPara.slot === "a" ? destino.a : destino.b;
            expect(slot.pairId).toBe(novoVencedor);
          }

          // O jogo corrigido aponta o novo vencedor.
          expect(jogo(corrigido, alvo.id).vencedorId).toBe(novoVencedor);

          // Consistência estrutural: todo jogo com vencedor registrado tem esse
          // vencedor como um de seus participantes. Jogos de WALKOVER (um lado é
          // bye) têm vencedor com apenas um slot definido — por isso só exigimos
          // ambos os slots definidos quando NENHUM lado é bye.
          for (const j of corrigido.matches) {
            if (j.vencedorId === null) continue;
            const aBye = j.a.bye === true;
            const bBye = j.b.bye === true;
            if (!aBye && !bBye) {
              expect(slotDefinido(j.a)).toBe(true);
              expect(slotDefinido(j.b)).toBe(true);
            }
            // O vencedor é sempre uma das duplas presentes (lado não-bye).
            const participantes = [
              aBye ? null : j.a.pairId,
              bBye ? null : j.b.pairId,
            ];
            expect(participantes).toContain(j.vencedorId);
          }

          // Mesmo nº de jogos e ids preservados (estrutura intacta).
          expect(corrigido.matches.map((j) => j.id)).toEqual(
            final.matches.map((j) => j.id),
          );
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 28: A campeã é a vencedora da grande final
// ---------------------------------------------------------------------------
// Feature: criar-chaveamento-campeonato, Property 28: A campeã é a vencedora da grande final

describe("Feature: criar-chaveamento-campeonato, Property 28: A campeã é a vencedora da grande final", () => {
  it("após jogar o bracket completo, campeaId é exatamente o vencedor da grande final", () => {
    fc.assert(
      fc.property(arbM, arbEscolhas, (m, escolhas) => {
        const inicial = gerarBracketDuplaEliminacao(m);
        const { final } = jogarBracket(inicial, escolhas);

        const grandeFinal = final.matches.find(
          (j) => j.side === "grande-final",
        );
        expect(grandeFinal).toBeDefined();
        const gf = grandeFinal as Match;

        // O bracket completo deve ter a grande final decidida.
        expect(gf.vencedorId).not.toBeNull();
        // A campeã é exatamente a vencedora da grande final (R6.7),
        // independentemente da chave de origem.
        expect(final.campeaId).toBe(gf.vencedorId);
        // E a campeã é uma das duas duplas da grande final.
        expect([gf.a.pairId, gf.b.pairId]).toContain(final.campeaId);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
