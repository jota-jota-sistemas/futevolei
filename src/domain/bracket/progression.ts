// src/domain/bracket/progression.ts
//
// Bracket_Progression: registro do vencedor de um jogo e avanço do chaveamento.
// Função PURA e DETERMINÍSTICA — sem I/O, sem relógio, sem Math.random.
//
// Conforme o contrato "Bracket_Progression" (seção Components do design.md) e os
// requisitos R6 do requirements.md:
//
//   - R6.1  marca a dupla vencedora, registra data/hora (`agora` ISO injetado,
//           NUNCA Date.now() interno) e avança a vencedora ao jogo seguinte.
//   - R6.2  dupla que não participa do jogo → VENCEDOR_INVALIDO (estado
//           preservado).
//   - R6.3  jogo com ao menos uma das duas duplas indefinida → JOGO_NAO_PRONTO
//           (estado preservado).
//   - R6.4  upper: avança o vencedor na upper e ENCAMINHA o perdedor à lower.
//   - R6.5  lower: avança o vencedor na lower e ELIMINA o perdedor (o perdedor
//           não aparece em jogos futuros).
//   - R6.7  grande final concluída define `campeaId`.
//
// A CORREÇÃO de um vencedor já registrado COM invalidação em cascata (R6.6) é
// tratada aqui: quando o jogo JÁ possui `vencedorId` e o Organizador seleciona
// a OUTRA dupla participante, desfazemos em CASCATA todos os avanços derivados
// do resultado anterior (seguindo `avancaVencedorPara` e `encaminhaPerdedorPara`
// transitivamente) e, em seguida, reaplicamos o avanço do NOVO vencedor. O
// re-registro do MESMO vencedor é idempotente (apenas atualiza `registradoEm` e
// reaplica os avanços determinísticos).
//
// Toda a operação é feita sobre uma CÓPIA PROFUNDA do bracket — a entrada nunca
// é mutada (imutabilidade do contrato).
//
// Decisão de projeto sobre BYES na cascata (R6.6): ao invalidar um jogo
// posterior, limpamos cada slot que havia sido PREENCHIDO por avanço/
// encaminhamento tornando-o INDEFINIDO (`pairId = null`, `bye = false`). Não
// tentamos "reconstruir" um bye estrutural original: byes só existem na 1ª
// rodada da chave de vencedores (gerados pelo Bracket_Generator) e nunca são
// destino de avanço/encaminhamento, portanto a limpeza nunca sobrescreve um
// slot que o gerador marcou como bye. Simplificação segura e documentada.

import type {
  Bracket,
  Match,
  MatchId,
  Participant,
  PairId,
  DomainError,
} from "./types";

export type ProgressionResult =
  | { ok: true; bracket: Bracket }
  | { ok: false; erro: DomainError };

/**
 * Registra o vencedor de um jogo e devolve um NOVO bracket (imutável).
 *
 * - Falha com VENCEDOR_INVALIDO se `vencedorId` não é uma das duas duplas
 *   participantes do jogo (R6.2); a entrada não é alterada.
 * - Falha com JOGO_NAO_PRONTO se alguma das duas duplas do jogo ainda não está
 *   definida (participante com `pairId` null/indefinido — inclui byes) (R6.3).
 * - Marca `vencedorId` e `registradoEm = agora` no jogo (R6.1).
 * - Upper: avança o vencedor ao próximo jogo da upper e encaminha o perdedor ao
 *   jogo correspondente da lower (R6.4).
 * - Lower: avança o vencedor ao próximo jogo da lower; o perdedor é eliminado
 *   (não é encaminhado a nenhum jogo) (R6.5).
 * - Grupo: apenas marca o vencedor (a transição grupos→mata-mata usa
 *   Group_Standings + posicionarClassificadosNoMataMata, fora desta função).
 * - Grande final concluída define `bracket.campeaId` (R6.7).
 *
 * `agora` (ISO) é injetado pela borda para manter a função pura (R6.1); esta
 * função NUNCA lê `Date.now()` internamente.
 */
