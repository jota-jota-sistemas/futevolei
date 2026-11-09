import type { Campeonato } from "../types";

/**
 * Meses abreviados em pt-BR (três letras maiúsculas), indexados por mês-1.
 * Ex.: MESES_CURTOS[0] === "JAN".
 */
export const MESES_CURTOS = [
  "JAN", "FEV", "MAR", "ABR", "MAI", "JUN",
  "JUL", "AGO", "SET", "OUT", "NOV", "DEZ",
] as const;

/**
 * Badge de data: dia + mês abreviado (ex.: "13 NOV"), independente de fuso.
 *
 * Recebe uma string ISO (YYYY-MM-DD) e retorna `{ dia, mes }` onde `dia` tem
 * exatamente dois dígitos e `mes` é a abreviação em três letras maiúsculas
 * (JAN..DEZ). Retorna `null` quando ano, mês ou dia forem falsy (vazio,
 * malformado ou com componentes zero/não numéricos), permitindo que o card
 * omita o badge sem interromper a renderização.
 */
export function badge(iso: string): { dia: string; mes: string } | null {
  const [ano, mes, dia] = iso.split("-").map(Number);
  if (!ano || !mes || !dia) return null;
  return { dia: String(dia).padStart(2, "0"), mes: MESES_CURTOS[mes - 1] };
}

/**
 * Comparador de ordenação de campeonatos por data (ascendente), com desempate
 * por id, produzindo uma ordem determinística. Use com `Array.prototype.sort`.
 *
 * Ex.: [...campeonatos].sort(compararPorDataId)
 */
export function compararPorDataId(a: Campeonato, b: Campeonato): number {
  return a.data.localeCompare(b.data) || a.id.localeCompare(b.id);
}

/**
 * Ordena uma lista de campeonatos por (data, id) de forma determinística,
 * sem mutar a entrada. Retorna uma nova lista não-decrescente pela chave
 * composta (data, id).
 */
export function ordenarPorDataId(campeonatos: Campeonato[]): Campeonato[] {
  return [...campeonatos].sort(compararPorDataId);
}

/**
 * Valores de filtro ativos. String vazia (ou `undefined`) representa um filtro
 * inativo — ou seja, a dimensão é ignorada (comporta-se como identidade),
 * espelhando o valor de um `<select>`/`<input>` vazio.
 */
export interface FiltrosEventos {
  /** valor exato de `local` selecionado; "" = qualquer local */
  local?: string;
  /** cidade normalizada selecionada; "" = qualquer cidade */
  cidade?: string;
  /** data ISO (YYYY-MM-DD) mínima (inclusiva); "" = sem limite inferior */
  data?: string;
  /** data ISO (YYYY-MM-DD) máxima (inclusiva); "" = sem limite superior */
  dataAte?: string;
  /** categoria exata que o evento deve conter; "" = qualquer categoria */
  categoria?: string;
}

/**
 * Predicado puro: o evento satisfaz TODOS os filtros ativos (AND)?
 *
 * - `local`: igualdade exata `c.local === filtros.local` (quando ativo).
 * - `data`: comparação lexicográfica de strings ISO `c.data >= filtros.data`
 *   (quando ativo), que coincide com a ordem cronológica para `YYYY-MM-DD`.
 * - `categoria`: `c.categorias?.includes(filtros.categoria)` (quando ativo);
 *   evento sem `categorias` NÃO corresponde quando a categoria está ativa.
 *
 * Cada filtro vazio (`""`/`undefined`) é tratado como inativo e não restringe
 * o resultado (identidade naquela dimensão).
 */
export function corresponde(c: Campeonato, filtros: FiltrosEventos): boolean {
  if (filtros.local && c.local !== filtros.local) return false;
  if (filtros.cidade && cidadeDoLocal(c.local) !== filtros.cidade) return false;
  if (filtros.data && !(c.data >= filtros.data)) return false;
  if (filtros.dataAte && !(c.data <= filtros.dataAte)) return false;
  if (filtros.categoria && !c.categorias?.includes(filtros.categoria)) return false;
  return true;
}

/**
 * Aplica `corresponde` à lista e retorna o subconjunto que passa em todos os
 * filtros ativos, SEM reordenar (a ordenação é responsabilidade do chamador
 * via `ordenarPorDataId`) e sem mutar a entrada.
 */
export function filtrar(
  campeonatos: Campeonato[],
  filtros: FiltrosEventos
): Campeonato[] {
  return campeonatos.filter((c) => corresponde(c, filtros));
}

/**
 * Lista ordenada e sem duplicatas dos valores de `local` presentes nos dados.
 * Usada para popular as opções do dropdown de Local no build.
 *
 * Considera apenas locais não vazios (strings só com espaços são ignoradas),
 * remove duplicatas e ordena alfabeticamente por `localeCompare` pt-BR, para
 * dropdowns estáveis e determinísticos.
 */
