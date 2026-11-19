// src/scripts/organizar/toast.ts
//
// Avisos curtos ("toasts") no pé da tela: confirmam o que acabou de acontecer
// mesmo com a página longa (no celular a antiga faixa de status ficava fora da
// tela). Somem sozinhos; o aviso de erro fica mais tempo e pode trazer "Desfazer".
//
// DOM seguro (só textContent). O contêiner `[data-toasts]` vem do componente
// `Toasts.astro`; sem ele, é criado aqui. Acessível: aviso comum em
// `role="status"`, erro em `role="alert"`; botões de 44px (estilo no componente).

export type TipoToast = "ok" | "erro";

export interface OpcoesToast {
  texto: string;
  tipo?: TipoToast;
  /** Ação "Desfazer": roda uma vez e fecha o aviso. */
  desfazer?: { rotulo?: string; aoDesfazer: () => void | Promise<void> };
  /** Quanto tempo fica na tela (ms). Padrão: 4 s; 8 s para erro ou com "Desfazer". */
  duracaoMs?: number;
}

export interface Toast {
  fechar(): void;
}

export interface ContextoToast {
  /** Documento onde o contêiner vive (padrão: `document`). */
  documento?: Document;
}

/** Quantos avisos aparecem ao mesmo tempo; o mais antigo sai quando passa disso. */
export const MAX_TOASTS = 3;
export const DURACAO_PADRAO_MS = 4000;
export const DURACAO_LONGA_MS = 8000;

function contêiner(doc: Document): HTMLElement {
  let c = doc.querySelector<HTMLElement>("[data-toasts]");
  if (!c) {
    c = doc.createElement("div");
    c.className = "toasts";
    c.dataset.toasts = "";
    c.setAttribute("aria-label", "Avisos");
    doc.body.append(c);
  }
  return c;
}

export function mostrarToast(opcoes: OpcoesToast, contexto: ContextoToast = {}): Toast {
  const doc = contexto.documento ?? document;
  const area = contêiner(doc);
  const tipo = opcoes.tipo ?? "ok";

  // Limite de avisos: tira o(s) mais antigo(s).
  while (area.children.length >= MAX_TOASTS) area.firstElementChild?.remove();

  const item = doc.createElement("div");
  item.className = `toast toast--${tipo}`;
  item.setAttribute("role", tipo === "erro" ? "alert" : "status");

  const texto = doc.createElement("span");
  texto.className = "toast__texto";
  texto.textContent = opcoes.texto;
  item.append(texto);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let fechado = false;
  const fechar = (): void => {
    if (fechado) return;
    fechado = true;
    if (timer !== undefined) clearTimeout(timer);
    item.remove();
  };

  if (opcoes.desfazer) {
    const { rotulo = "Desfazer", aoDesfazer } = opcoes.desfazer;
    const botao = doc.createElement("button");
    botao.type = "button";
    botao.className = "toast__acao";
    botao.textContent = rotulo;
    botao.addEventListener("click", () => {
      botao.disabled = true;
      void Promise.resolve()
        .then(aoDesfazer)
        .catch(() => undefined)
        .finally(fechar);
    });
    item.append(botao);
  }

  const x = doc.createElement("button");
  x.type = "button";
  x.className = "toast__fechar";
  x.textContent = "×";
  x.setAttribute("aria-label", "Fechar aviso");
  x.addEventListener("click", fechar);
  item.append(x);

  area.append(item);

  const duracao =
    opcoes.duracaoMs ?? (tipo === "erro" || opcoes.desfazer ? DURACAO_LONGA_MS : DURACAO_PADRAO_MS);
  if (duracao > 0) timer = setTimeout(fechar, duracao);

  return { fechar };
}