export function registrarVencedor(
  bracket: Bracket,
  matchId: MatchId,
  vencedorId: PairId,
  agora: string,
): ProgressionResult {
  // Trabalha sobre uma cópia profunda: a entrada permanece intacta.
  const proximo = clonarBracket(bracket);

  const jogo = proximo.matches.find((m) => m.id === matchId);
  if (!jogo) {
    // Jogo inexistente: tratamos como vencedor inválido (não há participação
    // possível num jogo que não existe). Estado preservado (cópia intacta).
    return { ok: false, erro: { code: "VENCEDOR_INVALIDO" } };
  }

  // R6.3 — jogo pronto: ambas as duplas precisam estar DEFINIDAS. Um slot é
  // indefinido quando `pairId` é null (inclui byes, que têm pairId null).
  if (!slotDefinido(jogo.a) || !slotDefinido(jogo.b)) {
    return { ok: false, erro: { code: "JOGO_NAO_PRONTO" } };
  }

  const pairA = jogo.a.pairId as PairId;
  const pairB = jogo.b.pairId as PairId;

  // R6.2 — o vencedor precisa ser uma das duas duplas do jogo.
  if (vencedorId !== pairA && vencedorId !== pairB) {
    return { ok: false, erro: { code: "VENCEDOR_INVALIDO" } };
  }

  const perdedorId = vencedorId === pairA ? pairB : pairA;

  // --- Correção com invalidação em cascata (R6.6) ---------------------------
  // Se o jogo já tinha um vencedor registrado DIFERENTE, a correção para a
  // OUTRA dupla exige desfazer, EM CASCATA, todos os avanços/encaminhamentos
  // derivados do resultado anterior antes de reaplicar o novo. Desfazer é
  // transitivo: um jogo posterior que havia sido preenchido pelo resultado
  // antigo é limpo e, se ele próprio já tinha vencedor, sua propagação também
  // é desfeita recursivamente.
  if (jogo.vencedorId !== null && jogo.vencedorId !== vencedorId) {
    const vencedorAntigo = jogo.vencedorId;
    const perdedorAntigo = vencedorAntigo === pairA ? pairB : pairA;

    // Desfaz o avanço do vencedor antigo para o próximo jogo.
    if (jogo.avancaVencedorPara) {
      invalidarCascata(proximo, jogo.avancaVencedorPara, vencedorAntigo);
    }
    // Desfaz o encaminhamento do perdedor antigo (apenas upper → lower).
    if (jogo.side === "upper" && jogo.encaminhaPerdedorPara) {
      invalidarCascata(proximo, jogo.encaminhaPerdedorPara, perdedorAntigo);
    }
    // Se a decisão do título está sendo corrigida, a campeã some até o novo
    // resultado ser aplicado logo abaixo. Isso vale para a grande final (dupla
    // eliminação) e para a final da chave única (eliminação simples: side
    // "upper" sem avanço).
    const corrigindoTitulo =
      jogo.side === "grande-final" || ehFinalDeChaveUnica(jogo);
    if (corrigindoTitulo) {
      proximo.campeaId = null;
    }
  }

  // Se o vencedor mudou, o placar anterior deixa de valer (registrarPlacar grava
  // o novo logo em seguida; registrarVencedor puro deixa o placar em branco).
  if (jogo.vencedorId !== vencedorId) {
    jogo.placarA = null;
    jogo.placarB = null;
  }

  // R6.1 — marca o vencedor e a data/hora injetada.
  jogo.vencedorId = vencedorId;
  jogo.registradoEm = agora;

  // Grupo: apenas marca o vencedor; não há avanço estrutural aqui.
  if (jogo.side === "grupo") {
    return { ok: true, bracket: proximo };
  }

  // Avança o vencedor ao jogo seguinte (upper, lower ou grande final → sem
  // ligação de avanço na própria grande final).
  if (jogo.avancaVencedorPara) {
    colocarEmSlot(proximo, jogo.avancaVencedorPara, vencedorId);
  }

  // R6.4 — upper: encaminha o perdedor ao jogo correspondente da lower.
  // R6.5 — lower: perdedor é ELIMINADO (não é encaminhado a lugar nenhum).
  if (jogo.side === "upper" && jogo.encaminhaPerdedorPara) {
    colocarEmSlot(proximo, jogo.encaminhaPerdedorPara, perdedorId);
  }

  // R6.7 — define a campeã:
  //  - dupla eliminação: ao concluir a GRANDE FINAL (independe da chave de origem);
  //  - eliminação simples (inclusive o mata-mata pós fase de grupos): ao concluir
  //    a FINAL da chave única — o jogo de side "upper" que não avança para lugar
  //    nenhum (sem `avancaVencedorPara`). Nesse formato o perdedor é eliminado
  //    (não há `encaminhaPerdedorPara`), coerente com a estrutura gerada.
  if (jogo.side === "grande-final" || ehFinalDeChaveUnica(jogo)) {
    proximo.campeaId = vencedorId;
  }

  return { ok: true, bracket: proximo };
}

