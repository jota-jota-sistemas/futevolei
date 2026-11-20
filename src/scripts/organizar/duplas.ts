// src/scripts/organizar/duplas.ts
//
// Seção "Duplas" da organização: adicionar (com aviso de dupla repetida e
// autocomplete de jogador), editar no próprio lugar e remover com "Desfazer".
// Atualiza a lista em memória e a tela sem reler o banco a cada toque.
//
// Dependências injetadas (a página fornece as reais; os testes, as falsas).
// DOM seguro: só textContent. Alvos de toque de 44px (estilo em OrganizarEstilos).
//
// Contrato de DOM (dentro de `secao`):
//   [data-form-dupla] com #dupla-atleta-a/b (name atletaA/atletaB), [data-add-dupla],
//   [data-erro-dupla]; [data-aviso-repetida] com [data-repetida-forcar] e
//   [data-repetida-revisar]; [data-contagem-duplas]; [data-lista-duplas];
//   [data-aviso-chaveamento] (aviso de edição/remoção travadas);
//   [data-alternar-duplas] (abre/recolhe a lista depois do chaveamento gerado).

import type { BracketStore, CategoryRef, VinculosDuplaIds } from "../../store/bracketStore";
import type { Bracket, Pair } from "../../domain/bracket/types";
import { rotuloDupla, gerarNomeDupla } from "../../domain/pairs/nome";
import { validarDuplaCandidata, listarDuplasOrdenadas } from "../../domain/pairs/validation";
import { acharDuplaRepetida } from "../../domain/pairs/repetida";
import { mensagemErro } from "./mensagens";
import { ligarRascunho, type Rascunho } from "./rascunho";
import type { OpcoesToast } from "./toast";
import {
  ligarAutocomplete,
  type OpcoesJogadores,
  type SeletorJogadores,
} from "../seletor-jogador";

/** Estado compartilhado com a página (a página guarda o mesmo objeto). */
export interface EstadoDuplas {
  duplas: Pair[];
  bracket: Bracket | null;
  vinculos: Record<string, VinculosDuplaIds>;
}

export interface DepsDuplas {
  secao: HTMLElement;
  store: BracketStore;
  ref: CategoryRef;
  estado: EstadoDuplas;
  rascunho: Rascunho;
  avisar: (opcoes: OpcoesToast) => void;
  /** Chamado depois que a lista de duplas mudou (para redesenhar formato/nivelador). */
  aoMudar: () => void;
  /** Autocomplete do formulário de adicionar (null = sem jogadores cadastrados). */
  seletor: () => SeletorJogadores | null;
  /** Opções de jogadores para o autocomplete da edição (null = indisponível). */
  opcoesJogadores: () => OpcoesJogadores | null;
  agora?: () => Date;
}

export interface ControleDuplas {
  render(): void;
}

function q<T extends HTMLElement>(raiz: ParentNode, seletor: string): T | null {
  return raiz.querySelector<T>(seletor);
}

/** "1 dupla cadastrada." / "8 duplas cadastradas." */
export function textoContagem(n: number): string {
  if (n === 0) return "Nenhuma dupla cadastrada.";
  return n === 1 ? "1 dupla cadastrada." : `${n} duplas cadastradas.`;
}

