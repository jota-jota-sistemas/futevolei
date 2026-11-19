// src/scripts/categorias-editor.ts
//
// Editor de categorias na edição do campeonato: lista (com contagem de duplas e
// remoção), criação em lote por Gênero × Nível, categoria avulsa e copiar de
// outro evento. Recebe a store por injeção (testável sem Supabase).
//
// Contrato de DOM (data-*), dentro de `raiz` (ver components/CategoriasEditor.astro):
//   [data-categorias-editor] · [data-cat-estado] · [data-cat-lista]
//   [data-cat-genero] / [data-cat-nivel] (checkboxes) · [data-cat-gerar] · [data-cat-dica]
//   [data-cat-form-custom] (input name="nome") · [data-cat-status]
//   [data-cat-copiar-bloco] [data-cat-copiar-select] [data-cat-copiar]

import type { CategoriaItem, ResultadoCategoria } from "../domain/categorias/types";
import { mensagemDoErro } from "../domain/categorias/mensagens";
import { gerarNomesPorGeneroNivel, mesclarCategorias } from "../domain/categorias/validation";
import type { CategoriaStore, ResultadoCriacao } from "../store/categoriaStore";

/** Outro evento do qual copiar categorias. */
export interface EventoParaCopiar {
  id: string;
  nome: string;
}

export interface DepsCategoriasEditor {
  store: CategoriaStore;
  campeonatoId: string;
  raiz?: ParentNode;
  /** Eventos que a pessoa gerencia (para "copiar de outro evento"). Sem isso o bloco fica oculto. */
  listarEventos?: () => Promise<EventoParaCopiar[]>;
  /** Avisa depois de criar, copiar ou remover, com a quantidade atual de categorias. */
  aoMudar?: (quantidade: number) => void;
}

function plural(n: number, singular: string, pluralTxt: string): string {
  return `${n} ${n === 1 ? singular : pluralTxt}`;
}

