/**
 * Monta uma URL respeitando o `base` configurado em astro.config.mjs.
 *
 * Em produção o site é servido em uma subpasta (ex.: /futevolei/), então
 * caminhos absolutos como "/favicon.svg" precisam virar "/futevolei/favicon.svg".
 * Use esta função para qualquer caminho de asset ou link interno.
 *
 * Ex.: comBase("/campeonatos/foo.svg") -> "/futevolei/campeonatos/foo.svg"
 */
export function comBase(caminho: string): string {
  const base = import.meta.env.BASE_URL; // ex.: "/futevolei/" (sempre com barra final)
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
