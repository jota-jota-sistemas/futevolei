// src/domain/campeonatos/progresso.ts
//
// "Meus eventos": progresso de organização de cada campeonato, filtros por
// situação (próximos, passados, arquivados), ordenação para quem gerencia e os
// dados de uma cópia (Duplicar). Funções puras, sem I/O.

import type { CampeonatoInput, CampeonatoRegistro } from "./types";
import { compararCampeonatos } from "./validation";

// ---------------------------------------------------------------------------
// Progresso
// ---------------------------------------------------------------------------

/** Contagens de um campeonato, como vêm do banco. */
export interface DadosProgresso {
  categorias: number;
  duplas: number;
  /** Categorias com chaveamento gerado. */
  chaveamentos: number;
  /** Jogos de verdade (sem bye) e quantos já têm vencedor. */
  jogos: number;
  concluidos: number;
  /** Nomes das categorias (para levar direto à única categoria, se houver só uma). */
  nomesCategorias: string[];
}

export type EtapaProgresso =
  | "sem_categorias"
  | "sem_duplas"
  | "sem_chaveamento"
  | "em_andamento"
  | "concluido";

export interface ResumoProgresso extends DadosProgresso {
  etapa: EtapaProgresso;
}

/** Zeros: campeonato sem nada ainda (ou sem dados lidos). */
export const PROGRESSO_VAZIO: DadosProgresso = {
  categorias: 0,
  duplas: 0,
  chaveamentos: 0,
  jogos: 0,
  concluidos: 0,
  nomesCategorias: [],
};

/** Em que etapa o campeonato está (a mais atrasada que ainda falta fazer). */
export function resumirProgresso(d: DadosProgresso): ResumoProgresso {
  let etapa: EtapaProgresso;
  if (d.categorias === 0) etapa = "sem_categorias";
  else if (d.duplas === 0) etapa = "sem_duplas";
  else if (d.chaveamentos === 0) etapa = "sem_chaveamento";
  else if (d.jogos > 0 && d.concluidos >= d.jogos) etapa = "concluido";
  else etapa = "em_andamento";
  return { ...d, etapa };
}

const plural = (n: number, singular: string, pluralTxt: string): string =>
  `${n} ${n === 1 ? singular : pluralTxt}`;

/** Ex.: "3 categorias · 24 duplas · chaveamento gerado · 5/18 jogos". */
export function rotuloProgresso(r: ResumoProgresso): string {
  if (r.etapa === "sem_categorias") return "Sem categorias";
  const partes = [plural(r.categorias, "categoria", "categorias")];
  if (r.etapa === "sem_duplas") {
    partes.push("sem duplas");
    return partes.join(" · ");
  }
  partes.push(plural(r.duplas, "dupla", "duplas"));
  if (r.etapa === "sem_chaveamento") {
    partes.push("chaveamento não gerado");
  } else if (r.etapa === "concluido") {
    partes.push(`todos os ${plural(r.jogos, "jogo concluído", "jogos concluídos")}`.replace("todos os 1 jogo", "o único jogo"));
  } else {
    partes.push(
      r.chaveamentos < r.categorias
        ? `chaveamento em ${r.chaveamentos}/${r.categorias}`
        : "chaveamento gerado"
    );
    if (r.jogos > 0) partes.push(`${r.concluidos}/${r.jogos} jogos`);
  }
  return partes.join(" · ");
}

// ---------------------------------------------------------------------------
// Datas, filtros e ordenação
// ---------------------------------------------------------------------------

/** Último dia do evento (ISO): `dataFim` quando válida, senão `data`. */
function ultimoDia(c: Pick<CampeonatoRegistro, "data" | "dataFim">): string {
  return c.dataFim && c.dataFim >= c.data ? c.dataFim : c.data;
}

/** O evento ainda não terminou (hoje conta como "próximo")? */
export function ehProximo(c: Pick<CampeonatoRegistro, "data" | "dataFim">, hoje: string): boolean {
  return ultimoDia(c) >= hoje;
}

/** O evento está acontecendo hoje (entre o início e o fim, inclusive)? */
export function acontecendoHoje(c: Pick<CampeonatoRegistro, "data" | "dataFim">, hoje: string): boolean {
  return c.data <= hoje && hoje <= ultimoDia(c);
}

export type FiltroEstado = "proximos" | "passados" | "arquivados" | "todos";

export const FILTROS_ESTADO: readonly { valor: FiltroEstado; rotulo: string }[] = [
  { valor: "proximos", rotulo: "Próximos" },
  { valor: "passados", rotulo: "Passados" },
  { valor: "arquivados", rotulo: "Arquivados" },
  { valor: "todos", rotulo: "Todos" },
];

