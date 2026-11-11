// src/scripts/eventos-detalhe.ts
//
// Lê, do HTML da página, os ids de evento que têm página de detalhe (embutidos
// em `data-eventos-detalhe` no build). Só esses viram link no histórico de
// duplas do perfil. Tolera atributo ausente ou inválido (devolve conjunto vazio).

export function lerEventosComDetalhe(doc: ParentNode = document): Set<string> {
  const raiz = doc.querySelector<HTMLElement>("[data-eventos-detalhe]");
  try {
    const ids = JSON.parse(raiz?.dataset.eventosDetalhe ?? "[]");
    return new Set(Array.isArray(ids) ? ids.filter((i): i is string => typeof i === "string") : []);
  } catch {
    return new Set();
  }
}