export async function iniciarCategoriasEditor({
  store,
  campeonatoId,
  raiz = document,
  listarEventos,
  aoMudar,
}: DepsCategoriasEditor): Promise<void> {
  const q = <T extends Element>(seletor: string) => raiz.querySelector<T>(seletor);
  const estado = q<HTMLElement>("[data-cat-estado]");
  const lista = q<HTMLElement>("[data-cat-lista]");
  const botaoGerar = q<HTMLButtonElement>("[data-cat-gerar]");
  const dica = q<HTMLElement>("[data-cat-dica]");
  const formCustom = q<HTMLFormElement>("[data-cat-form-custom]");
  const status = q<HTMLElement>("[data-cat-status]");
  const blocoCopiar = q<HTMLElement>("[data-cat-copiar-bloco]");
  const selectCopiar = q<HTMLSelectElement>("[data-cat-copiar-select]");
  const botaoCopiar = q<HTMLButtonElement>("[data-cat-copiar]");
  if (!estado || !lista) return;

  let itens: CategoriaItem[] = [];

  function dizer(texto: string, tipo: "ok" | "erro" = "ok"): void {
    if (!status) return;
    status.textContent = texto;
    status.dataset.tipo = tipo;
    status.hidden = texto === "";
  }

  const marcados = (seletor: string): string[] =>
    Array.from(raiz.querySelectorAll<HTMLInputElement>(seletor))
      .filter((i) => i.checked)
      .map((i) => i.value);

  /** Nomes que a seleção atual de chips gera. */
  const nomesSelecionados = (): string[] =>
    gerarNomesPorGeneroNivel(marcados("[data-cat-genero]"), marcados("[data-cat-nivel]"));

  function atualizarBotaoGerar(): void {
    if (!botaoGerar) return;
    const nomes = nomesSelecionados();
    const novos = mesclarCategorias(
      itens.map((i) => i.nome),
      nomes
    ).adicionar.length;
    if (nomes.length === 0) {
      botaoGerar.textContent = "Marque gênero e nível";
      botaoGerar.disabled = true;
    } else if (novos === 0) {
      botaoGerar.textContent = "Todas já existem";
      botaoGerar.disabled = true;
    } else {
      botaoGerar.textContent = `Adicionar ${plural(novos, "categoria", "categorias")}`;
      botaoGerar.disabled = false;
    }
    if (dica) {
      const jaExistem = nomes.length - novos;
      dica.textContent = jaExistem > 0 && novos > 0 ? `${plural(jaExistem, "já existe", "já existem")} e será ignorada.` : "";
      dica.hidden = dica.textContent === "";
    }
  }

  function itemDe(c: CategoriaItem): HTMLLIElement {
    const li = document.createElement("li");
    li.className = "cat-item";
    const nome = document.createElement("span");
    nome.className = "cat-item__nome";
    nome.textContent = c.nome;
    const duplas = document.createElement("span");
    duplas.className = "cat-item__duplas";
    duplas.textContent = c.duplas === 0 ? "sem duplas" : plural(c.duplas, "dupla", "duplas");
    const remover = document.createElement("button");
    remover.type = "button";
    remover.className = "cat-item__remover";
    remover.textContent = "Remover";
    if (c.duplas > 0) {
      // Com duplas a remoção levaria as inscrições junto: explica em vez de esconder.
      remover.disabled = true;
      remover.title = "Remova as duplas desta categoria antes";
      remover.setAttribute("aria-label", `Remover ${c.nome}: indisponível, tem duplas inscritas`);
    } else {
      remover.setAttribute("aria-label", `Remover categoria ${c.nome}`);
      remover.addEventListener("click", () => void remover_(c, remover));
    }
    li.append(nome, duplas, remover);
    return li;
  }

  function render(): void {
    lista!.textContent = "";
    for (const c of itens) lista!.append(itemDe(c));
    if (itens.length === 0) {
      estado!.textContent = "Nenhuma categoria ainda. Marque gênero e nível abaixo e crie de uma vez.";
      estado!.hidden = false;
    } else {
      estado!.hidden = true;
    }
    atualizarBotaoGerar();
    aoMudar?.(itens.length);
  }

  function aplicarCriacao(r: ResultadoCriacao): void {
    itens = [...itens, ...r.criadas].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  function resumoCriacao(r: ResultadoCriacao, singular: string, pluralTxt: string): string {
    const partes = [plural(r.criadas.length, singular, pluralTxt)];
    if (r.repetidas.length > 0) partes.push(plural(r.repetidas.length, "já existia", "já existiam"));
    if (r.invalidas.length > 0) partes.push(plural(r.invalidas.length, "nome inválido", "nomes inválidos"));
    return `${partes.join(". ")}.`;
  }

  async function carregar(): Promise<void> {
    estado!.textContent = "Carregando categorias…";
    estado!.hidden = false;
    const r = await store.listar(campeonatoId);
    if (!r.ok) {
      lista!.textContent = "";
      estado!.textContent = mensagemDoErro(r.erro);
      return;
    }
    itens = r.valor;
    render();
  }

  async function criar(nomes: string[], aposSucesso?: () => void): Promise<void> {
    dizer("");
    const r: ResultadoCategoria<ResultadoCriacao> = await store.criarVarias(campeonatoId, nomes);
    if (!r.ok) {
      dizer(mensagemDoErro(r.erro), "erro");
      return;
    }
    if (r.valor.criadas.length === 0) {
      dizer(
        r.valor.invalidas.length > 0 ? mensagemDoErro({ code: "NOME_INVALIDO" }) : "Essa categoria já existe.",
        "erro"
      );
      return;
    }
    aplicarCriacao(r.valor);
    aposSucesso?.();
    render();
    dizer(resumoCriacao(r.valor, "categoria criada", "categorias criadas"));
  }

  async function remover_(c: CategoriaItem, botao: HTMLButtonElement): Promise<void> {
    dizer("");
    botao.disabled = true;
    const r = await store.remover(c.id);
    if (!r.ok) {
      botao.disabled = false;
      dizer(mensagemDoErro(r.erro), "erro");
      // Pode ter ganhado duplas por outra aba: atualiza a contagem.
      if (r.erro.code === "TEM_DUPLAS") await carregar();
      return;
    }
    itens = itens.filter((i) => i.id !== c.id);
    render();
    dizer(`Categoria ${c.nome} removida.`);
  }

  // ---- Chips Gênero × Nível ------------------------------------------------
  for (const chip of Array.from(raiz.querySelectorAll<HTMLInputElement>("[data-cat-genero], [data-cat-nivel]"))) {
    chip.addEventListener("change", () => atualizarBotaoGerar());
  }
  botaoGerar?.addEventListener("click", () => {
    const nomes = nomesSelecionados();
    if (nomes.length === 0) return;
    botaoGerar.disabled = true;
    void criar(nomes, () => {
      for (const chip of Array.from(raiz.querySelectorAll<HTMLInputElement>("[data-cat-genero], [data-cat-nivel]"))) {
        chip.checked = false;
      }
    });
  });

  // ---- Categoria avulsa -----------------------------------------------------
  formCustom?.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const campo = formCustom.querySelector<HTMLInputElement>('[name="nome"]');
    if (!campo) return;
    const nome = campo.value;
    void criar([nome], () => {
      campo.value = "";
    });
  });

  // ---- Copiar de outro evento ------------------------------------------------
  if (listarEventos && blocoCopiar && selectCopiar && botaoCopiar) {
    void (async () => {
      let eventos: EventoParaCopiar[] = [];
      try {
        eventos = (await listarEventos()).filter((e) => e.id !== campeonatoId);
      } catch {
        eventos = [];
      }
      if (eventos.length === 0) return;
      for (const e of eventos) {
        const opcao = document.createElement("option");
        opcao.value = e.id;
        opcao.textContent = e.nome;
        selectCopiar.append(opcao);
      }
      blocoCopiar.hidden = false;
    })();

    selectCopiar.addEventListener("change", () => {
      botaoCopiar.disabled = selectCopiar.value === "";
    });
    botaoCopiar.addEventListener("click", async () => {
      const origem = selectCopiar.value;
      if (origem === "") return;
      dizer("");
      botaoCopiar.disabled = true;
      const r = await store.copiarDe(origem, campeonatoId);
      botaoCopiar.disabled = selectCopiar.value === "";
      if (!r.ok) {
        dizer(mensagemDoErro(r.erro), "erro");
        return;
      }
      if (r.valor.criadas.length === 0) {
        dizer("Nenhuma categoria nova para copiar: este evento já tem todas.", "erro");
        return;
      }
      aplicarCriacao(r.valor);
      render();
      dizer(resumoCriacao(r.valor, "categoria copiada", "categorias copiadas"));
    });
  }

  await carregar();
}
