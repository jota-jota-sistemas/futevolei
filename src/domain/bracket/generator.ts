// src/domain/bracket/generator.ts
//
// Bracket_Generator: função PURA e DETERMINÍSTICA que, dadas as duplas de uma
// categoria (com seeding já atribuído em `seed`) e a configuração de formato,
// produz a estrutura inicial do chaveamento.
//
// Sem I/O, sem relógio e sem Math.random. Mesma entrada ⇒ mesma saída (R4.2),
// e a saída é independente da ordem da lista de entrada (as duplas são sempre
// reordenadas pelo seed antes de qualquer posicionamento).
//
// O formato "dupla eliminação" (tarefa 5.1) gera o mata-mata completo.
// O formato "fase de grupos" (tarefa 6.1) gera a FASE DE GRUPOS: divide as
// duplas em G grupos por serpentina a partir do seeding e cria, em cada grupo,
// o round-robin (um jogo por par distinto). O POSICIONAMENTO dos classificados
// no mata-mata pós-grupos (tarefa 6.2) é a função pura
// `posicionarClassificadosNoMataMata`: dada a lista de classificados por grupo
// (com posição no grupo e grupoId) ela decide o seeding do mata-mata — a
// ordem/colocação dos classificados nos slots da chave de vencedores — de modo
// a evitar, na 1ª rodada, (a) 1ºs colocados de grupos distintos e (b) duplas do
// mesmo grupo, e reusa o construtor de dupla eliminação (R5.5, R5.6).
//
// Cobre:
//   - R4.3  < 2 duplas → DUPLAS_INSUFICIENTES
//   - R4.4  > 128 duplas → DUPLAS_EXCEDEM_LIMITE
//   - R4.5  cada dupla aparece exatamente uma vez na 1ª rodada da upper
//   - R4.6  byes = (próxima potência de 2 ≥ M) − M, para as melhores cabeças
//   - R4.7  exatamente 2M−2 jogos decisivos (upper + lower + grande final)
//   - R3.7  cabeças 1 e 2 em metades opostas da upper (só se cruzam na final)
//   - R4.1/R4.2  geração determinística

import type {
  Bracket,
  BracketConfig,
  DomainError,
  Group,
  GroupId,
  Match,
  MatchId,
  Pair,
  PairId,
  Participant,
} from "./types";
import { validarNumeroDeGrupos } from "./config";

const LIMITE_MINIMO_DUPLAS = 2; // R4.3
const LIMITE_MAXIMO_DUPLAS = 128; // R4.4
const VERSAO_SCHEMA = 1;

export interface GeneratorInput {
  /** Duplas da categoria, com seeding já validado (1..N consecutivo). */
  duplas: ReadonlyArray<Pair>;
  config: BracketConfig;
}

export type GeneratorResult =
  | { ok: true; bracket: Bracket }
  | { ok: false; erro: DomainError };

/**
 * Gera o chaveamento inicial de forma pura e determinística.
 *
 * - Rejeita < 2 duplas (R4.3) e > 128 duplas (R4.4).
 * - "dupla eliminação": inclui cada dupla uma vez na 1ª rodada da upper (R4.5),
 *   insere byes às melhores cabeças (R4.6), posiciona seeds 1 e 2 em metades
 *   opostas (R3.7) e produz exatamente 2M−2 jogos decisivos (R4.7).
 * - "fase de grupos": ainda não implementado (tarefas 6.x).
 */
export function gerarChaveamento(input: GeneratorInput): GeneratorResult {
  const m = input.duplas.length;

  if (m < LIMITE_MINIMO_DUPLAS) {
    return { ok: false, erro: { code: "DUPLAS_INSUFICIENTES" } };
  }
  if (m > LIMITE_MAXIMO_DUPLAS) {
    return { ok: false, erro: { code: "DUPLAS_EXCEDEM_LIMITE" } };
  }

  switch (input.config.formato) {
    case "dupla eliminação":
      return gerarDuplaEliminacao(input);
    case "fase de grupos":
      return gerarFaseDeGrupos(input);
    default:
      return { ok: false, erro: { code: "FORMATO_INVALIDO" } };
  }
}

// ---------------------------------------------------------------------------
// Dupla eliminação
// ---------------------------------------------------------------------------

/**
 * Próxima potência de dois ≥ n (com piso em 1). Para n ∈ [2,128] devolve
 * 2,4,8,…,128 conforme o caso.
 */
function proximaPotenciaDeDois(n: number): number {
  let s = 1;
  while (s < n) s *= 2;
  return s;
}

/**
 * Ordem clássica de slots de uma chave de eliminação simples com `s` posições
 * (s potência de dois). Produz a sequência de seeds (1-based) na ordem em que
 * ocupam os slots do topo ao fundo, de modo que:
 *  - seed 1 e seed 2 fiquem em metades opostas (só se cruzam na final);
 *  - cada rodada enfrente o melhor contra o pior seed disponível.
 *
 * Construção recursiva padrão ("standard seeding"): para 2 slots [1,2]; para
 * duplicar de tamanho `k` → `2k`, cada seed `x` vira o par (x, 2k+1−x).
 */
