/**
 * Classificação das categorias de evento em NÍVEL e GÊNERO.
 *
 * As categorias chegam como texto livre ("Feminino Iniciante", "Amador C
 * Masc.", "35+ (Carrega)"), com dezenas de grafias para a mesma coisa. Para o
 * filtro ficar usável, cada texto é reduzido a duas dimensões. O texto
 * original NÃO é alterado: a página de detalhe continua exibindo-o como está.
 *
 * Funções puras, sem dependência de DOM — a mesma regra roda no build, no
 * navegador (script de filtros) e nos testes.
 */

/** Níveis, na ordem em que aparecem no filtro. Cada variante é uma opção própria. */
export const NIVEIS = [
  "Estreante",
  "Principiante",
  "Aprendiz",
  "Iniciante",
  "Iniciante + C",
  "Intermediário",
  "Amador",
  "Bronze",
  "Prata",
  "Ouro",
  "Master",
  "Open",
  "Outros",
] as const;
export type Nivel = (typeof NIVEIS)[number];

/** Gêneros, na ordem em que aparecem no filtro. */
export const GENEROS = ["Masculino", "Feminino", "Misto"] as const;
export type Genero = (typeof GENEROS)[number];

export interface CategoriaClassificada {
  /** nível reconhecido, ou null quando o texto só informa o gênero */
  nivel: Nivel | null;
  /** gênero explícito ou, para categorias com nível, o padrão Masculino */
  genero: Genero | null;
}

/** minúsculas e sem acentos, para casar palavras-chave de forma tolerante. */
function normalizar(texto: string): string {
  return (texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Nível a partir do texto já normalizado. A ORDEM importa: regras mais
 * específicas vêm antes (ex.: "iniciante + c" antes de "iniciante";
 * "iniciante + carrega" é Iniciante, pois "carrega" é só um modificador).
 * "Outros" só vale quando nenhum nível foi reconhecido.
 */
function nivelDe(s: string): Nivel | null {
  if (/master|\b\d{2}\+|somatoria/.test(s)) return "Master"; // 35+, 40+, 80+
  if (/estreante/.test(s)) return "Estreante";
  if (/principiante/.test(s)) return "Principiante";
  if (/aprendiz/.test(s)) return "Aprendiz";
  if (/iniciante\s*\+\s*c\b/.test(s)) return "Iniciante + C";
  if (/iniciante/.test(s)) return "Iniciante";
  if (/intermedi/.test(s)) return "Intermediário";
  if (/bronze/.test(s)) return "Bronze";
  if (/prata/.test(s)) return "Prata";
  if (/ouro/.test(s)) return "Ouro";
  // Amador, letras de nível soltas (A, B, C, A+B, B+C) e "até C".
  if (/amador|\b[abc]\b|ate c\b/.test(s)) return "Amador";
  if (/\bopen\b|livre|profissional/.test(s)) return "Open";
  if (
    /kids|cavalo|carrega|professor|convidado|pais e filhos|volei de praia|futebol de areia|sem shark/.test(
      s
    )
  ) {
    return "Outros";
  }
  return null;
}

/** Gênero escrito no texto já normalizado, ou null. */
function generoExplicito(s: string): Genero | null {
  if (/mist/.test(s)) return "Misto";
  if (/fem/.test(s)) return "Feminino";
  if (/masc/.test(s)) return "Masculino";
  return null;
}

/**
 * Classifica o texto de UMA categoria.
 *
 * Gênero: o explícito, quando existir. Sem gênero escrito, categorias com
 * nível reconhecido são Masculino por padrão ("Iniciante", "Amador C"). O
 * grupo "Outros" (Kids, Pais e Filhos, Convidados…) NÃO recebe o padrão, e
 * texto sem nível nem gênero fica sem nenhum dos dois.
 */
export function classificarCategoria(nome: string): CategoriaClassificada {
  const s = normalizar(nome);
  const nivel = nivelDe(s);
  const explicito = generoExplicito(s);
  const genero = explicito ?? (nivel && nivel !== "Outros" ? "Masculino" : null);
  return { nivel, genero };
}

/** Valores vazios ("" ou undefined) são filtros inativos. */
export interface FiltroNivelGenero {
  nivel?: string;
  genero?: string;
}

/**
 * Uma categoria satisfaz os filtros ativos? Nível e gênero são avaliados na
 * MESMA categoria. Assim "Feminino" + "Iniciante" só casa com uma categoria
 * "Feminino Iniciante", e não com um evento que tenha "Feminino Master" e
 * "Masculino Iniciante" em categorias diferentes.
 */
export function categoriaCombina(nome: string, filtro: FiltroNivelGenero): boolean {
  const { nivel, genero } = classificarCategoria(nome);
  if (filtro.nivel && nivel !== filtro.nivel) return false;
  if (filtro.genero && genero !== filtro.genero) return false;
  return true;
}