/**
 * Registra o PLACAR de um jogo e devolve um NOVO bracket (imutável).
 *
 * O vencedor é DERIVADO do placar — quem tem o maior número vence; não há
 * empate. A partir daí o avanço, o encaminhamento, a campeã e a correção com
 * cascata seguem exatamente a lógica de `registrarVencedor`.
 *
 * - `PLACAR_INVALIDO`: algum dos placares não é inteiro ou é negativo.
 * - `PLACAR_EMPATE`: os dois placares são iguais.
 * - `JOGO_NAO_PRONTO`: alguma das duas duplas do jogo ainda não está definida.
 *
 * Editar o placar de um jogo já registrado também é suportado: se o vencedor
 * muda, os jogos posteriores que dependiam dele são invalidados em cascata; se
 * o vencedor continua o mesmo, apenas o placar é atualizado.
 */
export function registrarPlacar(
  bracket: Bracket,
  matchId: MatchId,
  placarA: number,
  placarB: number,
  agora: string,
): ProgressionResult {
  const alvo = bracket.matches.find((m) => m.id === matchId);
  if (!alvo) {
    return { ok: false, erro: { code: "VENCEDOR_INVALIDO" } };
  }
  if (!slotDefinido(alvo.a) || !slotDefinido(alvo.b)) {
    return { ok: false, erro: { code: "JOGO_NAO_PRONTO" } };
  }

  const valido = (n: number): boolean => Number.isInteger(n) && n >= 0;
  if (!valido(placarA) || !valido(placarB)) {
    return { ok: false, erro: { code: "PLACAR_INVALIDO" } };
  }
  if (placarA === placarB) {
    return { ok: false, erro: { code: "PLACAR_EMPATE" } };
  }

  const vencedorId = (placarA > placarB ? alvo.a.pairId : alvo.b.pairId) as PairId;
  const res = registrarVencedor(bracket, matchId, vencedorId, agora);
  if (!res.ok) return res;

  // `res.bracket` é uma cópia nova: gravar o placar nela não afeta a entrada.
  const jogo = res.bracket.matches.find((m) => m.id === matchId) as Match;
  jogo.placarA = placarA;
  jogo.placarB = placarB;
  return res;
}

/**
 * Atualiza o placar de um jogo EM ANDAMENTO (ao vivo) e devolve um NOVO bracket.
 *
 * Diferente de `registrarPlacar`, NÃO decide o jogo: grava só `placarA/placarB`
 * e mantém `vencedorId = null`, então nada avança no chaveamento nem entra na
 * classificação. Empate é permitido (o jogo ainda está rolando). O jogo é
 * encerrado depois, com `registrarPlacar` usando o placar final.
 *
 * - `JOGO_NAO_PRONTO`: alguma das duas duplas ainda não está definida.
 * - `JOGO_ENCERRADO`: o jogo já tem vencedor (use `registrarPlacar` para corrigir).
 * - `PLACAR_INVALIDO`: algum dos placares não é inteiro ou é negativo.
 */