function ordemDeSlots(s: number): number[] {
  let ordem = [1];
  let tamanho = 1;
  while (tamanho < s) {
    const proximo = tamanho * 2;
    const nova: number[] = [];
    for (const seed of ordem) {
      nova.push(seed);
      nova.push(proximo + 1 - seed);
    }
    ordem = nova;
    tamanho = proximo;
  }
  return ordem;
}

/** Id determinístico de um jogo a partir de side+rodada+ordem. */
function matchId(side: string, rodada: number, ordem: number): MatchId {
  return `${side}-r${rodada}-j${ordem}`;
}

/** Participante "dupla definida". */
function participante(pairId: PairId): Participant {
  return { pairId };
}

/** Participante "bye". */
function byeParticipante(): Participant {
  return { pairId: null, bye: true };
}

/** Participante indefinido (aguardando jogo anterior). */
function indefinido(): Participant {
  return { pairId: null };
}

/**
 * Gera o mata-mata de dupla eliminação.
 *
 * Estrutura:
 *  - Chave de vencedores (upper): eliminação simples sobre S = próxima potência
 *    de dois ≥ M slots. Slots de 1..M recebem as duplas pela ordem clássica de
 *    seeds; os (S−M) slots restantes são byes, que caem sobre as melhores
 *    cabeças (menores seeds), fazendo-as avançar automaticamente na 1ª rodada.
 *  - Chave de perdedores (lower): recebe os perdedores da upper. Estrutura
 *    padrão com rodadas "menores" (recebem quedas da upper) e "maiores"
 *    (consolidam os sobreviventes da lower).
 *  - Grande final: jogo único entre o campeão da upper e o campeão da lower.
 *
 * Jogos decisivos (R4.7): exatamente 2M−2 = (M−1) na upper + (M−2) na lower
 * + 1 na grande final. Jogos cujo confronto é dupla×bye NÃO são decisivos e
 * não entram nessa contagem.
 */
