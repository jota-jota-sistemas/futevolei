/**
 * Cache HTTP das páginas sob demanda (SSR). O CDN da Vercel guarda a resposta
 * por 60 s e, depois disso, serve a versão antiga enquanto busca uma nova em
 * segundo plano (até 5 min). Mudar um evento no banco aparece em ~1 minuto, e
 * o banco não é consultado a cada visita.
 */
export const CACHE_PAGINAS = "public, s-maxage=60, stale-while-revalidate=300";
