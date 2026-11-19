// src/scripts/ultimo-local.ts
//
// Lembra a cidade e a UF do último campeonato criado neste navegador, para o
// próximo cadastro já vir preenchido (quem organiza vários eventos na mesma
// cidade não redigita). Só preferência de conveniência: `localStorage`, nunca
// dados sensíveis, e qualquer falha (armazenamento bloqueado, valor corrompido)
// é ignorada em silêncio.

import { UFS_BRASIL } from "../domain/jogadores/validation";

export const CHAVE_ULTIMO_LOCAL = "pingo:ultimo-local";

export interface UltimoLocal {
  cidade: string;
  uf: string;
}

/** O pedaço de `Storage` que usamos (injetável em testes). */
export interface ArmazenamentoSimples {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
}

function armazenamentoDoNavegador(): ArmazenamentoSimples | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Valor lido e conferido, ou null (ausente, corrompido ou fora das regras). */
export function lerUltimoLocal(
  armazenamento: ArmazenamentoSimples | null = armazenamentoDoNavegador()
): UltimoLocal | null {
  if (!armazenamento) return null;
  try {
    const bruto = armazenamento.getItem(CHAVE_ULTIMO_LOCAL);
    if (!bruto) return null;
    const dado = JSON.parse(bruto) as { cidade?: unknown; uf?: unknown } | null;
    const cidade = typeof dado?.cidade === "string" ? dado.cidade.trim() : "";
    const uf = typeof dado?.uf === "string" ? dado.uf.trim().toUpperCase() : "";
    if (cidade.length > 80) return null;
    if (uf !== "" && !(UFS_BRASIL as readonly string[]).includes(uf)) return null;
    if (cidade === "" && uf === "") return null;
    return { cidade, uf };
  } catch {
    return null;
  }
}

/** Guarda cidade/UF do evento recém-criado. Sem cidade nem UF, não grava nada. */
export function gravarUltimoLocal(
  local: { cidade: string | null; uf: string | null },
  armazenamento: ArmazenamentoSimples | null = armazenamentoDoNavegador()
): void {
  const cidade = (local.cidade ?? "").trim();
  const uf = (local.uf ?? "").trim().toUpperCase();
  if (!armazenamento || (cidade === "" && uf === "")) return;
  try {
    armazenamento.setItem(CHAVE_ULTIMO_LOCAL, JSON.stringify({ cidade, uf }));
  } catch {
    /* sem armazenamento: o cadastro funciona do mesmo jeito */
  }
}
