// src/scripts/organizar/rascunho.ts
//
// Rascunho dos campos que a pessoa está digitando na organização (atletas de uma
// dupla, número de grupos…): sobrevive a um recarregamento ou a um toque errado
// em "voltar", só dentro da aba (`sessionStorage`). É conveniência: qualquer
// falha do armazenamento é ignorada e nada sensível é guardado.
//
// Chave: `pingo:rascunho:<campeonato>:<categoria>:<campo>`.

export interface ArmazenamentoRascunho {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
  removeItem(chave: string): void;
}

export interface Rascunho {
  ler(campo: string): string;
  salvar(campo: string, valor: string): void;
  limpar(campo: string): void;
}

function armazenamentoDaAba(): ArmazenamentoRascunho | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Prefixo das chaves de uma categoria (campeonato + categoria). */
export function prefixoDoRascunho(campeonatoId: string, categoriaId: string): string {
  return `pingo:rascunho:${campeonatoId}:${categoriaId}:`;
}

export function criarRascunho(
  prefixo: string,
  armazenamento: ArmazenamentoRascunho | null = armazenamentoDaAba()
): Rascunho {
  return {
    ler(campo) {
      try {
        return armazenamento?.getItem(prefixo + campo) ?? "";
      } catch {
        return "";
      }
    },
    salvar(campo, valor) {
      try {
        if (valor === "") armazenamento?.removeItem(prefixo + campo);
        else armazenamento?.setItem(prefixo + campo, valor);
      } catch {
        /* sem armazenamento: segue sem rascunho */
      }
    },
    limpar(campo) {
      try {
        armazenamento?.removeItem(prefixo + campo);
      } catch {
        /* idem */
      }
    },
  };
}

/**
 * Liga o rascunho a campos de um formulário: restaura os que estão vazios e
 * guarda a cada digitação. Devolve `limpar()`, para chamar depois de salvar.
 * `campos` = nomes dos inputs (`name`); inexistentes são ignorados.
 */
export function ligarRascunho(
  form: ParentNode,
  campos: readonly string[],
  rascunho: Rascunho
): { limpar: () => void } {
  const inputs: { nome: string; el: HTMLInputElement }[] = [];
  for (const nome of campos) {
    const el = form.querySelector<HTMLInputElement>(`[name="${nome}"]`);
    if (!el) continue;
    inputs.push({ nome, el });
    if (el.value === "") {
      const guardado = rascunho.ler(nome);
      if (guardado !== "") el.value = guardado;
    }
    el.addEventListener("input", () => rascunho.salvar(nome, el.value));
  }
  return {
    limpar: () => {
      for (const { nome } of inputs) rascunho.limpar(nome);
    },
  };
}