function gerarDuplaEliminacao(input: GeneratorInput): GeneratorResult {
  const m = input.duplas.length;

  // Ordena as duplas por seed (1..N). Torna a saída independente da ordem da
  // lista de entrada e totalmente determinística.
  const porSeed = [...input.duplas].sort((a, b) => a.seed - b.seed);
  // seedParaDupla[seed] = Pair com aquele seed (1-based).
  const seedParaDupla = new Map<number, Pair>();
  porSeed.forEach((d) => seedParaDupla.set(d.seed, d));

  const s = proximaPotenciaDeDois(m);
  const slots = ordemDeSlots(s); // seeds (1-based) na ordem dos slots

  // Participante de cada slot: seed presente (≤ M) → dupla; senão → bye.
  // Como a ordem clássica pareia melhor×pior, os byes (seeds S..M+1) caem como
  // adversários das melhores cabeças, que avançam automaticamente (R4.6).
  const participanteDoSlot = (seed: number): Participant => {
    const dupla = seedParaDupla.get(seed);
    return dupla ? participante(dupla.id) : byeParticipante();
  };

  const matches: Match[] = [];

  // --- Chave de vencedores (upper) -----------------------------------------
  // Número de rodadas da upper: log2(S).
  const rodadasUpper = Math.log2(s);

  // Guarda, por rodada, os jogos criados (para ligar avanços).
  const upperPorRodada: Match[][] = [];

  // Rodada 1 da upper.
  const upperR1: Match[] = [];
  for (let j = 0; j < s / 2; j++) {
    const seedA = slots[2 * j];
    const seedB = slots[2 * j + 1];
    upperR1.push({
      id: matchId("upper", 1, j),
      side: "upper",
      rodada: 1,
      ordem: j,
      a: participanteDoSlot(seedA),
      b: participanteDoSlot(seedB),
      vencedorId: null,
      registradoEm: null,
    });
  }
  upperPorRodada.push(upperR1);

  // Rodadas seguintes da upper (indefinidos, preenchidos por avanço).
  for (let r = 2; r <= rodadasUpper; r++) {
    const jogosNaRodada = s / Math.pow(2, r);
    const rodada: Match[] = [];
    for (let j = 0; j < jogosNaRodada; j++) {
      rodada.push({
        id: matchId("upper", r, j),
        side: "upper",
        rodada: r,
        ordem: j,
        a: indefinido(),
        b: indefinido(),
        vencedorId: null,
        registradoEm: null,
      });
    }
    upperPorRodada.push(rodada);
  }

  // Liga avançaVencedorPara entre rodadas consecutivas da upper.
  for (let r = 0; r < upperPorRodada.length - 1; r++) {
    const atual = upperPorRodada[r];
    const proxima = upperPorRodada[r + 1];
    atual.forEach((jogo, idx) => {
      const destino = proxima[Math.floor(idx / 2)];
      jogo.avancaVencedorPara = {
        matchId: destino.id,
        slot: idx % 2 === 0 ? "a" : "b",
      };
    });
  }

  // --- Chave de perdedores (lower) -----------------------------------------
  // Estrutura padrão de double elimination: para S slots, a lower tem
  // 2*(log2(S) - 1) rodadas, alternando rodadas "menores" (recebem os
  // perdedores de uma rodada da upper) e "maiores" (apenas sobreviventes da
  // lower se enfrentam). Construímos os jogos com participantes indefinidos e
  // ligamos os avanços; os perdedores da upper são encaminhados via
  // encaminhaPerdedorPara.
  //
  // Convenção de tamanhos (número de jogos por rodada da lower), para S=2^k:
  //   LR1:  S/4   (recebe perdedores de UR1)        [menor]
  //   LR2:  S/4   (vence LR1 vs perdedores de UR2)   [maior]
  //   LR3:  S/8   (menor)
  //   LR4:  S/8   (maior)
  //   ...
  //   penúltima: 1 (menor; recebe perdedor da semifinal da upper)
  //   última:    1 (maior; final da lower)
  // Para S=2 (M=2) a lower não tem jogos.
  const lowerPorRodada: Match[][] = [];
  const k = rodadasUpper; // = log2(S)

  if (k >= 2) {
    // Quantidade de jogos por rodada da lower.
    // Geramos a sequência: para i de 1..(k-1): tamanho base = S / 2^(i+1),
    // aparecendo duas vezes (rodada menor e maior), exceto a primeira que só
    // tem a configuração completa a partir de S/4.
    const tamanhos: number[] = [];
    for (let i = 1; i <= k - 1; i++) {
      const base = s / Math.pow(2, i + 1); // S/4, S/8, ..., 1
      tamanhos.push(base); // rodada "menor"
      tamanhos.push(base); // rodada "maior"
    }
    // tamanhos.length === 2*(k-1)

    tamanhos.forEach((qtd, idx) => {
      const r = idx + 1;
      const rodada: Match[] = [];
      for (let j = 0; j < qtd; j++) {
        rodada.push({
          id: matchId("lower", r, j),
          side: "lower",
          rodada: r,
          ordem: j,
          a: indefinido(),
          b: indefinido(),
          vencedorId: null,
          registradoEm: null,
        });
      }
      lowerPorRodada.push(rodada);
    });

    // Liga avançaVencedorPara entre rodadas consecutivas da lower.
    // - De uma rodada "menor" (índice par: 0,2,4,...) para a "maior" seguinte
    //   (mesmo número de jogos): mapeamento 1:1 no slot "a" (o slot "b" da
    //   maior recebe o perdedor da upper correspondente).
    // - De uma rodada "maior" (índice ímpar: 1,3,5,...) para a "menor" seguinte
    //   (metade dos jogos): mapeamento 2:1, slots "a"/"b".
    for (let r = 0; r < lowerPorRodada.length - 1; r++) {
      const atual = lowerPorRodada[r];
      const proxima = lowerPorRodada[r + 1];
      const menorParaMaior = r % 2 === 0; // 0,2,4,... são "menores"
      atual.forEach((jogo, idx) => {
        if (menorParaMaior) {
          // mesma quantidade de jogos: vencedor ocupa o slot "a" da maior.
          const destino = proxima[idx];
          jogo.avancaVencedorPara = { matchId: destino.id, slot: "a" };
        } else {
          // maior → menor (metade): 2:1.
          const destino = proxima[Math.floor(idx / 2)];
          jogo.avancaVencedorPara = {
            matchId: destino.id,
            slot: idx % 2 === 0 ? "a" : "b",
          };
        }
      });
    }
  }

  // --- Grande final --------------------------------------------------------
  const grandeFinal: Match = {
    id: matchId("grande-final", 1, 0),
    side: "grande-final",
    rodada: 1,
    ordem: 0,
    a: indefinido(), // campeão da upper
    b: indefinido(), // campeão da lower
    vencedorId: null,
    registradoEm: null,
  };

  // Campeão da upper → slot "a" da grande final.
  const ultimaUpper = upperPorRodada[upperPorRodada.length - 1][0];
  ultimaUpper.avancaVencedorPara = { matchId: grandeFinal.id, slot: "a" };

  // Campeão da lower → slot "b" da grande final.
  if (lowerPorRodada.length > 0) {
    const ultimaLower = lowerPorRodada[lowerPorRodada.length - 1][0];
    ultimaLower.avancaVencedorPara = { matchId: grandeFinal.id, slot: "b" };
  } else {
    // Caso-base M=2 (S=2): não há chave de perdedores. O perdedor da final da
    // upper É o finalista da lower (com 0 jogos na lower), portanto é
    // ENCAMINHADO diretamente ao slot "b" da grande final, tornando-a
    // decidível. Preserva a semântica R6.4 (perdedor da upper vai para a chave
    // de perdedores — aqui, degenerada à própria grande final) e a contagem de
    // decisivos 2M−2 (upper R1 + grande final).
    ultimaUpper.encaminhaPerdedorPara = { matchId: grandeFinal.id, slot: "b" };
  }

  // --- Encaminhamento de perdedores da upper para a lower ------------------
  // Perdedores da upper UR1 → lower LR1 (rodada "menor" de índice 0).
  // Perdedores da upper URr (r≥2) → lower na rodada "maior" correspondente,
  // ocupando o slot "b" (o slot "a" veio do vencedor da lower anterior).
  if (lowerPorRodada.length > 0) {
    ligarPerdedoresUpper(upperPorRodada, lowerPorRodada, s);
  }

  // Lista ordenada de todos os jogos, em ordem topológica de avanço: upper por
  // rodada, lower por rodada, grande final.
  const todosOsJogos: Match[] = [
    ...upperPorRodada.flat(),
    ...lowerPorRodada.flat(),
    grandeFinal,
  ];

  // --- Propagação de byes --------------------------------------------------
  // Com byes (M < S), vários jogos deixam de ser contestados (walkover). Esta
  // passagem propaga, pelo grafo de avanço/encaminhamento, quais slots serão
  // ocupados apenas por um bye, marcando `bye: true` nesses participantes.
  // Assim, um jogo é DECISIVO sse nenhum de seus dois participantes é bye, e o
  // total de decisivos resulta exatamente em 2M−2 (R4.7).
  propagarByes(todosOsJogos);

  // --- Resolução de walkovers da chave de vencedores -----------------------
  // Após marcar os byes, os jogos da upper que são walkover (um lado REAL, o
  // outro BYE) são resolvidos automaticamente: a dupla real é declarada
  // vencedora e AVANÇADA fisicamente para o slot de destino, em cascata. Isso
  // garante que a dupla que recebeu um bye apareça concretamente na rodada
  // seguinte (sem ficar num slot indefinido que nunca seria preenchido),
  // tornando o chaveamento jogável de ponta a ponta. Preenchemos apenas slots
  // já marcados como indefinidos/bye — nunca sobrescrevemos uma dupla real nem
  // alteramos a marcação de bye de qualquer outro slot —, de modo que a
  // contagem de jogos decisivos (2M−2) permanece inalterada.
  resolverWalkoversUpper(todosOsJogos);

  // Monta o bracket.
  const duplasSnapshot: Pair[] = porSeed.map((d) => ({ ...d }));

  const bracket: Bracket = {
    campeonatoId: "",
    categoriaId: "",
    formato: "dupla eliminação",
    config: { ...input.config },
    duplas: duplasSnapshot,
    grupos: [],
    matches: todosOsJogos,
    campeaId: null,
    versao: VERSAO_SCHEMA,
  };

  return { ok: true, bracket };
}

