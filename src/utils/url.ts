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
