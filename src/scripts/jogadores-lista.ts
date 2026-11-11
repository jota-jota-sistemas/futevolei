// src/scripts/jogadores-lista.ts
//
// Tela /jogadores: lista com busca, cadastro de novo jogador e aviso de
// homônimo. Recebe a store por injeção (testável sem Supabase).
//
// Contrato de DOM (data-*), dentro de `raiz`:
//   [data-lista] ul · [data-estado-lista] · [data-busca] · [data-mostrar-arquivados]
//   [data-contador-jogadores] · [data-jogador-form] (ver components/JogadorForm.astro)
//
// Dois modos, escolhidos por quem chama:
//   - consulta pública (padrão): só lista e abre os perfis dos jogadores ATIVOS.
//     Nada é criado, alterado ou excluído, mesmo que o HTML tenha um formulário.
//   - gerenciar (`gerenciar: true`): também lista arquivados e permite cadastrar.
//     Usado apenas pela área acessível por URL direta (/gerenciar_jogadores).
//
// Os dados são carregados UMA vez e filtrados em memória;
// criar um jogador atualiza a lista local sem nova leitura.

import type { Jogador } from "../domain/jogadores/types";
import { mensagemDoErro } from "../domain/jogadores/mensagens";
import {
  encontrarHomonimos,
  filtrarJogadores,
  iniciaisDoNome,
  ordenarJogadores,
  rotuloGenero,
  validarJogador,
} from "../domain/jogadores/validation";
import type { JogadorStore } from "../store/jogadorStore";
import { hrefPerfilJogador } from "../utils/url";
import {
  definirEnviando,
  esconderHomonimos,
  esconderStatus,
  lerFormulario,
  limparErros,
  limparFormulario,
  mostrarErro,
  mostrarHomonimos,
  mostrarStatus,
} from "./jogador-form";

export interface DepsLista {
  store: JogadorStore;
  raiz?: ParentNode;
  /**
   * Habilita a área de gerenciamento: lista também os arquivados e liga o
   * cadastro. Padrão `false` (consulta pública, somente leitura).
   */
  gerenciar?: boolean;
  /** Link do perfil de cada jogador. Padrão: o perfil público. */
  hrefPerfil?: (id: string) => string;
}

function plural(n: number, singular: string, pluralTxt: string): string {
  return `${n} ${n === 1 ? singular : pluralTxt}`;
}