/**
 * Propaga byes pelo grafo de avanço do chaveamento, marcando `bye: true` nos
 * participantes que, por construção, só podem ser ocupados por um walkover.
 *
 * A lista `jogos` deve estar em ordem topológica (upper por rodada, lower por
 * rodada, grande final), de modo que ao processar um jogo seus dois slots já
 * tenham recebido os tokens de bye dos jogos anteriores.
 *
 * Tokens por slot:
 *  - um slot cujo participante tem `bye === true` conta como BYE;
 *  - um slot "indefinido" ainda não marcado conta como REAL (será uma dupla).
 *
 * Regra por jogo (slots a, b):
 *  - a=BYE e b=BYE → vencedor BYE, perdedor BYE (não deve ocorrer na prática);
 *  - exatamente um BYE → walkover: vencedor REAL, perdedor BYE;
 *  - nenhum BYE → jogo decisivo: vencedor REAL, perdedor REAL.
 *
 * O token do vencedor é empurrado para `avancaVencedorPara`; o do perdedor para
 * `encaminhaPerdedorPara`. Só empurramos o token quando é BYE (marcando o slot
 * de destino); tokens REAL deixam o destino como estava (indefinido/real).
 *
 * Observação: esta passagem NÃO resolve walkovers (não declara vencedor nem
 * avança fisicamente a dupla real); ela apenas marca quais slots serão byes.
 * A RESOLUÇÃO de walkover (avançar a dupla real quando o adversário é um bye)
 * é feita na progressão (`colocarEmSlot`), de forma uniforme para byes da chave
 * de vencedores E da chave de perdedores — estes últimos só surgem quando os
 * perdedores da upper são encaminhados. Manter a resolução fora do gerador
 * preserva a contagem de decisivos (2M−2) na estrutura inicial.
 */
function propagarByes(jogos: ReadonlyArray<Match>): void {
  const porId = new Map<MatchId, Match>();
  for (const j of jogos) porId.set(j.id, j);

  const ehBye = (p: Participant): boolean => p.bye === true;

  const marcarDestino = (
    ligacao: { matchId: MatchId; slot: "a" | "b" } | undefined,
  ): void => {
    if (!ligacao) return;
    const destino = porId.get(ligacao.matchId);
    if (!destino) return;
    const slot = ligacao.slot === "a" ? destino.a : destino.b;
    slot.bye = true;
    slot.pairId = null;
  };

  for (const jogo of jogos) {
    const aBye = ehBye(jogo.a);
    const bBye = ehBye(jogo.b);

    // Vencedor é BYE apenas quando ambos os slots são BYE.
    const vencedorBye = aBye && bBye;
    // Perdedor é BYE quando ao menos um slot é BYE.
    const perdedorBye = aBye || bBye;

    if (vencedorBye) marcarDestino(jogo.avancaVencedorPara);
    if (perdedorBye) marcarDestino(jogo.encaminhaPerdedorPara);
  }
}

/**
 * Resolve, em ordem topológica, os WALKOVERS da chave de vencedores: jogos com
 * exatamente um bye, cuja dupla real avança automaticamente para o próximo
 * jogo. Marca `vencedorId` (sem `registradoEm` — não houve registro manual) e
 * posiciona a dupla real no slot de destino, limpando a marca de bye daquele
 * slot. A cascata trata o caso de dois walkovers consecutivos (byes múltiplos
 * para a mesma cabeça). Opera somente sobre jogos `side === "upper"`; os byes
 * da chave de perdedores só surgem durante a progressão e são resolvidos lá.
 *
 * Não altera a contagem de jogos decisivos: o slot de destino preenchido já era
 * indefinido (não-bye) ou bye; ao receber a dupla real, deixa de ser bye quando
 * era bye, o que apenas reflete a presença real da cabeça que recebeu o(s)
 * bye(s) — jogos com os dois lados reais seguem sendo os mesmos 2M−2.
 */
