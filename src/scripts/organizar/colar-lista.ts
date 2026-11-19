// src/scripts/organizar/colar-lista.ts
//
// "Colar lista": a pessoa cola a lista de duplas do WhatsApp (uma por linha),
// vê a prévia (✓ vale, ✗ não vale e por quê, ⚠ já inscrita) e confirma. Entram
// todas as válidas de uma vez (uma escrita no banco: ou entram todas, ou nenhuma).
//
// Contrato de DOM (dentro de `secao`):
//   [data-colar-texto] (textarea), [data-colar-previa] (lista), [data-colar-resumo],
//   [data-colar-confirmar] (botão), [data-colar-erro]
// DOM seguro: só textContent.

import type { BracketStore, CategoryRef } from "../../store/bracketStore";
import type { Pair } from "../../domain/bracket/types";
import { gerarNomeDupla } from "../../domain/pairs/nome";
import { listarDuplasOrdenadas } from "../../domain/pairs/validation";
import { interpretarLista, LIMITE_LINHAS, type ResultadoLista } from "../../domain/pairs/lista";
import { mensagemErro } from "./mensagens";
import type { OpcoesToast } from "./toast";

export interface DepsColarLista {
  secao: HTMLElement;
  store: BracketStore;
  ref: CategoryRef;
  estado: { duplas: Pair[] };
  avisar: (opcoes: OpcoesToast) => void;
  aoMudar: () => void;
  /** Redesenha a lista de duplas (a página liga ao render de duplas). */
  renderDuplas: () => void;
  agora?: () => Date;
}

const plural = (n: number, s: string, p: string): string => `${n} ${n === 1 ? s : p}`;

/** Texto do resumo: "8 válidas · 1 inválida · 1 repetida". */
export function textoResumo(r: ResultadoLista): string {
  const { validas, invalidas, repetidas } = r.contagem;
  const partes = [plural(validas, "válida", "válidas")];
  if (invalidas > 0) partes.push(plural(invalidas, "inválida", "inválidas"));
  if (repetidas > 0) partes.push(plural(repetidas, "repetida", "repetidas"));
  if (r.excedeuLimite) partes.push(`só as primeiras ${LIMITE_LINHAS} linhas foram lidas`);
  return partes.join(" · ");
}

export function ligarColarLista(deps: DepsColarLista): void {
  const { secao, store, ref, estado, avisar } = deps;
  const agora = deps.agora ?? (() => new Date());
  const texto = secao.querySelector<HTMLTextAreaElement>("[data-colar-texto]");
  const previa = secao.querySelector<HTMLElement>("[data-colar-previa]");
  const resumo = secao.querySelector<HTMLElement>("[data-colar-resumo]");
  const confirmar = secao.querySelector<HTMLButtonElement>("[data-colar-confirmar]");
  const erro = secao.querySelector<HTMLElement>("[data-colar-erro]");
  if (!texto || !previa || !confirmar) return;

  let atual: ResultadoLista = interpretarLista("");
  let ocupado = false;

  const rotuloBotao = (): string =>
    atual.contagem.validas === 0
      ? "Adicionar duplas"
      : `Adicionar ${plural(atual.contagem.validas, "dupla", "duplas")}`;

  function atualizar(): void {
    atual = interpretarLista(texto!.value, estado.duplas);
    previa!.replaceChildren();
    for (const l of atual.linhas) {
      const li = document.createElement("li");
      li.className = `org__colar-linha org__colar-linha--${l.situacao}`;
      const marca = document.createElement("span");
      marca.className = "org__colar-marca";
      marca.setAttribute("aria-hidden", "true");
      marca.textContent = l.situacao === "valida" ? "✓" : l.situacao === "invalida" ? "✗" : "⚠";
      const corpo = document.createElement("span");
      corpo.className = "org__colar-texto";
      corpo.textContent = l.atletaA && l.atletaB ? `${l.atletaA} & ${l.atletaB}` : l.bruto.trim();
      li.append(marca, corpo);
      if (l.motivo) {
        const motivo = document.createElement("small");
        motivo.className = "org__colar-motivo";
        motivo.textContent = `Linha ${l.linha}: ${l.motivo}`;
        li.append(motivo);
      }
      previa!.append(li);
    }
    if (resumo) resumo.textContent = atual.linhas.length === 0 ? "" : textoResumo(atual);
    confirmar!.textContent = rotuloBotao();
    confirmar!.disabled = ocupado || atual.contagem.validas === 0;
  }

  texto.addEventListener("input", () => {
    if (erro) erro.textContent = "";
    atualizar();
  });

  confirmar.addEventListener("click", () => {
    if (ocupado || atual.contagem.validas === 0) return;
    ocupado = true;
    confirmar.disabled = true;
    if (erro) erro.textContent = "";
    const base = agora().getTime();
    // Cada nome interno precisa ser único: o horário de cada dupla anda 1 ms.
    const lote = atual.validas.map((v, i) => ({
      nomeDupla: gerarNomeDupla(v.atletaA, v.atletaB, new Date(base + i).toISOString()),
      atletaA: v.atletaA,
      atletaB: v.atletaB,
      jogadorAId: null,
      jogadorBId: null,
    }));
    void store
      .adicionarDuplas(ref, lote)
      .then((res) => {
        if (!res.ok) {
          if (erro) erro.textContent = mensagemErro(res.erro);
          return;
        }
        estado.duplas = listarDuplasOrdenadas([...estado.duplas, ...res.valor]);
        texto.value = "";
        deps.renderDuplas();
        deps.aoMudar();
        avisar({ texto: `${plural(res.valor.length, "dupla adicionada", "duplas adicionadas")}.` });
      })
      .finally(() => {
        ocupado = false;
        atualizar();
      });
  });

  atualizar();
}
