// src/scripts/rotas-auth.ts
//
// Rotas de autenticação (entrar e conta). Funções puras, com `base` aplicado.

import { comBase } from "../utils/url";

/** Página de login. `volta` (caminho interno) é para onde ir depois de entrar. */
export function hrefEntrar(volta?: string): string {
  const base = comBase("/entrar");
  return volta ? `${base}?volta=${encodeURIComponent(volta)}` : base;
}

/** Página "Minha conta". */
export function hrefConta(): string {
  return comBase("/conta");
}