export function atualizarPlacarAoVivo(
  bracket: Bracket,
  matchId: MatchId,
  placarA: number,
  placarB: number,
): ProgressionResult {
  const proximo = clonarBracket(bracket);
  const jogo = proximo.matches.find((m) => m.id === matchId);
  if (!jogo) {
    return { ok: false, erro: { code: "VENCEDOR_INVALIDO" } };
  }
  if (!slotDefinido(jogo.a) || !slotDefinido(jogo.b)) {
    return { ok: false, erro: { code: "JOGO_NAO_PRONTO" } };
  }
  if (jogo.vencedorId !== null) {
    return { ok: false, erro: { code: "JOGO_ENCERRADO" } };
  }
  const valido = (n: number): boolean => Number.isInteger(n) && n >= 0;
  if (!valido(placarA) || !valido(placarB)) {
    return { ok: false, erro: { code: "PLACAR_INVALIDO" } };
  }
  jogo.placarA = placarA;
  jogo.placarB = placarB;
  return { ok: true, bracket: proximo };
}

// ---------------------------------------------------------------------------
// Auxiliares puros

/**
 * Final de uma chave ÚNICA (eliminação simples, inclusive o mata-mata gerado
 * depois da fase de grupos): jogo da upper que não avança nem encaminha o
 * perdedor para lugar nenhum. Na dupla eliminação a final da upper avança para
 * a grande final, então nunca satisfaz isto. Independe de `bracket.formato`
 * (o mata-mata pós-grupos mantém o formato "fase de grupos").
 */
function ehFinalDeChaveUnica(jogo: Match): boolean {
  return (
    jogo.side === "upper" &&
    !jogo.avancaVencedorPara &&
    !jogo.encaminhaPerdedorPara
  );
}
// ---------------------------------------------------------------------------

/**
 * Um slot está DEFINIDO quando aponta para uma dupla concreta (`pairId` não
 * null). Byes têm `pairId` null, logo NÃO são slots definidos — um jogo com um
 * bye em algum lado não está pronto para registro manual.
 */
function slotDefinido(p: Participant): boolean {
  return p.pairId !== null && p.pairId !== undefined;
}

/**
 * Posiciona `pairId` no slot (a|b) do jogo de destino, limpando qualquer marca
 * de bye desse slot. Usado para avançar vencedores e encaminhar perdedores.
 */
function colocarEmSlot(
  bracket: Bracket,
  ligacao: { matchId: MatchId; slot: "a" | "b" },
  pairId: PairId,
): void {
  const destino = bracket.matches.find((m) => m.id === ligacao.matchId);
  if (!destino) return;
  const slot = ligacao.slot === "a" ? destino.a : destino.b;
  slot.pairId = pairId;
  slot.bye = false;

  // Walkover automático: se, após posicionar a dupla real, o jogo de destino
  // tem um lado REAL e o outro lado é um BYE, não há confronto — a dupla real
  // vence por walkover e AVANÇA imediatamente. Byes podem ser introduzidos na
  // chave de perdedores pela propagação do gerador; quando a dupla real chega
  // via encaminhamento/avanço, resolvemos o walkover aqui, em cascata, para que
  // a progressão não fique travada aguardando o "registro" de um bye.
  const outro = ligacao.slot === "a" ? destino.b : destino.a;
  const outroEhBye = outro.bye === true;
  const outroIndefinido = outro.pairId === null || outro.pairId === undefined;
  if (destino.vencedorId === null && outroEhBye && outroIndefinido) {
    destino.vencedorId = pairId;
    // Grande final resolvida por walkover (ex.: finalista da lower é um bye)
    // também define a campeã.
    if (destino.side === "grande-final") {
      bracket.campeaId = pairId;
    }
    if (destino.avancaVencedorPara) {
      colocarEmSlot(bracket, destino.avancaVencedorPara, pairId);
    }
    // Na upper, o walkover não encaminha perdedor real (o perdedor é um bye).
  }
}