function resolverWalkoversUpper(jogos: ReadonlyArray<Match>): void {
  const porId = new Map<MatchId, Match>();
  for (const j of jogos) porId.set(j.id, j);

  const avancarReal = (
    ligacao: { matchId: MatchId; slot: "a" | "b" } | undefined,
    pairId: PairId,
  ): void => {
    if (!ligacao) return;
    const destino = porId.get(ligacao.matchId);
    if (!destino) return;
    const slot = ligacao.slot === "a" ? destino.a : destino.b;
    slot.pairId = pairId;
    slot.bye = false;
  };

  for (const jogo of jogos) {
    if (jogo.side !== "upper") continue;
    const aBye = jogo.a.bye === true;
    const bBye = jogo.b.bye === true;
    // Walkover = exatamente um bye, com a dupla real já definida.
    if (aBye === bBye) continue; // 0 ou 2 byes: não é walkover resolvível aqui
    const realSlot = aBye ? jogo.b : jogo.a;
    const realId = realSlot.pairId;
    if (realId === null || realId === undefined) continue;
    jogo.vencedorId = realId;
    avancarReal(jogo.avancaVencedorPara, realId);
  }
}

/**
 * Liga os perdedores da chave de vencedores aos jogos corretos da chave de
 * perdedores, via `encaminhaPerdedorPara`.
 *
 * Mapeamento padrão para S = 2^k:
 *  - Perdedores de UR1 (S/2 jogos) entram em LR1 (S/4 jogos): 2:1, slots a/b.
 *  - Perdedores de URr, r ≥ 2 (S/2^r jogos), entram na rodada "maior" da lower
 *    cujo tamanho é igual (S/2^r jogos), no slot "b" (1:1).
 *
 * As rodadas "maiores" da lower estão nos índices ímpares (1,3,5,...). A rodada
 * maior que recebe os perdedores de URr é a de índice (2*(r−1) − 1) na lista
 * lowerPorRodada (0-based). Para r=2 → índice 1; r=3 → índice 3; etc.
 */
function ligarPerdedoresUpper(
  upperPorRodada: Match[][],
  lowerPorRodada: Match[][],
  s: number,
): void {
  // UR1 → LR1 (índice 0 da lower), 2:1.
  const ur1 = upperPorRodada[0];
  const lr1 = lowerPorRodada[0];
  ur1.forEach((jogo, idx) => {
    const destino = lr1[Math.floor(idx / 2)];
    jogo.encaminhaPerdedorPara = {
      matchId: destino.id,
      slot: idx % 2 === 0 ? "a" : "b",
    };
  });

  // URr (r≥2) → rodada "maior" da lower, slot "b", 1:1.
  const k = Math.log2(s);
  for (let r = 2; r <= k; r++) {
    const ur = upperPorRodada[r - 1]; // 0-based
    const indiceLowerMaior = 2 * (r - 1) - 1; // 1,3,5,...
    const lowerMaior = lowerPorRodada[indiceLowerMaior];
    ur.forEach((jogo, idx) => {
      const destino = lowerMaior[idx];
      jogo.encaminhaPerdedorPara = { matchId: destino.id, slot: "b" };
    });
  }
}

// ---------------------------------------------------------------------------
// Fase de grupos (tarefa 6.1)
// ---------------------------------------------------------------------------

/** Id determinístico de um grupo a partir do seu índice 0-based. */
function groupId(indice: number): GroupId {
  return `grupo-${indice}`;
}

/**
 * Id determinístico de um jogo de round-robin de um grupo. Usa o índice do
 * grupo e os seeds (1-based) das duas duplas confrontadas (menor×maior), de
 * modo que o id seja estável e independente da ordem de iteração.
 */
function jogoDeGrupoId(indiceGrupo: number, seedA: number, seedB: number): MatchId {
  return `grupo-${indiceGrupo}-s${seedA}-s${seedB}`;
}

/**
 * Distribui `n` posições de seed (1-based, em ordem crescente) em `g` grupos
 * por SERPENTINA (ida-e-volta): grupos 0,1,…,g−1,g−1,…,1,0,0,1,… Devolve, para
 * cada grupo (índice 0-based), a lista de seeds daquele grupo em ordem
 * crescente de seed.
 *
 * O padrão serpentina garante que os tamanhos dos grupos difiram em no máximo
 * uma dupla e que a cabeça 1 caia no grupo 0 (as melhores cabeças ficam em
 * grupos distintos).
 */
function distribuirSerpentina(n: number, g: number): number[][] {
  const grupos: number[][] = Array.from({ length: g }, () => []);
  let indice = 0;
  let passo = 1; // +1 na ida, -1 na volta
  for (let seed = 1; seed <= n; seed++) {
    grupos[indice].push(seed);
    // Avança para o próximo grupo em ida-e-volta.
    if (g === 1) {
      indice = 0;
    } else if (indice + passo < 0 || indice + passo >= g) {
      // Chegou numa ponta: inverte o sentido e permanece neste grupo uma vez
      // (0,1,…,g−1,g−1,…,1,0,0,1,…).
      passo = -passo;
    } else {
      indice += passo;
    }
  }
  return grupos;
}

