// src/scripts/posse-evento.ts
//
// Verificação de posse de UM evento para a guarda (scripts/guarda.ts): o
// administrador gerencia todos; o organizador só os eventos em que é dono. A
// decisão é do banco (pode_gerenciar_campeonato); a tela só espelha. Sem dono,
// nada é revelado e a escrita seria barrada de qualquer forma pelo RLS.

import type { PapelGerenciar } from "../domain/auth/types";
import { mensagemDoErro } from "../domain/campeonatos/mensagens";
import type { CampeonatoStore } from "../store/campeonatoStore";

/**
 * Devolve a função `verificar` da guarda para o evento `campeonatoId`:
 * `true` (admin, ou organizador dono), `false` (organizador sem posse) ou o
 * texto de erro quando a consulta ao banco falha.
 */
export function verificarPosseDoEvento(
  store: CampeonatoStore,
  campeonatoId: string | null | undefined
): (papel: PapelGerenciar) => Promise<boolean | string> {
  return async (papel) => {
    if (papel === "admin") return true;
    if (!campeonatoId) return false;
    const r = await store.podeGerenciar(campeonatoId);
    if (!r.ok) return mensagemDoErro(r.erro);
    return r.valor;
  };
}