/**
 * Desfaz, EM CASCATA, a presença de `pairId` no slot de destino de uma ligação
 * de avanço/encaminhamento (R6.6). Opera sobre `bracket` (já é a cópia mutável).
 *
 * Passos para o jogo de destino:
 *   1) Se o slot indicado contém `pairId`, limpa-o (torna indefinido:
 *      `pairId = null`, `bye = false`). Se contém outra dupla, nada a fazer
 *      nesse slot (o resultado antigo não o preencheu).
 *   2) Se o jogo de destino JÁ tinha `vencedorId` e esse vencedor dependia da
 *      dupla que acabou de sair (era a própria `pairId` removida, ou o jogo
 *      deixou de ter as duas duplas definidas), seu resultado é invalidado:
 *      limpamos `vencedorId`/`registradoEm`, limpamos `campeaId` se for grande
 *      final, e propagamos a invalidação para os jogos que ele alimentava
 *      (recursão transitiva).
 *
 * Mantém o bracket estruturalmente consistente: nenhuma dupla "fantasma" fica
 * em jogos futuros que não a produziram mais.
 */
function invalidarCascata(
  bracket: Bracket,
  ligacao: { matchId: MatchId; slot: "a" | "b" },
  pairId: PairId,
): void {
  const destino = bracket.matches.find((m) => m.id === ligacao.matchId);
  if (!destino) return;

  const slot = ligacao.slot === "a" ? destino.a : destino.b;

  // (1) só limpamos o slot se ele realmente carrega a dupla que saiu.
  if (slot.pairId !== pairId) return;
  slot.pairId = null;
  slot.bye = false;

  // (2) se o jogo de destino já tinha um vencedor, esse resultado dependia de
  // um confronto que não existe mais → invalida e propaga.
  if (destino.vencedorId === null) return;

  const vencedorDestino = destino.vencedorId;
  const outroPair = destino.a.pairId === null ? destino.b.pairId : destino.a.pairId;
  const perdedorDestino =
    vencedorDestino === outroPair ? pairId : (outroPair as PairId);

  destino.vencedorId = null;
  destino.registradoEm = null;
  destino.placarA = null;
  destino.placarB = null;
  if (destino.side === "grande-final" || ehFinalDeChaveUnica(destino)) {
    bracket.campeaId = null;
  }

  if (destino.avancaVencedorPara) {
    invalidarCascata(bracket, destino.avancaVencedorPara, vencedorDestino);
  }
  if (destino.side === "upper" && destino.encaminhaPerdedorPara) {
    invalidarCascata(bracket, destino.encaminhaPerdedorPara, perdedorDestino);
  }
}

/**
 * Cópia profunda de um bracket, preservando identidade, ordem e vínculos.
 * Garante a imutabilidade do contrato (a entrada nunca é mutada). Como o
 * bracket é um grafo de dados simples (sem ciclos de objeto — as ligações são
 * por `matchId`, não por referência), uma clonagem campo a campo é suficiente e
 * determinística.
 */
function clonarBracket(bracket: Bracket): Bracket {
  return {
    ...bracket,
    config: { ...bracket.config },
    duplas: bracket.duplas.map((d) => ({ ...d })),
    grupos: bracket.grupos.map((g) => ({
      ...g,
      duplas: [...g.duplas],
      jogos: [...g.jogos],
    })),
    matches: bracket.matches.map(clonarMatch),
  };
}

/** Cópia profunda de um Match (inclui participantes e ligações de avanço). */
function clonarMatch(m: Match): Match {
  return {
    ...m,
    a: { ...m.a },
    b: { ...m.b },
    avancaVencedorPara: m.avancaVencedorPara
      ? { ...m.avancaVencedorPara }
      : undefined,
    encaminhaPerdedorPara: m.encaminhaPerdedorPara
      ? { ...m.encaminhaPerdedorPara }
      : undefined,
  };
}