/**
 * Gera a FASE DE GRUPOS de forma pura e determinística.
 *
 * - Valida `config.numeroDeGrupos` contra N via `validarNumeroDeGrupos`
 *   (ausente ou inválido → `GRUPOS_INVALIDO`).
 * - Ordena as duplas por seed (independência da ordem de entrada) e distribui
 *   em G grupos por serpentina (tamanhos diferem em no máximo 1; seed 1 no
 *   grupo 0) — R3.5, R5.1.
 * - Cria, em cada grupo de tamanho g, exatamente um jogo por par distinto de
 *   duplas (round-robin), totalizando g(g−1)/2 jogos — R5.2.
 * - Cada dupla aparece em exatamente um grupo — R4.5.
 *
 * O mata-mata pós-grupos (posicionamento dos classificados) é a tarefa 6.2;
 * aqui `matches` contém apenas os jogos de grupo e `campeaId` é null.
 */
function gerarFaseDeGrupos(input: GeneratorInput): GeneratorResult {
  const n = input.duplas.length;

  // Valida o número de grupos contra N (ausente → GRUPOS_INVALIDO).
  const g = input.config.numeroDeGrupos;
  if (!validarNumeroDeGrupos(g, n).ok) {
    return { ok: false, erro: { code: "GRUPOS_INVALIDO" } };
  }
  const numeroDeGrupos = g as number;

  // Ordena as duplas por seed (1..N). Torna a saída independente da ordem da
  // lista de entrada e totalmente determinística.
  const porSeed = [...input.duplas].sort((a, b) => a.seed - b.seed);
  const seedParaDupla = new Map<number, Pair>();
  porSeed.forEach((d) => seedParaDupla.set(d.seed, d));

  // Distribuição em serpentina (lista de seeds por grupo, em ordem crescente).
  const seedsPorGrupo = distribuirSerpentina(n, numeroDeGrupos);

  const grupos: Group[] = [];
  const matches: Match[] = [];

  seedsPorGrupo.forEach((seedsDoGrupo, indiceGrupo) => {
    const id = groupId(indiceGrupo);
    const duplasDoGrupo: PairId[] = seedsDoGrupo.map(
      (seed) => (seedParaDupla.get(seed) as Pair).id,
    );

    // Round-robin: um jogo para cada par distinto de duplas do grupo. Itera
    // sobre pares (menor seed × maior seed) em ordem determinística, numerando
    // rodada/ordem de forma estável.
    const jogosDoGrupo: MatchId[] = [];
    let ordem = 0;
    for (let i = 0; i < seedsDoGrupo.length; i++) {
      for (let j = i + 1; j < seedsDoGrupo.length; j++) {
        const seedA = seedsDoGrupo[i];
        const seedB = seedsDoGrupo[j];
        const duplaA = seedParaDupla.get(seedA) as Pair;
        const duplaB = seedParaDupla.get(seedB) as Pair;
        const jogo: Match = {
          id: jogoDeGrupoId(indiceGrupo, seedA, seedB),
          side: "grupo",
          rodada: 1,
          ordem,
          a: participante(duplaA.id),
          b: participante(duplaB.id),
          vencedorId: null,
          registradoEm: null,
          grupoId: id,
        };
        matches.push(jogo);
        jogosDoGrupo.push(jogo.id);
        ordem++;
      }
    }

    grupos.push({
      id,
      indice: indiceGrupo,
      duplas: duplasDoGrupo,
      jogos: jogosDoGrupo,
    });
  });

  const duplasSnapshot: Pair[] = porSeed.map((d) => ({ ...d }));

  const bracket: Bracket = {
    campeonatoId: "",
    categoriaId: "",
    formato: "fase de grupos",
    config: { ...input.config },
    duplas: duplasSnapshot,
    grupos,
    matches,
    campeaId: null,
    versao: VERSAO_SCHEMA,
  };

  return { ok: true, bracket };
}

// ---------------------------------------------------------------------------
// Transição grupos → mata-mata: posicionamento dos classificados (tarefa 6.2)
// ---------------------------------------------------------------------------
//
// Esta seção trata a TRANSIÇÃO da fase de grupos para o mata-mata de dupla
// eliminação (R5.4/R5.5/R5.6). A geração INICIAL (`gerarChaveamento`) ainda não
// conhece os classificados concretos — eles só existem depois que os jogos de
// grupo têm vencedor. Por isso o posicionamento é uma função pura dedicada,
// separada do gerador inicial, cuja entrada é a lista de classificados por
// grupo (já ordenados) e cuja saída é o mata-mata com esses classificados
// posicionados na chave de vencedores.

