// tests/bracket-exemplos.unit.test.ts
//
// Feature: criar-chaveamento-campeonato — Tarefa 18.3
// Testes de EXEMPLO (não property-based) do fluxo de ORGANIZAÇÃO e de alguns
// pequenos brackets "âncora", exercitando a LÓGICA DE DOMÍNIO PURA que a UI
// de organização (`src/pages/campeonatos/[id]/organizar/[categoria].astro`)
// orquestra. Casos concretos e legíveis servem de REGRESSÃO para depuração.
//
// Validates (via a lógica de domínio que a UI usa):
//   - R2.7  Formato ausente antes de gerar → FORMATO_AUSENTE (exigirFormato).
//   - R4.8  Substituição exige confirmação explícita (invariante de domínio:
//           gerar sobre config diferente produz um bracket novo e coerente — a
//           confirmação em si é de UI e a sobrescrita na store é a tarefa 14.3).
//   - R4.9  Sem confirmação nada é gravado (modelado como invariante: as funções
//           puras não têm efeito colateral; regerar não muta o bracket anterior).
//   - R7.1  "Sobrescrever": gerar duas vezes produz brackets INDEPENDENTES.
//   - R4.6/R4.7  Brackets âncora de dupla eliminação (M=3 com um bye; M=4 sem
//           byes), jogáveis até a campeã.
//   - R5.2/R5.3/R5.4/R5.5  Fase de grupos âncora (N=6, G=2, 1 classificado por
//           grupo), round-robin por grupo, classificação e posicionamento no
//           mata-mata, jogável até a campeã.
//
// Funções puras exercitadas: exigirFormato (config), gerarChaveamento,
// registrarVencedor, indiceDeSeed/selecionarClassificados/classificarGrupo
// (standings), posicionarClassificadosNoMataMata (generator).

import { describe, it, expect } from "vitest";
import type {
  Bracket,
  Match,
  MatchId,
  Pair,
  PairId,
} from "../src/domain/bracket/types";
import { exigirFormato } from "../src/domain/bracket/config";
import {
  gerarChaveamento,
  posicionarClassificadosNoMataMata,
  type ClassificadoDoGrupo,
} from "../src/domain/bracket/generator";
import { registrarVencedor } from "../src/domain/bracket/progression";
import {
  indiceDeSeed,
  classificarGrupo,
  selecionarClassificados,
} from "../src/domain/bracket/standings";

/** Data/hora fixa injetada em todos os registros (mantém determinismo). */
const AGORA = "2026-01-01T00:00:00.000Z";

// ---------------------------------------------------------------------------
// Helpers de construção e manipulação (análogos aos dos property tests)
// ---------------------------------------------------------------------------

/** Constrói N duplas com seeds 1..N e ids/nomes determinísticos. */
function construirDuplas(n: number): Pair[] {
  return Array.from({ length: n }, (_, i) => {
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
 * Um jogo (fora de grupo) está PRONTO para registro quando ambos os slots estão
 * definidos (sem bye) e ainda não tem vencedor.
 */
function jogoProntoMataMata(j: Match): boolean {
  return (
    j.vencedorId === null &&
    j.side !== "grupo" &&
    slotDefinido(j.a) &&
    slotDefinido(j.b)
  );
}

/** Lista todos os jogos de mata-mata prontos (ordem estável = `matches`). */
function jogosProntosMataMata(bracket: Bracket): Match[] {
  return bracket.matches.filter(jogoProntoMataMata);
}

/**
 * "Joga" o mata-mata inteiro até não haver mais jogos prontos, sempre fazendo
 * vencer o slot A (escolha determinística). Retorna o bracket final.
 */
function jogarMataMataAteOFim(inicial: Bracket): Bracket {
  let atual = inicial;
  const teto = inicial.matches.length * 4 + 10; // guarda contra laço infinito
  let passos = 0;
  while (passos < teto) {
    const prontos = jogosProntosMataMata(atual);
    if (prontos.length === 0) break;
    const alvo = prontos[0];
    const vencedorId = alvo.a.pairId as PairId;
    const res = registrarVencedor(atual, alvo.id, vencedorId, AGORA);
    if (!res.ok) {
      throw new Error(
        `registrarVencedor falhou em ${alvo.id}: ${res.erro.code}`,
      );
    }
    atual = res.bracket;
    passos++;
  }
  return atual;
}

/** Número de jogos DECISIVOS (nenhum lado é bye) num bracket de mata-mata. */
function contarJogosDecisivos(bracket: Bracket): number {
  return bracket.matches.filter(
    (j) => j.side !== "grupo" && j.a.bye !== true && j.b.bye !== true,
  ).length;
}

/** Byes na 1ª rodada da chave de vencedores. */
function byesNaPrimeiraRodadaUpper(bracket: Bracket): number {
  return bracket.matches
    .filter((j) => j.side === "upper" && j.rodada === 1)
    .reduce((n, j) => n + (j.a.bye === true ? 1 : 0) + (j.b.bye === true ? 1 : 0), 0);
}

// ===========================================================================
// R2.7 — Formato ausente antes de gerar
// ===========================================================================
// A UI chama `exigirFormato(formatoSelecionado)` ANTES de gerar. Sem formato,
// a geração é bloqueada com FORMATO_AUSENTE e nenhum jogo é criado.

describe("R2.7 — formato ausente antes de gerar", () => {
  it("exigirFormato(undefined) → FORMATO_AUSENTE", () => {
    const res = exigirFormato(undefined);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.erro.code).toBe("FORMATO_AUSENTE");
  });

  it("exigirFormato(null) → FORMATO_AUSENTE", () => {
    const res = exigirFormato(null);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.erro.code).toBe("FORMATO_AUSENTE");
  });

  it('exigirFormato("") → FORMATO_AUSENTE', () => {
    const res = exigirFormato("");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.erro.code).toBe("FORMATO_AUSENTE");
  });

  it("formato válido passa pela checagem (contraste): 'dupla eliminação'", () => {
    const res = exigirFormato("dupla eliminação");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.valor).toBe("dupla eliminação");
  });
});

