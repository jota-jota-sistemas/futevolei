// src/scripts/organizar/nivelador.ts
//
// Nivelador (seeding): lista de duplas da mais forte (topo) para a mais fraca.
// Reordena arrastando pela alça (Pointer Events: funciona com dedo e mouse) ou
// pelos botões ▲ ▼ Topo Fim (nada depende só de arrastar). Salva SOZINHO pouco
// depois da última mudança. "Sortear e fixar" e "Ordem alfabética" refazem a lista
// e salvam na hora.
//
// Contrato de DOM (dentro de `secao`):
//   [data-usar-nivelador] (checkbox), [data-nivelador-conteudo], [data-lista-seeding],
//   [data-sortear], [data-alfabetica], [data-nivelador-estado], [data-erro-seeding]
// DOM seguro: só textContent.

import type { BracketStore, CategoryRef } from "../../store/bracketStore";
import type { Pair } from "../../domain/bracket/types";
import { rotuloDupla } from "../../domain/pairs/nome";
import {
  seedingAleatorio,
  seedingPadrao,
  validarSeeding,
  type SeedAssignment,
} from "../../domain/bracket/seeding";
import { mensagemErro } from "./mensagens";
import type { OpcoesToast } from "./toast";

export interface DepsNivelador {
  secao: HTMLElement;
  store: BracketStore;
  ref: CategoryRef;
  estado: { duplas: Pair[] };
  avisar: (opcoes: OpcoesToast) => void;
  /** Depois de salvar: a página atualiza o seed das duplas em memória. */
  aplicarSeeds: (posicaoPorId: Map<string, number>) => void;
  /** A ordem ou o uso do nivelador mudou (a página atualiza o resumo). */
  aoMudar: () => void;
  atrasoMs?: number;
}

export interface ControleNivelador {
  render(): void;
  /** O organizador marcou "Quero definir o nivelador"? */
  ligado(): boolean;
  /** Ids das duplas na ordem mostrada (null se a lista não está completa). */
  ordemAtual(): string[] | null;
  /** Há seeding completo (1..N sem repetição) salvo? */
  temSeedingSalvo(): boolean;
  atualizarVisibilidade(): void;
}

const q = <T extends HTMLElement>(raiz: ParentNode, s: string): T | null => raiz.querySelector<T>(s);

/** Seeds 1..N completos e sem repetição? */
export function seedingCompleto(duplas: readonly Pair[]): boolean {
  const n = duplas.length;
  return (
    n > 0 &&
    duplas.every((d) => Number.isInteger(d.seed) && d.seed >= 1 && d.seed <= n) &&
    new Set(duplas.map((d) => d.seed)).size === n
  );
}

/** Ordem inicial: seeding salvo (se completo) ou alfabética. */
export function ordemInicial(duplas: readonly Pair[]): Pair[] {
  if (seedingCompleto(duplas)) return [...duplas].sort((a, b) => a.seed - b.seed);
  const padrao = new Map(seedingPadrao([...duplas]).map((s) => [s.pairId, s.posicao]));
  return [...duplas].sort((a, b) => (padrao.get(a.id) ?? 0) - (padrao.get(b.id) ?? 0));
}