/**
 * Um classificado da fase de grupos a ser posicionado no mata-mata.
 *
 * Contrato de entrada de `posicionarClassificadosNoMataMata`:
 * - `pair`: a dupla classificada (o seu `seed` é o seed ORIGINAL da categoria,
 *   usado como critério determinístico de ordenação dentro de cada colocação).
 * - `grupoId`: identificador do grupo de onde a dupla se classificou — usado
 *   para evitar, na 1ª rodada do mata-mata, confronto entre duplas do mesmo
 *   grupo (regra (b), R5.5).
 * - `posicaoNoGrupo`: colocação da dupla no seu grupo (1 = primeiro colocado).
 *   Usada para (a) evitar 1ºs×1ºs na 1ª rodada (R5.5/R5.6) e para a ordenação
 *   do seeding do mata-mata (1ºs antes dos 2ºs, etc.).
 */
export interface ClassificadoDoGrupo {
  pair: Pair;
  grupoId: GroupId;
  posicaoNoGrupo: number; // 1 = primeiro colocado do grupo
}

export type PosicionamentoResult =
  | { ok: true; bracket: Bracket }
  | { ok: false; erro: DomainError };

/**
 * Posiciona os CLASSIFICADOS da fase de grupos na chave de vencedores de um
 * mata-mata de dupla eliminação, de forma PURA e DETERMINÍSTICA (R5.5, R5.6).
 *
 * Contrato:
 * - Entrada: a lista de classificados (`ClassificadoDoGrupo[]`), em qualquer
 *   ordem — a função é independente da ordem da lista — e o `config` do
 *   chaveamento (formato "fase de grupos" com `classificadosPorGrupo`).
 * - Saída: um `Bracket` de mata-mata (reusando `gerarDuplaEliminacao`), cujas
 *   duplas são os classificados reposicionados por um SEEDING DE MATA-MATA que
 *   satisfaz, na 1ª rodada:
 *     (a) nenhum confronto entre dois PRIMEIROS colocados (posicaoNoGrupo === 1)
 *         de grupos distintos; e
 *     (b) nenhum confronto entre dois classificados do MESMO grupo.
 *   Quando não é possível satisfazer (a) e (b) ao mesmo tempo, PRIORIZA de forma
 *   determinística a condição (a) — evitar 1ºs×1ºs.
 *
 * Erros:
 * - `CLASSIFICADOS_INVALIDO` se a lista estiver vazia ou tiver uma só dupla
 *   (um mata-mata precisa de ≥ 2 duplas).
 *
 * Algoritmo do seeding do mata-mata (documentado):
 *
 *   1. Ordena os classificados por (posicaoNoGrupo asc, seed original asc).
 *      Isto produz o "seeding base": todos os 1ºs colocados primeiro (ordenados
 *      pelo melhor seed original), depois todos os 2ºs, e assim por diante. É
 *      este o seeding de mata-mata inicial: a posição i (1-based) desta lista é
 *      o seed de mata-mata i.
 *
 *   2. Monta o mata-mata sobre S = próxima potência de dois ≥ M slots. A ordem
 *      clássica de slots (`ordemDeSlots`) pareia, na 1ª rodada, o seed de
 *      mata-mata p contra o seed S+1−p; os seeds M+1..S são byes e caem sobre
 *      as melhores cabeças, de modo que os 1ºs colocados tendem a (i) ganhar bye
 *      ou (ii) enfrentar os piores classificados (últimas colocações). Isso, por
 *      si só, já afasta a maioria dos confrontos proibidos.
 *
 *   3. REPARO determinístico: percorre os confrontos REAIS (dupla×dupla, sem
 *      bye) da 1ª rodada, em ordem estável. Para cada confronto que viole (a)
 *      [dois 1ºs de grupos distintos] ou (b) [mesmo grupo], tenta uma TROCA de
 *      posições de seed de mata-mata DENTRO DA MESMA COLOCAÇÃO (para preservar a
 *      estrutura 1ºs/2ºs/… e o determinismo), escolhendo a primeira troca que
 *      reduz as violações sem criar violações de MAIOR prioridade. A prioridade
 *      é: (a) estritamente acima de (b). Assim, se uma troca remove uma violação
 *      (b) mas criaria uma (a), ela é rejeitada; o inverso é aceito.
 *
 *   4. Depois do reparo, cada classificado recebe como `seed` a sua posição
 *      final (1..M) e o mata-mata é construído por `gerarDuplaEliminacao`.
 *
 * A prioridade determinística de (a) sobre (b) e a ordem fixa de varredura/troca
 * garantem a mesma saída para a mesma entrada (R4.2) e independência da ordem da
 * lista de entrada.
 */
