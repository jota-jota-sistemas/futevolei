import type { Campeonato, Torneio } from "../types";

/**
 * Conversão de um registro no formato de `src/data/torneios.json` (coletado de
 * torneios-ftv.com) para o modelo `Campeonato`, usado pelo site.
 *
 * O restante do site (lista, filtros, cards, detalhe) trabalha com o tipo
 * `Campeonato`. Esta camada converte cada `Torneio` em `Campeonato` e padroniza
 * o que vem "sujo" da origem (caixa de cidades e categorias). Quem lê os eventos
 * é `utils/eventos-db.ts` (tabela `campeonatos` do Supabase); o JSON só alimenta
 * o seed (`supabase/seed-eventos.sql`).
 */

/** Conectivos que permanecem em minúsculas em nomes próprios (pt-BR). */
const CONECTIVOS = new Set(["de", "da", "do", "das", "dos", "e"]);

/**
 * Padroniza a caixa de um texto livre ("GUARULHOS", "mogi das cruzes",
 * "35+ (CARREGA)") em "Título" pt-BR: primeira letra de cada palavra em
 * maiúscula, conectivos em minúsculas e siglas de uma letra ("c", "b+c",
 * "+c") ou algarismos romanos curtos ("i", "ii") em maiúsculas.
 * Pura e idempotente.
 */
export function tituloPtBr(texto: string): string {
  const limpo = (texto ?? "").replace(/\s+/g, " ").trim();
  if (!limpo) return "";
  return limpo
    .split(" ")
    .map((palavra, i) => {
      const minuscula = palavra.toLocaleLowerCase("pt-BR");
      // "c", "b+c", "a+b", "+c": letras soltas unidas por "+".
      if (/^\+?[a-z](\+[a-z])*$/.test(minuscula)) return minuscula.toUpperCase();
      // Algarismos romanos curtos usados em "Estreante I / II".
      if (/^i{1,3}$/.test(minuscula)) return minuscula.toUpperCase();
      if (i > 0 && CONECTIVOS.has(minuscula)) return minuscula;
      // Maiúscula na primeira LETRA (ignora "(" e dígitos iniciais, ex.: "(carrega)").
      return minuscula.replace(/\p{L}/u, (letra) => letra.toLocaleUpperCase("pt-BR"));
    })
    .join(" ");
}

/**
 * Padroniza a caixa e remove duplicatas (sem diferenciar maiúsculas) de uma
 * lista de categorias, preservando a ordem da primeira ocorrência e
 * descartando vazias. Ex.: ["iniciante", "Iniciante", "INICIANTE"] -> ["Iniciante"].
 */
export function normalizarCategorias(categorias: string[]): string[] {
  const vistos = new Set<string>();
  const resultado: string[] = [];
  for (const bruta of categorias ?? []) {
    const categoria = tituloPtBr(bruta);
    if (!categoria || vistos.has(categoria)) continue;
    vistos.add(categoria);
    resultado.push(categoria);
  }
  return resultado;
}

/**
 * Converte um registro de `torneios.json` no modelo `Campeonato` do site.
 *
 * - `local` = "Arena/endereço, Cidade, UF" (ou "Cidade, UF" sem endereço), o
 *   formato que `cidadeDoLocal` entende para o filtro de Cidade.
 * - `foto` e `descricao` vêm só de eventos manuais; nos coletados ficam vazios
 *   (a origem não fornece nenhum dos dois) e os componentes já omitem/substituem
 *   o que está vazio.
 */
export function torneioParaCampeonato(t: Torneio): Campeonato {
  const cidade = tituloPtBr(t.cidade);
  const local = [t.endereco?.trim(), cidade, t.uf?.trim()]
    .filter((parte): parte is string => Boolean(parte))
    .join(", ");

  return {
    id: t.id,
    nome: t.nome.trim(),
    data: t.data,
    dataFim: t.dataFim && t.dataFim !== t.data ? t.dataFim : undefined,
    local,
    foto: t.foto?.trim() ?? "",
    descricao: t.descricao?.trim() ?? "",
    instagram: t.instagram?.trim() || undefined,
    categorias: normalizarCategorias(t.categorias),
    precoTexto: t.precoTexto?.trim() || undefined,
  };
}

