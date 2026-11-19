// src/scripts/seletor-jogador.ts
//
// Autocomplete OPCIONAL de "jogador cadastrado" nos campos de atleta da
// organização. A pessoa digita (ou escolhe na lista do navegador) e, quando o
// texto bate EXATAMENTE com uma opção, a inscrição fica vinculada ao perfil do
// jogador (`jogador_a_id`/`jogador_b_id`), o que alimenta o histórico de duplas.
// Sem escolher nada, o campo funciona como sempre: só com texto.
//
// Contrato de DOM, dentro do <form data-form-dupla>:
//   #dupla-atleta-a / #dupla-atleta-b   os campos de texto dos atletas
//   [data-jogadores-lista]              o <datalist> compartilhado (opcional: é criado)
//   [data-vinculo-info]                 texto "Vinculado ao cadastro" de cada campo (opcional)
//
// Homônimos recebem um desambiguador na opção ("Ana Lima · Santos/SP"); ao
// vincular, o texto do campo vira o nome do cadastro. Editar o texto depois
// desfaz o vínculo (nunca liga um perfil a um nome diferente do que está no campo).

import type { Jogador } from "../domain/jogadores/types";
import { ordenarJogadores } from "../domain/jogadores/validation";

export interface VinculosDupla {
  jogadorAId: string | null;
  jogadorBId: string | null;
}

export interface SeletorJogadores {
  /** Ids vinculados (null = não vinculado). */
  lerVinculos(): VinculosDupla;
  /** A e B apontam para o MESMO jogador (a dupla não pode ter a mesma pessoa duas vezes). */
  mesmoJogador(): boolean;
  /** Desfaz os vínculos (depois de salvar a dupla e limpar o formulário). */
  limpar(): void;
  /** Há jogadores cadastrados para escolher? */
  disponivel: boolean;
  /** Opções do datalist (reutilizadas pelo autocomplete da edição de dupla). */
  opcoes: OpcoesJogadores;
}

/** Rótulo para distinguir homônimos ("Nome “Apelido” · Cidade/UF"). */
export function rotuloDoJogador(j: Pick<Jogador, "nome" | "apelido" | "cidade" | "uf">): string {
  const local = [j.cidade, j.uf].filter(Boolean).join("/");
  return [j.nome, j.apelido ? `“${j.apelido}”` : "", local ? `· ${local}` : ""]
    .filter(Boolean)
    .join(" ");
}

export interface OpcoesJogadores {
  datalist: HTMLDataListElement;
  /** Texto da opção → jogador. */
  porValor: Map<string, Jogador>;
}

/** Preenche o <datalist> com os jogadores (ordem alfabética sem acento). */
export function prepararOpcoes(
  datalist: HTMLDataListElement,
  jogadores: readonly Jogador[]
): OpcoesJogadores {
  const ordenados = ordenarJogadores(jogadores);
  const contagem = new Map<string, number>();
  for (const j of ordenados) contagem.set(j.nome, (contagem.get(j.nome) ?? 0) + 1);

  const porValor = new Map<string, Jogador>();
  datalist.replaceChildren();
  for (const j of ordenados) {
    // Nome único: o valor é o próprio nome. Homônimos: rótulo completo (e, no
    // pior caso, um sufixo para que o valor nunca se repita).
    let valor = (contagem.get(j.nome) ?? 0) > 1 ? rotuloDoJogador(j) : j.nome;
    for (let n = 2; porValor.has(valor); n++) valor = `${rotuloDoJogador(j)} #${n}`;
    porValor.set(valor, j);
    const opcao = datalist.ownerDocument.createElement("option");
    opcao.value = valor;
    datalist.append(opcao);
  }
  return { datalist, porValor };
}

export interface AutocompleteJogador {
  /** Id do jogador vinculado a este campo, ou null. */
  id(): string | null;
  /** Desfaz o vínculo. */
  limpar(): void;
}

/** Liga o autocomplete a UM campo de texto. */
export function ligarAutocomplete(
  input: HTMLInputElement,
  opcoes: OpcoesJogadores,
  info?: HTMLElement | null
): AutocompleteJogador {
  let vinculado: Jogador | null = null;

  const atualizarInfo = (): void => {
    input.classList.toggle("org__input--vinculado", vinculado !== null);
    if (info) info.textContent = vinculado ? "✓ Vinculado ao cadastro" : "";
  };

  input.setAttribute("list", opcoes.datalist.id);
  input.addEventListener("input", () => {
    const texto = input.value.trim();
    // Texto igual ao nome do vinculado: segue vinculado (o campo foi normalizado).
    if (vinculado && texto === vinculado.nome) return;
    const achado = opcoes.porValor.get(texto) ?? null;
    vinculado = achado;
    if (achado) input.value = achado.nome;
    atualizarInfo();
  });

  return {
    id: () => vinculado?.id ?? null,
    limpar: () => {
      vinculado = null;
      atualizarInfo();
    },
  };
}

export function ligarSeletoresDeJogador(
  form: HTMLFormElement,
  jogadores: readonly Jogador[]
): SeletorJogadores {
  const doc = form.ownerDocument;
  let datalist = doc.querySelector<HTMLDataListElement>("[data-jogadores-lista]");
  if (!datalist) {
    datalist = doc.createElement("datalist");
    datalist.id = "jogadores-opcoes";
    datalist.dataset.jogadoresLista = "";
    form.append(datalist);
  }
  if (!datalist.id) datalist.id = "jogadores-opcoes";
  const opcoes = prepararOpcoes(datalist, jogadores);

  const campos = (["#dupla-atleta-a", "#dupla-atleta-b"] as const).map((seletor, i) => {
    const input = form.querySelector<HTMLInputElement>(seletor);
    const info = form.querySelectorAll<HTMLElement>("[data-vinculo-info]")[i] ?? null;
    return input && jogadores.length > 0 ? ligarAutocomplete(input, opcoes, info) : null;
  });

  const ler = (i: 0 | 1): string | null => campos[i]?.id() ?? null;

  return {
    disponivel: jogadores.length > 0,
    opcoes,
    lerVinculos: () => ({ jogadorAId: ler(0), jogadorBId: ler(1) }),
    mesmoJogador: () => {
      const a = ler(0);
      return a !== null && a === ler(1);
    },
    limpar: () => {
      for (const c of campos) c?.limpar();
    },
  };
}