export function posicionarClassificadosNoMataMata(
  classificados: ReadonlyArray<ClassificadoDoGrupo>,
  config: BracketConfig,
): PosicionamentoResult {
  const m = classificados.length;
  if (m < 2) {
    return { ok: false, erro: { code: "CLASSIFICADOS_INVALIDO" } };
  }

  // (1) Seeding base: 1ºs colocados primeiro, depois 2ºs, etc.; dentro de cada
  // colocação, por seed original crescente. Totalmente determinístico e
  // independente da ordem da lista de entrada.
  const ordenados = [...classificados].sort((x, y) => {
    if (x.posicaoNoGrupo !== y.posicaoNoGrupo) {
      return x.posicaoNoGrupo - y.posicaoNoGrupo;
    }
    if (x.pair.seed !== y.pair.seed) {
      return x.pair.seed - y.pair.seed;
    }
    // Desempate final estável pelo id da dupla.
    return x.pair.id.localeCompare(y.pair.id);
  });

  // `atribuicao[p]` = índice (em `ordenados`) do classificado no seed de
  // mata-mata (p+1). Começa como identidade (seeding base).
  const atribuicao: number[] = ordenados.map((_, i) => i);

  // (2) Estrutura de confrontos da 1ª rodada sobre S slots.
  const s = proximaPotenciaDeDois(m);
  const slots = ordemDeSlots(s); // seeds de mata-mata (1-based) na ordem dos slots

  // Pares de seeds de mata-mata (1-based) confrontados na 1ª rodada que são
  // REAIS (ambos ≤ M). Os demais (um lado é bye) não geram confronto.
  const confrontosReais: Array<[number, number]> = [];
  for (let j = 0; j < s / 2; j++) {
    const seedA = slots[2 * j];
    const seedB = slots[2 * j + 1];
    if (seedA <= m && seedB <= m) {
      confrontosReais.push([seedA, seedB]);
    }
  }

  // Helpers de violação a partir da atribuição corrente.
  const classificadoDoSeed = (seedMM: number): ClassificadoDoGrupo =>
    ordenados[atribuicao[seedMM - 1]];

  const ehPrimeiro = (c: ClassificadoDoGrupo): boolean => c.posicaoNoGrupo === 1;

  // Violação (a): dois PRIMEIROS colocados de grupos DISTINTOS.
  const violaA = (x: ClassificadoDoGrupo, y: ClassificadoDoGrupo): boolean =>
    ehPrimeiro(x) && ehPrimeiro(y) && x.grupoId !== y.grupoId;

  // Violação (b): duas duplas do MESMO grupo.
  const violaB = (x: ClassificadoDoGrupo, y: ClassificadoDoGrupo): boolean =>
    x.grupoId === y.grupoId;

  // Custo de um confronto: [custoA, custoB] (cada 0 ou 1). Comparado
  // lexicograficamente — (a) domina (b).
  const custoConfronto = (seedA: number, seedB: number): [number, number] => {
    const x = classificadoDoSeed(seedA);
    const y = classificadoDoSeed(seedB);
    return [violaA(x, y) ? 1 : 0, violaB(x, y) ? 1 : 0];
  };

  // Custo total da 1ª rodada (soma componente a componente).
  const custoTotal = (): [number, number] => {
    let a = 0;
    let b = 0;
    for (const [sa, sb] of confrontosReais) {
      const [ca, cb] = custoConfronto(sa, sb);
      a += ca;
      b += cb;
    }
    return [a, b];
  };

  // Compara dois custos lexicograficamente: < 0 se `l` é melhor (menos (a); em
  // empate de (a), menos (b)).
  const comparaCusto = (l: [number, number], r: [number, number]): number => {
    if (l[0] !== r[0]) return l[0] - r[0];
    return l[1] - r[1];
  };

  // (3) Reparo determinístico: enquanto houver melhoria, tenta a PRIMEIRA troca
  // (em ordem estável) de dois seeds de mata-mata DENTRO DA MESMA COLOCAÇÃO que
  // reduza lexicograficamente o custo total. A restrição "mesma colocação"
  // preserva a estrutura 1ºs/2ºs/… e o determinismo. Converge porque cada passo
  // reduz estritamente um custo inteiro ≥ 0 limitado.
  //
  // Limite de passos defensivo (nunca atingido na prática): M*M.
  const posicaoDoSeed = (c: ClassificadoDoGrupo): number => c.posicaoNoGrupo;

  let melhoria = true;
  let guarda = 0;
  const limite = m * m + 1;
  while (melhoria && guarda < limite) {
    melhoria = false;
    guarda++;
    const custoAtual = custoTotal();
    if (custoAtual[0] === 0 && custoAtual[1] === 0) break; // ótimo possível

    // Varre pares de seeds de mata-mata (p < q) em ordem estável.
    busca: for (let p = 1; p <= m; p++) {
      for (let q = p + 1; q <= m; q++) {
        // Só troca dentro da MESMA colocação original.
        const cp = classificadoDoSeed(p);
        const cq = classificadoDoSeed(q);
        if (posicaoDoSeed(cp) !== posicaoDoSeed(cq)) continue;

        // Aplica a troca tentativamente.
        const tmp = atribuicao[p - 1];
        atribuicao[p - 1] = atribuicao[q - 1];
        atribuicao[q - 1] = tmp;

        const novoCusto = custoTotal();
        if (comparaCusto(novoCusto, custoAtual) < 0) {
          // Melhorou: mantém e recomeça a varredura.
          melhoria = true;
          break busca;
        }

        // Não melhorou: desfaz.
        atribuicao[q - 1] = atribuicao[p - 1];
        atribuicao[p - 1] = tmp;
      }
    }
  }

  // (4) Constrói o mata-mata com o seeding final. Cada classificado recebe como
  // `seed` a sua posição final (1..M), que `gerarDuplaEliminacao` usa para
  // posicionar nos slots.
  const duplasMataMata: Pair[] = [];
  for (let p = 1; p <= m; p++) {
    const c = classificadoDoSeed(p);
    duplasMataMata.push({ ...c.pair, seed: p });
  }

  const resultado = gerarDuplaEliminacao({ duplas: duplasMataMata, config });
  if (!resultado.ok) return resultado;
  return { ok: true, bracket: resultado.bracket };
}
