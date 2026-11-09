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
