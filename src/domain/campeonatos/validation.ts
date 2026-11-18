// src/domain/campeonatos/validation.ts
//
// Validação, normalização, busca, ordenação e geração de id de campeonatos
// (eventos). Funções puras, sem I/O (mesmo estilo de `domain/jogadores`).
//
// Regras (o primeiro erro, na ordem abaixo, é devolvido):
//   - nome: 1..120 após trim                                  -> NOME_INVALIDO
//   - data (início): obrigatória, ISO e existente no calendário -> DATA_INVALIDA
//   - dataFim (opcional): ISO válida e >= data                 -> DATA_FIM_INVALIDA
//   - cidade (opcional): 1..80                                 -> CIDADE_INVALIDA
//   - UF (opcional): sigla brasileira, aceita minúscula         -> UF_INVALIDA
//   - endereço (opcional): 1..200                              -> ENDERECO_INVALIDO
//   - preço (opcional): número >= 0, aceita "160", "160,50",
//     "R$ 1.500,00"                                            -> PRECO_INVALIDO
//   - precoTexto (opcional): 1..60                             -> PRECO_TEXTO_INVALIDO
//   - inscrição (opcional): URL http/https                     -> INSCRICAO_INVALIDA
//   - instagram (opcional): @usuario, usuario ou URL instagram.com
//                                                              -> INSTAGRAM_INVALIDO
//   - descrição (opcional): até 2000                           -> DESCRICAO_INVALIDA
//   - campo opcional vazio (ou só espaços) vira null
//   - listado: padrão true

import type {
  CampeonatoDados,
  CampeonatoInput,
  CampeonatoRegistro,
  ResultadoCampeonato,
} from "./types";
import { UFS_BRASIL } from "../jogadores/validation";
import { chaveTexto } from "../../utils/texto";

export const NOME_MAX = 120;
export const CIDADE_MAX = 80;
export const ENDERECO_MAX = 200;
export const PRECO_TEXTO_MAX = 60;
export const DESCRICAO_MAX = 2000;
const INSCRICAO_MAX = 500;
const INSTAGRAM_MAX = 200;
/** numeric(10,2) no banco. */
const PRECO_MAX = 99_999_999.99;

/** Origem dos campeonatos criados na área de gerenciamento. */
export const FONTE_MANUAL = "manual";

function aparar(texto: string | undefined): string {
  return (texto ?? "").trim();
}

function tamanhoValido(texto: string, max: number): boolean {
  return texto.length >= 1 && texto.length <= max;
}

/** Data ISO (YYYY-MM-DD) que existe no calendário (rejeita 2026-02-30). */
export function dataIsoValida(texto: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!m) return false;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (ano < 1900 || ano > 2999) return false;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/**
 * Converte o texto do preço em número. Aceita "160", "160,5", "160.50",
 * "R$ 1.500,00" e "1.500" (ponto de milhar). Vazio -> null. Inválido -> undefined.
 */
export function interpretarPreco(texto: string | undefined): number | null | undefined {
  let s = aparar(texto).replace(/^R\$\s*/i, "").replace(/\s+/g, "");
  if (s === "") return null;

  if (s.includes(",")) {
    // Vírgula é o separador decimal; pontos antes dela são milhares.
    if (s.indexOf(",") !== s.lastIndexOf(",")) return undefined;
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ""); // "1.500" = 1500
  }

  if (!/^\d+(\.\d{1,2})?$/.test(s)) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > PRECO_MAX) return undefined;
  return n;
}