// ===========================================================================
// R4.8 / R4.9 / R7.1 — Substituição: confirmação e sobrescrita
// ===========================================================================
// A confirmação de substituição é interação de UI (vive na página). A
// SOBRESCRITA persistida é testada na store (tarefa 14.3). Aqui modelamos o
// INVARIANTE DE DOMÍNIO que torna esse fluxo seguro: gerar um bracket e depois
// gerar OUTRO (config diferente) produz um segundo bracket COERENTE e totalmente
// INDEPENDENTE do primeiro — as funções puras não têm efeito colateral, logo
// "não confirmar" significa simplesmente não substituir a referência anterior
// (nada é mutado). Esse é o alicerce de R4.9 ("sem confirmação, nada gravado")
// e de R7.1 (um novo bracket "sobrescreve" o anterior quando confirmado).

describe("R4.8/R4.9/R7.1 — gerar de novo produz bracket independente e coerente", () => {
  it("regerar com config diferente não altera o bracket anterior (sem efeito colateral)", () => {
    const duplas = construirDuplas(4);

    const primeira = gerarChaveamento({
      duplas,
      config: { formato: "dupla eliminação" },
    });
    expect(primeira.ok).toBe(true);
    if (!primeira.ok) return;

    // Snapshot do primeiro bracket antes de qualquer outra operação.
    const snapshotPrimeiro = structuredClone(primeira.bracket);

    // "Gerar de novo" com um FORMATO diferente (como numa substituição).
    const segunda = gerarChaveamento({
      duplas,
      config: { formato: "fase de grupos", numeroDeGrupos: 2 },
    });
    expect(segunda.ok).toBe(true);
    if (!segunda.ok) return;

    // O primeiro bracket permanece intacto (nada foi gravado/mutado nele):
    // isto é o que garante que "cancelar" a substituição preserva o anterior.
    expect(primeira.bracket).toEqual(snapshotPrimeiro);

    // Os dois brackets são independentes e coerentes com suas configs.
    expect(primeira.bracket.formato).toBe("dupla eliminação");
    expect(segunda.bracket.formato).toBe("fase de grupos");
    expect(primeira.bracket).not.toBe(segunda.bracket);
    expect(primeira.bracket.grupos.length).toBe(0);
    expect(segunda.bracket.grupos.length).toBe(2);
  });

  it("regerar com a MESMA entrada é determinístico (R4.2) — a 'substituição' é coerente", () => {
    const duplas = construirDuplas(5);
    const config = { formato: "dupla eliminação" as const };

    const a = gerarChaveamento({ duplas, config });
    const b = gerarChaveamento({ duplas, config });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    // Mesma entrada ⇒ mesma estrutura: substituir pelo "novo" bracket não muda
    // o resultado observável, logo a confirmação de substituição é segura.
    expect(a.bracket).toEqual(b.bracket);
  });
});

// ===========================================================================
// Âncora 1 — dupla eliminação com M=3 (um bye)
// ===========================================================================