export function ligarNivelador(deps: DepsNivelador): ControleNivelador {
  const { secao, store, ref, estado, avisar } = deps;
  const lista = q<HTMLElement>(secao, "[data-lista-seeding]");
  const usar = q<HTMLInputElement>(secao, "[data-usar-nivelador]");
  const conteudo = q<HTMLElement>(secao, "[data-nivelador-conteudo]");
  const erro = q<HTMLElement>(secao, "[data-erro-seeding]");
  const situacao = q<HTMLElement>(secao, "[data-nivelador-estado]");
  const atraso = deps.atrasoMs ?? 500;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let versao = 0;
  let arrastando: HTMLElement | null = null;

  const itens = (): HTMLElement[] =>
    lista ? Array.from(lista.querySelectorAll<HTMLElement>(".org__nivelador-item")) : [];
  const ligado = (): boolean => usar?.checked === true;
  const mostrarSituacao = (t: string): void => {
    if (situacao) situacao.textContent = t;
  };

  function ordemAtual(): string[] | null {
    const its = itens();
    if (its.length === 0 || its.length !== estado.duplas.length) return null;
    return its.map((li) => li.dataset.pairId ?? "");
  }

  function atualizarPosicoes(): void {
    const its = itens();
    its.forEach((li, i) => {
      const pos = li.querySelector<HTMLElement>(".org__nivelador-pos");
      if (pos) pos.textContent = `${i + 1}º`;
      const set = (attr: string, desligar: boolean): void => {
        const b = li.querySelector<HTMLButtonElement>(`[${attr}]`);
        if (b) b.disabled = desligar;
      };
      set("data-sobe", i === 0);
      set("data-topo", i === 0);
      set("data-desce", i === its.length - 1);
      set("data-fim", i === its.length - 1);
    });
  }

  async function salvar(): Promise<void> {
    const ordem = ordemAtual();
    if (!ordem) return;
    if (erro) erro.textContent = "";
    const seeds: SeedAssignment[] = ordem.map((pairId, i) => ({ pairId, posicao: i + 1 }));
    const valido = validarSeeding(seeds, estado.duplas.length);
    if (!valido.ok) {
      if (erro) erro.textContent = mensagemErro(valido.erro);
      return;
    }
    const minha = ++versao;
    mostrarSituacao("Salvando…");
    const res = await store.salvarSeeding(ref, valido.valor);
    if (minha !== versao) return;
    if (!res.ok) {
      const m = mensagemErro(res.erro);
      mostrarSituacao("Não salvo");
      if (erro) erro.textContent = m;
      avisar({ texto: m, tipo: "erro" });
      return;
    }
    mostrarSituacao("Ordem salva");
    deps.aplicarSeeds(new Map(seeds.map((s) => [s.pairId, s.posicao])));
    avisar({ texto: "Nivelador salvo." });
  }

  function agendar(): void {
    clearTimeout(timer);
    mostrarSituacao("Alterações a salvar…");
    deps.aoMudar();
    timer = setTimeout(() => void salvar(), atraso);
  }

  function reordenar(ids: readonly string[]): void {
    if (!lista) return;
    const porId = new Map(itens().map((li) => [li.dataset.pairId ?? "", li]));
    for (const id of ids) {
      const li = porId.get(id);
      if (li) lista.append(li);
    }
    atualizarPosicoes();
  }

  function criarItem(dupla: Pair): HTMLLIElement {
    const li = document.createElement("li");
    li.className = "org__nivelador-item";
    li.dataset.pairId = dupla.id;

    const alca = document.createElement("span");
    alca.className = "org__nivelador-alca";
    alca.setAttribute("aria-hidden", "true");
    alca.textContent = "⠿";

    const pos = document.createElement("span");
    pos.className = "org__nivelador-pos";
    const nome = document.createElement("span");
    nome.className = "org__nivelador-nome";
    nome.textContent = rotuloDupla(dupla);

    const botoes = document.createElement("span");
    botoes.className = "org__nivelador-botoes";

    const mover = (alvo: "sobe" | "desce" | "topo" | "fim", foco: string): void => {
      if (!lista) return;
      if (alvo === "topo") lista.insertBefore(li, lista.firstElementChild);
      else if (alvo === "fim") lista.append(li);
      else if (alvo === "sobe") {
        const ant = li.previousElementSibling;
        if (ant) lista.insertBefore(li, ant);
      } else {
        const prox = li.nextElementSibling;
        if (prox) lista.insertBefore(prox, li);
      }
      atualizarPosicoes();
      // O botão pode ter ficado desabilitado (chegou ao limite): foca um habilitado.
      const b = li.querySelector<HTMLButtonElement>(`[${foco}]`);
      if (b && !b.disabled) b.focus();
      else li.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
      agendar();
    };
    const botao = (rotulo: string, aria: string, attr: string, alvo: "sobe" | "desce" | "topo" | "fim") => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "org__nivelador-seta";
      b.textContent = rotulo;
      b.setAttribute("aria-label", `${aria}: ${rotuloDupla(dupla)}`);
      b.setAttribute(attr, "");
      b.addEventListener("click", () => mover(alvo, attr));
      return b;
    };
    botoes.append(
      botao("▲", "Subir", "data-sobe", "sobe"),
      botao("▼", "Descer", "data-desce", "desce"),
      botao("Topo", "Mover para o topo", "data-topo", "topo"),
      botao("Fim", "Mover para o fim", "data-fim", "fim")
    );

    // Arrastar pela alça: Pointer Events (dedo e mouse). `touch-action: none` na
    // alça (CSS) impede que a página role enquanto arrasta.
    alca.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      arrastando = li;
      li.classList.add("org__nivelador-item--arrastando");
      try {
        alca.setPointerCapture?.(e.pointerId);
      } catch {
        /* sem captura: o arrasto continua pelos eventos da alça */
      }
    });
    alca.addEventListener("pointermove", (e) => {
      if (arrastando !== li || !lista) return;
      const outros = itens().filter((x) => x !== li);
      const alvo = outros.find((x) => {
        const r = x.getBoundingClientRect();
        return e.clientY < r.top + r.height / 2;
      });
      const jaNoLugar = alvo ? li.nextElementSibling === alvo : li === lista.lastElementChild;
      if (jaNoLugar) return;
      if (alvo) lista.insertBefore(li, alvo);
      else lista.append(li);
      atualizarPosicoes();
    });
    const soltar = (): void => {
      if (arrastando !== li) return;
      arrastando = null;
      li.classList.remove("org__nivelador-item--arrastando");
      atualizarPosicoes();
      agendar();
    };
    alca.addEventListener("pointerup", soltar);
    alca.addEventListener("pointercancel", soltar);

    li.append(alca, pos, nome, botoes);
    return li;
  }

  function render(): void {
    if (!lista) return;
    // Preserva a ordem que a pessoa está montando: o que já estava na lista segue
    // na mesma posição; duplas novas entram no fim.
    const anterior = itens().map((li) => li.dataset.pairId ?? "");
    const porId = new Map(estado.duplas.map((d) => [d.id, d]));
    let ordem: Pair[];
    const mantidas = anterior.filter((id) => porId.has(id));
    if (mantidas.length > 0) {
      const set = new Set(mantidas);
      ordem = [
        ...mantidas.map((id) => porId.get(id) as Pair),
        ...ordemInicial(estado.duplas).filter((d) => !set.has(d.id)),
      ];
    } else {
      ordem = ordemInicial(estado.duplas);
    }

    lista.replaceChildren();
    if (estado.duplas.length === 0) {
      const vazio = document.createElement("li");
      vazio.className = "org__seeding-vazio";
      vazio.textContent = "Cadastre duplas para definir o nivelador.";
      lista.append(vazio);
      return;
    }
    for (const d of ordem) lista.append(criarItem(d));
    atualizarPosicoes();
  }

  function atualizarVisibilidade(): void {
    if (conteudo) conteudo.hidden = !ligado();
  }

  usar?.addEventListener("change", () => {
    atualizarVisibilidade();
    deps.aoMudar();
  });

  q<HTMLElement>(secao, "[data-sortear]")?.addEventListener("click", () => {
    if (estado.duplas.length === 0) return;
    const ordenado = seedingAleatorio([...estado.duplas]).sort((a, b) => a.posicao - b.posicao);
    reordenar(ordenado.map((s) => s.pairId));
    clearTimeout(timer);
    deps.aoMudar();
    void salvar();
  });
  q<HTMLElement>(secao, "[data-alfabetica]")?.addEventListener("click", () => {
    if (estado.duplas.length === 0) return;
    const ordenado = seedingPadrao([...estado.duplas]).sort((a, b) => a.posicao - b.posicao);
    reordenar(ordenado.map((s) => s.pairId));
    clearTimeout(timer);
    deps.aoMudar();
    void salvar();
  });

  return {
    render,
    ligado,
    ordemAtual,
    temSeedingSalvo: () => seedingCompleto(estado.duplas),
    atualizarVisibilidade,
  };
}