/** Subtítulo do item: “apelido” · Cidade/UF · gênero · categoria (só o que existir). */
function subtituloDe(j: Jogador): string {
  const local = [j.cidade, j.uf].filter(Boolean).join("/");
  return [
    j.apelido ? `“${j.apelido}”` : "",
    local,
    j.genero ? rotuloGenero(j.genero) : "",
    j.categoria ?? "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Monta o item da lista com DOM seguro (textContent; nunca innerHTML). */
function itemDe(j: Jogador, hrefPerfil: (id: string) => string): HTMLLIElement {
  const li = document.createElement("li");
  const a = document.createElement("a");
  a.className = "jl-item";
  a.href = hrefPerfil(j.id);

  const avatar = document.createElement("span");
  avatar.className = "jl-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = iniciaisDoNome(j.nome);

  const info = document.createElement("span");
  info.className = "jl-info";
  const nome = document.createElement("span");
  nome.className = "jl-nome";
  nome.textContent = j.nome;
  info.append(nome);

  const sub = subtituloDe(j);
  if (sub) {
    const s = document.createElement("span");
    s.className = "jl-sub";
    s.textContent = sub;
    info.append(s);
  }

  a.append(avatar, info);
  if (!j.ativo) {
    const chip = document.createElement("span");
    chip.className = "jl-chip";
    chip.textContent = "Arquivado";
    a.append(chip);
  }
  li.append(a);
  return li;
}

export async function iniciarLista({
  store,
  raiz = document,
  gerenciar = false,
  hrefPerfil = hrefPerfilJogador,
}: DepsLista): Promise<void> {
  const q = <T extends Element>(seletor: string) => raiz.querySelector<T>(seletor);
  const lista = q<HTMLElement>("[data-lista]");
  const estado = q<HTMLElement>("[data-estado-lista]");
  const busca = q<HTMLInputElement>("[data-busca]");
  const arquivados = q<HTMLInputElement>("[data-mostrar-arquivados]");
  const contador = q<HTMLElement>("[data-contador-jogadores]");
  const form = q<HTMLFormElement>("[data-jogador-form]");
  if (!lista || !estado) return;

  let todos: Jogador[] = [];

  function mostrarEstado(texto: string, comRetentar = false): void {
    estado!.textContent = texto;
    estado!.hidden = false;
    if (comRetentar) {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "jl-retentar";
      botao.textContent = "Tentar novamente";
      botao.addEventListener("click", () => void carregar());
      estado!.append(" ", botao);
    }
  }

  function render(): void {
    // Arquivados só aparecem na área de gerenciamento, e só se o filtro for marcado.
    const base = gerenciar && arquivados?.checked ? todos : todos.filter((j) => j.ativo);
    const filtrados = filtrarJogadores(base, busca?.value ?? "");

    lista!.textContent = "";
    for (const j of filtrados) lista!.append(itemDe(j, hrefPerfil));

    if (contador) {
      contador.textContent =
        filtrados.length === base.length
          ? plural(base.length, "jogador", "jogadores")
          : `${filtrados.length} de ${plural(base.length, "jogador", "jogadores")}`;
    }

    if (todos.length === 0) {
      mostrarEstado("Nenhum jogador cadastrado ainda. Cadastre o primeiro ao lado.");
    } else if (filtrados.length === 0) {
      mostrarEstado("Nenhum jogador encontrado para os filtros atuais.");
    } else {
      estado!.hidden = true;
    }
  }

  async function carregar(): Promise<void> {
    mostrarEstado("Carregando jogadores…");
    const r = await store.listar({ incluirArquivados: gerenciar });
    if (!r.ok) {
      lista!.textContent = "";
      mostrarEstado(mensagemDoErro(r.erro), true);
      return;
    }
    // A tela ordena por conta própria (como após cadastrar): não depende da
    // ordem em que a store devolve os jogadores.
    todos = ordenarJogadores(r.valor);
    render();
  }

  busca?.addEventListener("input", render);
  arquivados?.addEventListener("change", render);

  if (gerenciar && form) {
    const formulario = form;

    async function submeter(confirmado: boolean): Promise<void> {
      limparErros(formulario);
      esconderStatus(formulario);
      const entrada = lerFormulario(formulario);

      const validado = validarJogador(entrada);
      if (!validado.ok) {
        esconderHomonimos(formulario);
        mostrarErro(formulario, validado.erro);
        return;
      }

      // Homônimo não é erro: avisa e deixa a pessoa decidir.
      if (!confirmado) {
        const homonimos = encontrarHomonimos(validado.valor.nome, todos);
        if (homonimos.length > 0) {
          mostrarHomonimos(formulario, homonimos, hrefPerfil);
          return;
        }
      }
      esconderHomonimos(formulario);

      definirEnviando(formulario, true);
      const r = await store.criar(entrada);
      definirEnviando(formulario, false);

      if (!r.ok) {
        mostrarErro(formulario, r.erro);
        return;
      }
      todos = ordenarJogadores([...todos, r.valor]);
      render();
      limparFormulario(formulario);
      mostrarStatus(formulario, `${r.valor.nome} foi cadastrado.`);
    }

    formulario.addEventListener("submit", (evento) => {
      evento.preventDefault();
      void submeter(false);
    });
    formulario
      .querySelector("[data-confirmar-homonimo]")
      ?.addEventListener("click", () => void submeter(true));
    formulario
      .querySelector("[data-cancelar-homonimo]")
      ?.addEventListener("click", () => {
        esconderHomonimos(formulario);
        formulario.querySelector<HTMLInputElement>('[name="nome"]')?.focus();
      });
  }

  await carregar();
}