export function opcoesLocais(campeonatos: Campeonato[]): string[] {
  const locais = new Set<string>();
  for (const c of campeonatos) {
    if (c.local && c.local.trim()) locais.add(c.local);
  }
  return [...locais].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/**
 * União deduplicada de todas as `categorias` presentes nos dados, ordenada.
 * Usada para popular as opções do dropdown de Categoria no build.
 *
 * Eventos sem o campo `categorias` não contribuem; categorias vazias (ou só
 * com espaços) são ignoradas. Remove duplicatas e ordena alfabeticamente por
 * `localeCompare` pt-BR, para dropdowns estáveis e determinísticos.
 */
export function opcoesCategorias(campeonatos: Campeonato[]): string[] {
  const categorias = new Set<string>();
  for (const c of campeonatos) {
    for (const cat of c.categorias ?? []) {
      if (cat && cat.trim()) categorias.add(cat);
    }
  }
  return [...categorias].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Siglas de UF brasileiras, usadas para detectar o último campo de `local`. */
const UFS = new Set([
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB",
  "PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
]);

/**
 * Extrai a CIDADE de uma string `local` do tipo "Arena X, Bairro, Cidade, UF"
 * ou "Cidade, UF" ou "Bairro, Cidade". Heurística determinística:
 *  - separa por vírgula e normaliza espaços;
 *  - se o último campo for uma UF (ex.: "SP"), a cidade é o penúltimo;
 *  - caso contrário, a cidade é o último campo.
 * Retorna "" quando `local` é vazio. Pura e sem dependência de fuso.
 */
export function cidadeDoLocal(local: string): string {
  const partes = (local ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p !== "");
  if (partes.length === 0) return "";
  const ultimo = partes[partes.length - 1];
  if (UFS.has(ultimo.toUpperCase()) && partes.length >= 2) {
    return partes[partes.length - 2];
  }
  return ultimo;
}

/**
 * Opções do dropdown de Cidade, derivadas por `cidadeDoLocal`, com a contagem
 * de eventos por cidade. Ordenadas por `localeCompare` pt-BR. Cidades vazias
 * são ignoradas. Ex.: [{ cidade: "São Paulo", total: 8 }, ...].
 */
export function opcoesCidades(
  campeonatos: Campeonato[]
): { cidade: string; total: number }[] {
  const cont = new Map<string, number>();
  for (const c of campeonatos) {
    const cidade = cidadeDoLocal(c.local);
    if (!cidade) continue;
    cont.set(cidade, (cont.get(cidade) ?? 0) + 1);
  }
  return [...cont.entries()]
    .map(([cidade, total]) => ({ cidade, total }))
    .sort((a, b) => a.cidade.localeCompare(b.cidade, "pt-BR"));
}

/**
 * Opções do dropdown de Categoria com a contagem de eventos por categoria.
 * Mesma derivação de `opcoesCategorias`, mas acompanhando o total — para
 * exibir "Open (1)" e sinalizar ao usuário quantos eventos cada opção retorna.
 */
export function contagemCategorias(
  campeonatos: Campeonato[]
): { categoria: string; total: number }[] {
  const cont = new Map<string, number>();
  for (const c of campeonatos) {
    for (const cat of c.categorias ?? []) {
      if (cat && cat.trim()) cont.set(cat, (cont.get(cat) ?? 0) + 1);
    }
  }
  return [...cont.entries()]
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => a.categoria.localeCompare(b.categoria, "pt-BR"));
}

/** Primeiro dia (YYYY-MM-01) de um mês ISO "YYYY-MM". */
function primeiroDia(anoMes: string): string {
  return `${anoMes}-01`;
}

/** Último dia (YYYY-MM-DD) de um mês ISO "YYYY-MM", sem depender de fuso. */
function ultimoDia(anoMes: string): string {
  const [ano, mes] = anoMes.split("-").map(Number);
  // Dia 0 do mês seguinte = último dia do mês atual (via Date em UTC).
  const d = new Date(Date.UTC(ano, mes, 0));
  return `${anoMes}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Converte um identificador de preset de data em um intervalo inclusivo
 * `{ de, ate }` de strings ISO. Suporta:
 *  - "" ⇒ sem intervalo (ambos vazios = filtro de data inativo);
 *  - "YYYY-MM" ⇒ o mês inteiro;
 *  - "este-mes" / "proximo-mes" ⇒ relativos a `hoje` (ISO YYYY-MM-DD).
 * `hoje` é injetável para manter a função pura e testável.
 */
export function intervaloDoPreset(
  preset: string,
  hoje: string
): { de: string; ate: string } {
  if (!preset) return { de: "", ate: "" };

  const mesAtual = hoje.slice(0, 7); // "YYYY-MM"
  if (preset === "este-mes") {
    return { de: primeiroDia(mesAtual), ate: ultimoDia(mesAtual) };
  }
  if (preset === "proximo-mes") {
    const [ano, mes] = mesAtual.split("-").map(Number);
    const prox = new Date(Date.UTC(ano, mes, 1)); // mês seguinte
    const anoMes = `${prox.getUTCFullYear()}-${String(prox.getUTCMonth() + 1).padStart(2, "0")}`;
    return { de: primeiroDia(anoMes), ate: ultimoDia(anoMes) };
  }
  if (/^\d{4}-\d{2}$/.test(preset)) {
    return { de: primeiroDia(preset), ate: ultimoDia(preset) };
  }
  return { de: "", ate: "" };
}

/**
 * Lista de presets de mês disponíveis a partir dos dados: cada mês (YYYY-MM)
 * que tem ao menos um evento, com um rótulo pt-BR ("Novembro 2026") e a
 * contagem. Ordenada cronologicamente. Usada para gerar os chips de período.
 */
export function opcoesPresetsMes(
  campeonatos: Campeonato[]
): { valor: string; rotulo: string; total: number }[] {
  const cont = new Map<string, number>();
  for (const c of campeonatos) {
    const anoMes = (c.data ?? "").slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(anoMes)) {
      cont.set(anoMes, (cont.get(anoMes) ?? 0) + 1);
    }
  }
  const NOMES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return [...cont.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([valor, total]) => {
      const [ano, mes] = valor.split("-").map(Number);
      return { valor, rotulo: `${NOMES[mes - 1]} ${ano}`, total };
    });
}
