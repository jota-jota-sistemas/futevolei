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