describe("Âncora dupla eliminação M=3 (um bye) — R4.6/R4.7", () => {
  it("tem exatamente 1 bye na 1ª rodada da upper, 2M−2=4 jogos decisivos e é jogável até a campeã", () => {
    const duplas = construirDuplas(3);
    const res = gerarChaveamento({
      duplas,
      config: { formato: "dupla eliminação" },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const bracket = res.bracket;

    // M=3 → próxima potência de dois = 4 → S−M = 1 bye, na melhor cabeça.
    expect(byesNaPrimeiraRodadaUpper(bracket)).toBe(1);

    // Jogos decisivos = 2*3 − 2 = 4 (nenhum lado bye).
    expect(contarJogosDecisivos(bracket)).toBe(4);

    // Joga até o fim: uma campeã é definida e é a vencedora da grande final.
    const final = jogarMataMataAteOFim(bracket);
    const grandeFinal = final.matches.find((j) => j.side === "grande-final");
    expect(grandeFinal).toBeDefined();
    expect(grandeFinal!.vencedorId).not.toBeNull();
    expect(final.campeaId).not.toBeNull();
    expect(final.campeaId).toBe(grandeFinal!.vencedorId);
  });
});

// ===========================================================================
// Âncora 2 — dupla eliminação com M=4 (potência de dois, sem bye)
// ===========================================================================

describe("Âncora dupla eliminação M=4 (sem byes) — R4.6/R4.7", () => {
  it("tem 0 byes, 2M−2=6 jogos decisivos e é jogável até a campeã", () => {
    const duplas = construirDuplas(4);
    const res = gerarChaveamento({
      duplas,
      config: { formato: "dupla eliminação" },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const bracket = res.bracket;

    // M=4 é potência de dois: nenhum bye.
    expect(byesNaPrimeiraRodadaUpper(bracket)).toBe(0);

    // Jogos decisivos = 2*4 − 2 = 6.
    expect(contarJogosDecisivos(bracket)).toBe(6);

    const final = jogarMataMataAteOFim(bracket);
    const grandeFinal = final.matches.find((j) => j.side === "grande-final");
    expect(grandeFinal).toBeDefined();
    expect(grandeFinal!.vencedorId).not.toBeNull();
    expect(final.campeaId).toBe(grandeFinal!.vencedorId);
  });
});

// ===========================================================================
// Âncora 3 — fase de grupos N=6, G=2, 1 classificado por grupo (2 grupos de 3)
// ===========================================================================

describe("Âncora fase de grupos N=6, G=2, 1 classificado/grupo — R5.2/R5.3/R5.4/R5.5", () => {
  it("cada grupo tem 3 jogos (round-robin); seleciona 1 por grupo e gera mata-mata jogável", () => {
    const duplas = construirDuplas(6);
    const res = gerarChaveamento({
      duplas,
      config: { formato: "fase de grupos", numeroDeGrupos: 2 },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const bracket = res.bracket;

    // 2 grupos de 3 duplas; cada grupo com g(g−1)/2 = 3 jogos (R5.2).
    expect(bracket.grupos.length).toBe(2);
    for (const grupo of bracket.grupos) {
      expect(grupo.duplas.length).toBe(3);
      expect(grupo.jogos.length).toBe(3);
    }
    // Total de jogos de grupo = 6; todos os jogos do bracket são de grupo.
    const jogosDeGrupo = bracket.matches.filter((j) => j.side === "grupo");
    expect(jogosDeGrupo.length).toBe(6);
    expect(bracket.matches.length).toBe(6);

    // --- Preenche os vencedores dos jogos de grupo ------------------------
    // Em cada jogo, vence o slot A (a dupla de menor seed, por construção do
    // round-robin). Assim, dentro de cada grupo, a melhor cabeça vence os dois
    // jogos e fica em 1º; a classificação é determinística (R5.3).
    let atual = bracket;
    for (const j of jogosDeGrupo) {
      const vencedorId = j.a.pairId as PairId;
      const r = registrarVencedor(atual, j.id, vencedorId, AGORA);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      atual = r.bracket;
    }

    // --- Classifica e seleciona 1 por grupo (R5.4) ------------------------
    const seedIndex = indiceDeSeed(atual.duplas);
    const classificadosPorGrupo: ClassificadoDoGrupo[] = [];
    for (const grupo of atual.grupos) {
      const standings = classificarGrupo(grupo, atual.matches, seedIndex);
      expect(standings).not.toBeNull();

      const selecionados = selecionarClassificados(
        grupo,
        atual.matches,
        seedIndex,
        1,
      );
      expect(selecionados).not.toBeNull();
      expect(selecionados!.length).toBe(1); // exatamente 1 por grupo

      for (const s of selecionados!) {
        const pair = atual.duplas.find((d) => d.id === s.pairId)!;
        classificadosPorGrupo.push({
          pair,
          grupoId: grupo.id,
          posicaoNoGrupo: s.posicao,
        });
      }
    }

    // 2 grupos × 1 classificado = 2 classificados no mata-mata.
    expect(classificadosPorGrupo.length).toBe(2);

    // --- Posiciona no mata-mata e joga até a campeã (R5.5) ----------------
    const mataMata = posicionarClassificadosNoMataMata(
      classificadosPorGrupo,
      atual.config,
    );
    expect(mataMata.ok).toBe(true);
    if (!mataMata.ok) return;

    // Mata-mata com 2 duplas: dupla eliminação ⇒ 2M−2 = 2 jogos decisivos.
    expect(contarJogosDecisivos(mataMata.bracket)).toBe(2);

    const final = jogarMataMataAteOFim(mataMata.bracket);
    const grandeFinal = final.matches.find((j) => j.side === "grande-final");
    expect(grandeFinal).toBeDefined();
    expect(grandeFinal!.vencedorId).not.toBeNull();
    expect(final.campeaId).toBe(grandeFinal!.vencedorId);
  });
});