/** URL http/https com host, sem espaços. Devolve o texto original (aparado). */
export function urlHttpValida(texto: string): boolean {
  if (!/^https?:\/\//i.test(texto) || /\s/.test(texto)) return false;
  try {
    const url = new URL(texto);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/**
 * Instagram do evento: "@usuario" (ou "usuario") vira "@usuario" em minúsculas;
 * uma URL do instagram.com é mantida como veio (posts também valem, é o que o
 * calendário coletado traz). Vazio -> null.
 */
export function normalizarInstagramEvento(
  valor: string | undefined
): ResultadoCampeonato<string | null> {
  const bruto = aparar(valor);
  if (bruto === "") return { ok: true, valor: null };
  if (bruto.length > INSTAGRAM_MAX) return { ok: false, erro: { code: "INSTAGRAM_INVALIDO" } };

  if (/^https?:\/\//i.test(bruto)) {
    if (!urlHttpValida(bruto)) return { ok: false, erro: { code: "INSTAGRAM_INVALIDO" } };
    const host = new URL(bruto).hostname.toLowerCase();
    if (host !== "instagram.com" && host !== "www.instagram.com") {
      return { ok: false, erro: { code: "INSTAGRAM_INVALIDO" } };
    }
    return { ok: true, valor: bruto };
  }

  const usuario = bruto.replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(usuario)) {
    return { ok: false, erro: { code: "INSTAGRAM_INVALIDO" } };
  }
  return { ok: true, valor: `@${usuario}` };
}

/**
 * Valida e normaliza os dados de um campeonato (entrada crua de formulário).
 * Não muta a entrada. Devolve o primeiro erro encontrado.
 */
export function validarCampeonato(
  entrada: CampeonatoInput
): ResultadoCampeonato<CampeonatoDados> {
  const nome = aparar(entrada.nome);
  if (!tamanhoValido(nome, NOME_MAX)) return { ok: false, erro: { code: "NOME_INVALIDO" } };

  const data = aparar(entrada.data);
  if (!dataIsoValida(data)) return { ok: false, erro: { code: "DATA_INVALIDA" } };

  const dataFim = aparar(entrada.dataFim);
  if (dataFim !== "" && (!dataIsoValida(dataFim) || dataFim < data)) {
    return { ok: false, erro: { code: "DATA_FIM_INVALIDA" } };
  }

  const cidade = aparar(entrada.cidade);
  if (cidade !== "" && !tamanhoValido(cidade, CIDADE_MAX)) {
    return { ok: false, erro: { code: "CIDADE_INVALIDA" } };
  }

  const uf = aparar(entrada.uf).toUpperCase();
  if (uf !== "" && !(UFS_BRASIL as readonly string[]).includes(uf)) {
    return { ok: false, erro: { code: "UF_INVALIDA" } };
  }

  const endereco = aparar(entrada.endereco);
  if (endereco !== "" && !tamanhoValido(endereco, ENDERECO_MAX)) {
    return { ok: false, erro: { code: "ENDERECO_INVALIDO" } };
  }

  const preco = interpretarPreco(entrada.preco);
  if (preco === undefined) return { ok: false, erro: { code: "PRECO_INVALIDO" } };

  const precoTexto = aparar(entrada.precoTexto);
  if (precoTexto !== "" && !tamanhoValido(precoTexto, PRECO_TEXTO_MAX)) {
    return { ok: false, erro: { code: "PRECO_TEXTO_INVALIDO" } };
  }

  const inscricao = aparar(entrada.inscricao);
  if (inscricao !== "" && (inscricao.length > INSCRICAO_MAX || !urlHttpValida(inscricao))) {
    return { ok: false, erro: { code: "INSCRICAO_INVALIDA" } };
  }

  const instagram = normalizarInstagramEvento(entrada.instagram);
  if (!instagram.ok) return instagram;

  const descricao = aparar(entrada.descricao);
  if (descricao.length > DESCRICAO_MAX) {
    return { ok: false, erro: { code: "DESCRICAO_INVALIDA" } };
  }

  return {
    ok: true,
    valor: {
      nome,
      data,
      dataFim: dataFim === "" ? null : dataFim,
      cidade: cidade === "" ? null : cidade,
      uf: uf === "" ? null : uf,
      endereco: endereco === "" ? null : endereco,
      preco,
      precoTexto: precoTexto === "" ? null : precoTexto,
      inscricao: inscricao === "" ? null : inscricao,
      instagram: instagram.valor,
      descricao: descricao === "" ? null : descricao,
      listado: entrada.listado ?? true,
    },
  };
}

// Reexportada de utils/texto (compartilhada com a busca de eventos).
export { chaveTexto };

// ---------------------------------------------------------------------------
// Id (slug) do campeonato
// ---------------------------------------------------------------------------

/** Parte do id derivada do nome: minúsculas, sem acento, só [a-z0-9-], até 60 caracteres. */
export function slugDoNome(nome: string): string {
  const slug = (nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug === "" ? "evento" : slug;
}

/** Base do id: `<slug do nome>-<ano da data>` (sem o ano quando a data não é válida). */
export function baseDoId(nome: string, data: string): string {
  const slug = slugDoNome(nome);
  const ano = /^(\d{4})-/.exec(data ?? "")?.[1];
  return ano ? `${slug}-${ano}` : slug;
}

/**
 * Id único para um campeonato novo: a base, ou a base com sufixo numérico
 * (`-2`, `-3`…) quando já está em uso. Não muta `existentes`.
 */
export function gerarIdCampeonato(
  nome: string,
  data: string,
  existentes: Iterable<string>
): string {
  const usados = new Set(existentes);
  const base = baseDoId(nome, data);
  if (!usados.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidato = `${base}-${n}`;
    if (!usados.has(candidato)) return candidato;
  }
}

// ---------------------------------------------------------------------------
// Busca e ordenação
// ---------------------------------------------------------------------------

/**
 * Filtra por texto livre: casa com nome, cidade, UF, endereço ou id, sem
 * diferenciar caixa nem acentos. Texto vazio devolve todos. Preserva a ordem.
 */
export function filtrarCampeonatos(
  campeonatos: readonly CampeonatoRegistro[],
  texto: string
): CampeonatoRegistro[] {
  const termo = chaveTexto(texto);
  if (termo === "") return [...campeonatos];
  return campeonatos.filter((c) =>
    [c.nome, c.cidade ?? "", c.uf ?? "", c.endereco ?? "", c.id].some((campo) =>
      chaveTexto(campo).includes(termo)
    )
  );
}

/**
 * Ordem determinística: data mais recente primeiro, depois nome (sem
 * acento/caixa) e id. Total e estável.
 */
export function compararCampeonatos(a: CampeonatoRegistro, b: CampeonatoRegistro): number {
  if (a.data !== b.data) return a.data < b.data ? 1 : -1;
  const porNome = chaveTexto(a.nome).localeCompare(chaveTexto(b.nome), "pt-BR");
  if (porNome !== 0) return porNome;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

export function ordenarCampeonatos(
  campeonatos: readonly CampeonatoRegistro[]
): CampeonatoRegistro[] {
  return [...campeonatos].sort(compararCampeonatos);
}
