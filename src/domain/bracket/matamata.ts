// src/domain/bracket/matamata.ts
//
// Passagem da fase de grupos para o mata-mata: o que ainda falta, e o mata-mata
// montado (com a prévia dos cruzamentos) ANTES de gravar. Funções puras.

import type { Bracket, Match, Pair, DomainError } from "./types";
import { posicionarClassificadosNoMataMata, type ClassificadoDoGrupo } from "./generator";
import { selecionarClassificados } from "./standings";
import { numerarJogos } from "./ordenacao";
import { rotuloDupla } from "../pairs/nome";

const ehJogoReal = (m: Match): boolean => !m.a.bye && !m.b.bye;

/** Jogos de grupo ainda sem vencedor, em ordem de disputa. */
export function jogosPendentesDosGrupos(bracket: Pick<Bracket, "matches">): Match[] {
  return bracket.matches
    .filter((m) => m.side === "grupo" && ehJogoReal(m) && m.vencedorId === null)
    .sort(
      (x, y) =>
        (x.ordemDisputa ?? Number.POSITIVE_INFINITY) - (y.ordemDisputa ?? Number.POSITIVE_INFINITY)
    );
}

/** "Faltam Jogo 4, 7 e 9" / "Falta o Jogo 4" / "Faltam 3 jogos". */
export function descreverFaltantes(pendentes: readonly Match[]): string {
  const n = pendentes.length;
  if (n === 0) return "";
  const numeros = pendentes.map((m) => m.ordemDisputa);
  if (numeros.some((x) => x === null)) return n === 1 ? "Falta 1 jogo" : `Faltam ${n} jogos`;
  const lista = (numeros as number[]).map((x) => `Jogo ${x}`);
  if (n === 1) return `Falta o ${lista[0]}`;
  return `Faltam ${lista.slice(0, -1).join(", ")} e ${lista[n - 1]}`;
}

/** Fase de grupos com todos os jogos decididos e ainda sem mata-mata? */
export function podeGerarMataMata(bracket: Bracket): boolean {
  if (bracket.formato !== "fase de grupos" || bracket.grupos.length === 0) return false;
  if (!bracket.matches.some((m) => m.side === "grupo")) return false;
  if (bracket.matches.some((m) => m.side !== "grupo")) return false;
  return jogosPendentesDosGrupos(bracket).length === 0;
}

export interface Cruzamento {
  /** Número do jogo (null se ainda não numerado). */
  jogo: number | null;
  a: string;
  b: string;
}

export type PreparoMataMata =
  | { tipo: "incompleto"; pendentes: Match[] }
  | { tipo: "erro"; erro: DomainError }
  | { tipo: "pronto"; bracket: Bracket; cruzamentos: Cruzamento[] };

/**
 * Monta o chaveamento COMBINADO (jogos de grupo com os resultados + mata-mata dos
 * classificados) e a lista dos primeiros cruzamentos, sem gravar nada.
 */
export function prepararMataMata(bracket: Bracket): PreparoMataMata {
  const pendentes = jogosPendentesDosGrupos(bracket);
  if (bracket.formato !== "fase de grupos" || pendentes.length > 0) {
    return { tipo: "incompleto", pendentes };
  }
  const porId = new Map(bracket.duplas.map((d) => [d.id, d]));
  const porGrupo = bracket.config.classificadosPorGrupo ?? 1;

  const classificados: ClassificadoDoGrupo[] = [];
  for (const grupo of bracket.grupos) {
    const top = selecionarClassificados(grupo, bracket.matches, porGrupo);
    if (top === null) return { tipo: "incompleto", pendentes };
    for (const s of top) {
      const pair = porId.get(s.pairId);
      if (pair) classificados.push({ pair, grupoId: grupo.id, posicaoNoGrupo: s.posicao });
    }
  }

  const pos = posicionarClassificadosNoMataMata(classificados, bracket.config);
  if (!pos.ok) return { tipo: "erro", erro: pos.erro };

  const jogosGrupo = bracket.matches.filter((m) => m.side === "grupo");
  const jogosMata = pos.bracket.matches.filter((m) => m.side !== "grupo");
  const duplas = new Map<string, Pair>();
  for (const d of bracket.duplas) duplas.set(d.id, d);
  for (const d of pos.bracket.duplas) duplas.set(d.id, { ...d });

  const combinado: Bracket = numerarJogos({
    ...bracket,
    duplas: Array.from(duplas.values()),
    matches: [...jogosGrupo, ...jogosMata],
  });

  const nome = (id: string | null): string => {
    const d = id ? duplas.get(id) : undefined;
    return d ? rotuloDupla(d) : "(a definir)";
  };
  const cruzamentos = combinado.matches
    .filter((m) => m.side !== "grupo" && ehJogoReal(m) && m.a.pairId !== null && m.b.pairId !== null)
    .sort(
      (x, y) =>
        (x.ordemDisputa ?? Number.POSITIVE_INFINITY) - (y.ordemDisputa ?? Number.POSITIVE_INFINITY)
    )
    .map((m) => ({ jogo: m.ordemDisputa, a: nome(m.a.pairId), b: nome(m.b.pairId) }));

  return { tipo: "pronto", bracket: combinado, cruzamentos };
}