/**
 * Filtra por situação. Arquivados só aparecem em "Arquivados" e "Todos";
 * "Próximos" e "Passados" são só de campeonatos ativos. Preserva a ordem.
 */
export function filtrarPorEstado<T extends Pick<CampeonatoRegistro, "data" | "dataFim" | "ativo">>(
  lista: readonly T[],
  filtro: FiltroEstado,
  hoje: string
): T[] {
  switch (filtro) {
    case "proximos":
      return lista.filter((c) => c.ativo && ehProximo(c, hoje));
    case "passados":
      return lista.filter((c) => c.ativo && !ehProximo(c, hoje));
    case "arquivados":
      return lista.filter((c) => !c.ativo);
    case "todos":
      return [...lista];
  }
}

/** Quantos campeonatos cada filtro mostraria (para os números nos chips). */
export function contarPorEstado(
  lista: readonly Pick<CampeonatoRegistro, "data" | "dataFim" | "ativo">[],
  hoje: string
): Record<FiltroEstado, number> {
  return {
    proximos: filtrarPorEstado(lista, "proximos", hoje).length,
    passados: filtrarPorEstado(lista, "passados", hoje).length,
    arquivados: filtrarPorEstado(lista, "arquivados", hoje).length,
    todos: lista.length,
  };
}

/**
 * Filtro inicial: "Próximos" quando há algum; senão "Todos" (a pessoa nunca
 * abre a lista numa tela vazia só porque os eventos dela já passaram).
 */
export function filtroInicial(
  lista: readonly Pick<CampeonatoRegistro, "data" | "dataFim" | "ativo">[],
  hoje: string
): FiltroEstado {
  return filtrarPorEstado(lista, "proximos", hoje).length > 0 ? "proximos" : "todos";
}

/**
 * Ordem para quem gerencia: os que ainda não terminaram primeiro, do mais
 * próximo para o mais distante; depois os que já passaram, do mais recente para
 * o mais antigo. Desempate por nome e id (a mesma ordem total do domínio).
 */
export function ordenarParaGestao<T extends CampeonatoRegistro>(lista: readonly T[], hoje: string): T[] {
  const proximos = lista.filter((c) => ehProximo(c, hoje)).sort((a, b) => (a.data === b.data ? compararCampeonatos(a, b) : a.data < b.data ? -1 : 1));
  const passados = lista.filter((c) => !ehProximo(c, hoje)).sort(compararCampeonatos);
  return [...proximos, ...passados];
}

// ---------------------------------------------------------------------------
// Duplicar
// ---------------------------------------------------------------------------

const MS_DIA = 86_400_000;

/** Soma `dias` a uma data ISO (YYYY-MM-DD), em UTC (sem depender do fuso). */
export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d) + dias * MS_DIA).toISOString().slice(0, 10);
}

/**
 * Datas sugeridas para a cópia: 52 semanas depois (mesmo dia da semana, que é o
 * que importa para campeonatos anuais). A data final acompanha o mesmo
 * deslocamento. A pessoa pode trocar as duas antes de criar.
 */
export function sugerirDatasDaCopia(c: Pick<CampeonatoRegistro, "data" | "dataFim">): {
  data: string;
  dataFim: string;
} {
  const desloca = 52 * 7;
  return {
    data: somarDias(c.data, desloca),
    dataFim: c.dataFim && c.dataFim > c.data ? somarDias(c.dataFim, desloca) : "",
  };
}

/** Nome sugerido para a cópia. Nunca passa de 120 caracteres. */
export function nomeDaCopia(nome: string): string {
  const sufixo = " (cópia)";
  const base = nome.length + sufixo.length > 120 ? nome.slice(0, 120 - sufixo.length).trimEnd() : nome;
  return `${base}${sufixo}`;
}

/**
 * Entrada de formulário (texto) da cópia: os mesmos dados do original, com o
 * novo nome e as novas datas. Quem cria valida (`validarCampeonato`).
 */
export function dadosDaCopia(
  origem: CampeonatoRegistro,
  novo: { nome: string; data: string; dataFim: string }
): CampeonatoInput {
  return {
    nome: novo.nome,
    data: novo.data,
    dataFim: novo.dataFim,
    cidade: origem.cidade ?? "",
    uf: origem.uf ?? "",
    endereco: origem.endereco ?? "",
    preco: origem.preco === null ? "" : String(origem.preco),
    precoTexto: origem.precoTexto ?? "",
    inscricao: origem.inscricao ?? "",
    instagram: origem.instagram ?? "",
    descricao: origem.descricao ?? "",
    listado: origem.listado,
  };
}