export function ligarDuplas(deps: DepsDuplas): ControleDuplas {
  const { secao, store, ref, estado, rascunho, avisar } = deps;
  const agora = deps.agora ?? (() => new Date());
  const form = q<HTMLFormElement>(secao, "[data-form-dupla]");
  const erro = q<HTMLElement>(secao, "[data-erro-dupla]");
  const aviso = q<HTMLElement>(secao, "[data-aviso-repetida]");
  const botaoAdd = q<HTMLButtonElement>(secao, "[data-add-dupla]");
  const lista = q<HTMLElement>(secao, "[data-lista-duplas]");
  const inputA = form ? q<HTMLInputElement>(form, "#dupla-atleta-a") : null;
  const inputB = form ? q<HTMLInputElement>(form, "#dupla-atleta-b") : null;

  let ocupado = false; // anti duplo toque em qualquer gravação desta seção
  let editandoId: string | null = null;

  const mostrarErro = (texto: string): void => {
    if (erro) erro.textContent = texto;
  };
  const esconderAviso = (): void => {
    if (aviso) {
      aviso.hidden = true;
      const msg = q<HTMLElement>(aviso, "[data-repetida-msg]");
      if (msg) msg.textContent = "";
    }
  };
  const travar = (valor: boolean): void => {
    ocupado = valor;
    if (botaoAdd) botaoAdd.disabled = valor;
  };

  const ligadoRascunho = form ? ligarRascunho(form, ["atletaA", "atletaB"], rascunho) : null;

  function aplicarNovas(novas: Pair[], vinculos?: Record<string, VinculosDuplaIds>): void {
    estado.duplas = listarDuplasOrdenadas([...estado.duplas, ...novas]);
    if (vinculos) Object.assign(estado.vinculos, vinculos);
    render();
    deps.aoMudar();
  }

  // ----------------------------------------------------------------------
  // Adicionar
  // ----------------------------------------------------------------------
  async function gravarNova(
    atletaA: string,
    atletaB: string,
    vinc: { jogadorAId: string | null; jogadorBId: string | null }
  ): Promise<void> {
    const dados = {
      nomeDupla: gerarNomeDupla(atletaA, atletaB, agora().toISOString()),
      atletaA,
      atletaB,
      ...vinc,
    };
    const validada = validarDuplaCandidata(
      dados,
      estado.duplas.map((d) => d.nomeDupla)
    );
    if (!validada.ok) {
      mostrarErro(mensagemErro(validada.erro));
      return;
    }
    travar(true);
    try {
      const res = await store.adicionarDupla(ref, dados);
      if (!res.ok) {
        mostrarErro(mensagemErro(res.erro));
        return;
      }
      aplicarNovas([res.valor], { [res.valor.id]: { ...vinc } });
      form?.reset();
      deps.seletor()?.limpar();
      ligadoRascunho?.limpar();
      esconderAviso();
      avisar({ texto: `Dupla ${rotuloDupla(res.valor)} adicionada.` });
      inputA?.focus();
    } finally {
      travar(false);
    }
  }

  async function enviar(forcar: boolean): Promise<void> {
    if (ocupado || !form) return;
    mostrarErro("");
    const atletaA = inputA?.value ?? "";
    const atletaB = inputB?.value ?? "";
    const seletor = deps.seletor();
    if (seletor?.mesmoJogador()) {
      mostrarErro("Escolha jogadores diferentes para os dois atletas.");
      return;
    }
    if (!forcar) {
      const repetida = acharDuplaRepetida(estado.duplas, atletaA, atletaB);
      if (repetida && aviso) {
        const msg = q<HTMLElement>(aviso, "[data-repetida-msg]");
        if (msg) {
          msg.textContent = `${rotuloDupla(repetida)} já está inscrita. Adicionar de novo?`;
        }
        aviso.hidden = false;
        q<HTMLElement>(aviso, "[data-repetida-revisar]")?.focus();
        return;
      }
    }
    esconderAviso();
    await gravarNova(atletaA, atletaB, seletor?.lerVinculos() ?? { jogadorAId: null, jogadorBId: null });
  }

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    void enviar(false);
  });
  q<HTMLElement>(secao, "[data-repetida-forcar]")?.addEventListener("click", () => void enviar(true));
  q<HTMLElement>(secao, "[data-repetida-revisar]")?.addEventListener("click", () => {
    esconderAviso();
    inputA?.focus();
  });
  // Mudou um nome: o aviso de repetida não vale mais.
  for (const input of [inputA, inputB]) input?.addEventListener("input", esconderAviso);

  // ----------------------------------------------------------------------
  // Remover (com Desfazer)
  // ----------------------------------------------------------------------
  async function remover(dupla: Pair): Promise<void> {
    if (ocupado) return;
    mostrarErro("");
    travar(true);
    try {
      const res = await store.removerDupla(dupla.id);
      if (!res.ok) {
        mostrarErro(mensagemErro(res.erro));
        avisar({ texto: mensagemErro(res.erro), tipo: "erro" });
        return;
      }
      const vinc = estado.vinculos[dupla.id] ?? { jogadorAId: null, jogadorBId: null };
      estado.duplas = estado.duplas.filter((d) => d.id !== dupla.id);
      delete estado.vinculos[dupla.id];
      render();
      deps.aoMudar();
      avisar({
        texto: `Dupla ${rotuloDupla(dupla)} removida.`,
        desfazer: {
          aoDesfazer: async () => {
            const nova = await store.adicionarDupla(ref, {
              nomeDupla: gerarNomeDupla(dupla.atletaA, dupla.atletaB, agora().toISOString()),
              atletaA: dupla.atletaA,
              atletaB: dupla.atletaB,
              ...vinc,
            });
            if (!nova.ok) {
              avisar({ texto: mensagemErro(nova.erro), tipo: "erro" });
              return;
            }
            aplicarNovas([nova.valor], { [nova.valor.id]: { ...vinc } });
          },
        },
      });
    } finally {
      travar(false);
    }
  }

  // ----------------------------------------------------------------------
  // Editar no próprio lugar
  // ----------------------------------------------------------------------
  function abrirEdicao(dupla: Pair, li: HTMLElement): void {
    editandoId = dupla.id;
    li.replaceChildren();
    li.classList.add("org__dupla--editando");

    const formEd = document.createElement("form");
    formEd.className = "org__dupla-edicao";
    formEd.noValidate = true;
    const campos: { input: HTMLInputElement; original: string; auto: ReturnType<typeof ligarAutocomplete> | null }[] = [];
    const opcoes = deps.opcoesJogadores();

    (["A", "B"] as const).forEach((lado) => {
      const original = lado === "A" ? dupla.atletaA : dupla.atletaB;
      const rotulo = document.createElement("label");
      rotulo.className = "org__dupla-campo";
      const texto = document.createElement("span");
      texto.textContent = `Atleta ${lado}`;
      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 80;
      input.autocomplete = "off";
      input.value = original;
      rotulo.append(texto, input);
      const info = document.createElement("small");
      info.className = "org__vinculo-info";
      info.setAttribute("aria-live", "polite");
      const auto = opcoes ? ligarAutocomplete(input, opcoes, info) : null;
      formEd.append(rotulo, info);
      campos.push({ input, original, auto });
    });

    const msg = document.createElement("p");
    msg.className = "org__erro";
    msg.setAttribute("role", "alert");

    const acoes = document.createElement("div");
    acoes.className = "org__dupla-acoes";
    const salvar = document.createElement("button");
    salvar.type = "submit";
    salvar.className = "org__botao org__botao--primario";
    salvar.textContent = "Salvar";
    const cancelar = document.createElement("button");
    cancelar.type = "button";
    cancelar.className = "org__botao";
    cancelar.textContent = "Cancelar";
    cancelar.addEventListener("click", () => {
      editandoId = null;
      render();
    });
    acoes.append(salvar, cancelar);
    formEd.append(msg, acoes);

    formEd.addEventListener("submit", (e) => {
      e.preventDefault();
      if (ocupado) return;
      const [ca, cb] = campos;
      const idA = ca.auto?.id() ?? null;
      const idB = cb.auto?.id() ?? null;
      if (idA !== null && idA === idB) {
        msg.textContent = "Escolha jogadores diferentes para os dois atletas.";
        return;
      }
      // Vínculo: texto igual ao original = não mexe; mudou sem vincular = desfaz.
      const vinculo = (c: (typeof campos)[number], id: string | null): string | null | undefined =>
        id !== null ? id : c.input.value.trim() === c.original.trim() ? undefined : null;
      const dados = {
        atletaA: ca.input.value,
        atletaB: cb.input.value,
        jogadorAId: vinculo(ca, idA),
        jogadorBId: vinculo(cb, idB),
      };
      travar(true);
      salvar.disabled = true;
      void store
        .editarDupla(ref, dupla.id, dados)
        .then((res) => {
          if (!res.ok) {
            msg.textContent = mensagemErro(res.erro);
            return;
          }
          const atual = estado.vinculos[dupla.id] ?? { jogadorAId: null, jogadorBId: null };
          estado.vinculos[dupla.id] = {
            jogadorAId: dados.jogadorAId === undefined ? atual.jogadorAId : dados.jogadorAId,
            jogadorBId: dados.jogadorBId === undefined ? atual.jogadorBId : dados.jogadorBId,
          };
          estado.duplas = listarDuplasOrdenadas(
            estado.duplas.map((d) => (d.id === dupla.id ? res.valor : d))
          );
          editandoId = null;
          render();
          deps.aoMudar();
          avisar({ texto: `Dupla ${rotuloDupla(res.valor)} atualizada.` });
        })
        .finally(() => {
          travar(false);
          salvar.disabled = false;
        });
    });

    li.append(formEd);
    campos[0].input.focus();
  }

  // ----------------------------------------------------------------------
  // Desenho da lista
  // ----------------------------------------------------------------------
  // Depois do chaveamento gerado a lista é só consulta: começa recolhida.
  let listaAberta = false;
  const alternar = q<HTMLButtonElement>(secao, "[data-alternar-duplas]");
  alternar?.addEventListener("click", () => {
    listaAberta = !listaAberta;
    render();
  });

  function render(): void {
    const travadas = estado.bracket !== null;
    const contagem = q<HTMLElement>(secao, "[data-contagem-duplas]");
    if (contagem) {
      const vinculadas = estado.duplas.filter((d) => {
        const v = estado.vinculos[d.id];
        return v && (v.jogadorAId || v.jogadorBId);
      }).length;
      contagem.textContent =
        textoContagem(estado.duplas.length) +
        (vinculadas > 0 ? ` ${vinculadas} vinculada${vinculadas === 1 ? "" : "s"} ao cadastro.` : "");
    }
    if (!lista) return;
    lista.replaceChildren();

    const recolhivel = travadas && estado.duplas.length > 0;
    const recolhida = recolhivel && !listaAberta;
    lista.hidden = recolhida;
    lista.classList.toggle("org__duplas--editavel", !travadas);
    if (alternar) {
      alternar.hidden = !recolhivel;
      alternar.setAttribute("aria-expanded", String(!recolhida));
      alternar.textContent = recolhida ? "Ver lista" : "Recolher lista";
    }
    const avisoTravada = q<HTMLElement>(secao, "[data-aviso-chaveamento]");
    if (avisoTravada) avisoTravada.hidden = !travadas || estado.duplas.length === 0;

    if (editandoId !== null && !estado.duplas.some((d) => d.id === editandoId)) editandoId = null;

    for (const dupla of estado.duplas) {
      const li = document.createElement("li");
      li.className = "org__dupla";
      li.dataset.duplaId = dupla.id;

      if (dupla.id === editandoId && !travadas) {
        lista.append(li);
        abrirEdicao(dupla, li);
        continue;
      }

      const info = document.createElement("div");
      info.className = "org__dupla-info";
      const nome = document.createElement("span");
      nome.className = "org__dupla-nome";
      nome.textContent = rotuloDupla(dupla);
      info.append(nome);
      const v = estado.vinculos[dupla.id];
      if (v && (v.jogadorAId || v.jogadorBId)) {
        // Ícone no lugar do texto; o texto fica na dica e no leitor de tela.
        const completa = Boolean(v.jogadorAId && v.jogadorBId);
        const texto = completa ? "Vinculada ao cadastro" : "Parcialmente vinculada ao cadastro";
        const marca = document.createElement("span");
        marca.className = "org__dupla-vinculo" + (completa ? "" : " org__dupla-vinculo--parcial");
        marca.setAttribute("role", "img");
        marca.setAttribute("aria-label", texto);
        marca.title = texto;
        marca.innerHTML =
          '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">' +
          '<circle cx="8" cy="5" r="3" fill="currentColor"/>' +
          '<path d="M2 15c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" fill="currentColor"/></svg>';
        info.append(marca);
      }
      li.append(info);

      if (!travadas) {
        const acoes = document.createElement("div");
        acoes.className = "org__dupla-acoes";
        const editar = document.createElement("button");
        editar.type = "button";
        editar.className = "org__acao-linha";
        editar.textContent = "✎";
        editar.title = "Editar";
        editar.setAttribute("aria-label", `Editar dupla ${rotuloDupla(dupla)}`);
        editar.addEventListener("click", () => {
          editandoId = dupla.id;
          render();
        });
        const rem = document.createElement("button");
        rem.type = "button";
        rem.className = "org__acao-linha org__remover";
        rem.textContent = "✕";
        rem.title = "Remover";
        rem.setAttribute("aria-label", `Remover dupla ${rotuloDupla(dupla)}`);
        rem.addEventListener("click", () => void remover(dupla));
        acoes.append(editar, rem);
        li.append(acoes);
      }
      lista.append(li);
    }
  }

  return { render };
}
