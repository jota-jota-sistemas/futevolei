/**
 * Monta uma URL respeitando o `base` do Astro (import.meta.env.BASE_URL).
 *
 * Na Vercel o site é servido na raiz, então BASE_URL = "/" e esta função
 * apenas normaliza o caminho (praticamente um no-op). É mantida para continuar
 * funcionando caso um `base` volte a ser configurado no futuro e para não
 * precisar alterar os componentes que já a utilizam.
 *
 * Ex. (base "/"):   comBase("/campeonatos/foo.svg") -> "/campeonatos/foo.svg"
 * Ex. (base "/x/"): comBase("/campeonatos/foo.svg") -> "/x/campeonatos/foo.svg"
 */
export function comBase(caminho: string): string {
  const base = import.meta.env.BASE_URL || "/"; // "/" quando não há base configurado
  const limpo = caminho.replace(/^\//, ""); // remove a barra inicial do caminho
  return base.endsWith("/") ? base + limpo : base + "/" + limpo;
}

/**
 * Normaliza o valor de `instagram` de um campeonato para uma URL completa.
 * Aceita "@usuario", "usuario" ou uma URL completa (http/https).
 * Retorna null se o valor for vazio/ausente.
 *
 * Ex.: instagramUrl("@msscup_")                     -> "https://instagram.com/msscup_"
 *      instagramUrl("copa_cabeca")                  -> "https://instagram.com/copa_cabeca"
 *      instagramUrl("https://instagram.com/x/")     -> "https://instagram.com/x/"
 */
export function instagramUrl(valor?: string): string | null {
  if (!valor) return null;
  const v = valor.trim();
  if (v === "") return null;
  if (/^https?:\/\//i.test(v)) return v; // já é URL completa
  const usuario = v.replace(/^@/, ""); // remove o @ se houver
  return `https://instagram.com/${usuario}`;
}

/**
 * Normaliza o valor de `inscricao` de um campeonato para uma URL de inscrição.
 * Aceita apenas URLs completas http/https; qualquer outro valor (vazio, só
 * espaços, ou sem o esquema http/https) retorna null — mantendo o botão
 * "Inscreva-se" oculto. Pura e sem efeitos colaterais.
 *
 * Ex.: inscricaoUrl("https://movisport.pro/")  -> "https://movisport.pro/"
 *      inscricaoUrl("  http://x.com/a ")        -> "http://x.com/a"
 *      inscricaoUrl("movisport.pro")            -> null
 *      inscricaoUrl("")                          -> null
 */
export function inscricaoUrl(valor?: string): string | null {
  if (!valor) return null;
  const v = valor.trim();
  if (v === "") return null;
  return /^https?:\/\//i.test(v) ? v : null;
}

/**
 * Formata uma data ISO (YYYY-MM-DD) para pt-BR por extenso, sem depender
 * do fuso do servidor. Ex.: "2026-12-15" -> "15 de dezembro de 2026".
 */
export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  if (!ano || !mes || !dia) return iso;
  const data = new Date(ano, mes - 1, dia);
  return data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/**
 * Formata o período de um evento (início e, opcionalmente, fim) em pt-BR, sem
 * depender do fuso. Sem fim, ou fim igual ao início, cai em `formatarData`.
 *
 * Ex.: formatarPeriodo("2026-11-13")                 -> "13 de novembro de 2026"
 *      formatarPeriodo("2026-11-13", "2026-11-15")   -> "13 a 15 de novembro de 2026"
 *      formatarPeriodo("2026-11-30", "2026-12-02")   -> "30 de novembro a 02 de dezembro de 2026"
 *      formatarPeriodo("2026-12-30", "2027-01-02")   -> "30 de dezembro de 2026 a 02 de janeiro de 2027"
 */
export function formatarPeriodo(inicio: string, fim?: string): string {
  if (!fim || fim === inicio) return formatarData(inicio);

  const [a1, m1, d1] = inicio.split("-").map(Number);
  const [a2, m2, d2] = fim.split("-").map(Number);
  if (!a1 || !m1 || !d1 || !a2 || !m2 || !d2) return formatarData(inicio);

  const dd = (n: number) => String(n).padStart(2, "0");
  const mes = (a: number, m: number) =>
    new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: "long" });

  if (a1 === a2 && m1 === m2) {
    return `${dd(d1)} a ${dd(d2)} de ${mes(a1, m1)} de ${a1}`;
  }
  if (a1 === a2) {
    return `${dd(d1)} de ${mes(a1, m1)} a ${dd(d2)} de ${mes(a2, m2)} de ${a1}`;
  }
  return `${formatarData(inicio)} a ${formatarData(fim)}`;
}

/**
 * Converte o NOME de uma categoria em um slug estável para uso em URLs da área
 * de organização (`/campeonatos/[id]/organizar/[categoria]`).
 *
 * Convenção (fonte de verdade para a rota [categoria] — tarefa 18.2 deve seguir
 * exatamente esta função): minúsculas, acentos removidos, qualquer sequência de
 * caracteres não alfanuméricos vira um único hífen, sem hífens nas extremidades.
 *
 * Ex.: slugCategoria("Amador B+C")            -> "amador-b-c"
 *      slugCategoria("Feminino Intermediário") -> "feminino-intermediario"
 *      slugCategoria("Open")                    -> "open"
 *
 * Observação: o slug é derivado do nome porque, no estático, as categorias vêm
 * do JSON (src/data/campeonatos.json). No runtime a organização lê/grava as
 * categorias e o chaveamento via Bracket_Store/Supabase (fonte de verdade),
 * mas as rotas estáticas e a lista continuam derivadas do nome por este slug.
 */
export function slugCategoria(nome: string): string {
  return nome
    .normalize("NFD") // separa os acentos das letras
    .replace(/[\u0300-\u036f]/g, "") // remove os acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // não alfanumérico -> hífen
    .replace(/^-+|-+$/g, ""); // tira hífens das extremidades
}

/**
 * Link para o perfil de um jogador. O site é estático e os jogadores são
 * criados em runtime, então não há uma página pré-renderada por jogador: o id
 * vai na query string de uma única página (/jogadores/perfil).
 *
 * Ex. (base "/"): hrefPerfilJogador("abc") -> "/jogadores/perfil?id=abc"
 */
export function hrefPerfilJogador(id: string): string {
  return `${comBase("/jogadores/perfil")}?id=${encodeURIComponent(id)}`;
}
