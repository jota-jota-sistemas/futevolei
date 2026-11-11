// src/scripts/jogador-perfil.ts
//
// Tela /jogadores/perfil?id=…: visualização, edição, arquivar/reativar e
// exclusão (com confirmação em tela) de UM jogador. Recebe a store e o id por
// injeção (testável sem Supabase nem URL real).
//
// Contrato de DOM (data-*), dentro de `raiz`:
//   [data-estado-perfil] · [data-perfil] (conteúdo, oculto até carregar)
//   [data-perfil-avatar|nome|apelido|chips|instagram]
//   [data-jogador-form] · [data-arquivar] · [data-excluir]
//   [data-confirmacao-exclusao] [data-confirmacao-texto]
//   [data-confirmar-exclusao] [data-cancelar-exclusao] · [data-acoes-status]

import type { Jogador } from "../domain/jogadores/types";
import { mensagemDoErro } from "../domain/jogadores/mensagens";
import {
  chaveTexto,
  encontrarHomonimos,
  iniciaisDoNome,
  rotuloGenero,
  validarJogador,
} from "../domain/jogadores/validation";
import type { JogadorStore } from "../store/jogadorStore";
import { comBase, hrefPerfilJogador, instagramUrl } from "../utils/url";
import {
  definirEnviando,
  esconderHomonimos,
  esconderStatus,
  lerFormulario,
  limparErros,
  mostrarErro,
  mostrarHomonimos,
  mostrarStatus,
  preencherFormulario,
} from "./jogador-form";

export interface DepsPerfil {
  store: JogadorStore;
  /** id vindo da query string (?id=…); null quando ausente. */
  id: string | null;
  raiz?: ParentNode;
  /** Navegação após excluir de vez. Padrão: vai para /jogadores. */
  irParaLista?: () => void;
}

export async function iniciarPerfil({
  store,
  id,
  raiz = document,
  irParaLista = () => {
    window.location.href = comBase("/jogadores");
  },
}: DepsPerfil): Promise<void> {
  const q = <T extends Element>(seletor: string) => raiz.querySelector<T>(seletor);
  const estado = q<HTMLElement>("[data-estado-perfil]");
  const perfil = q<HTMLElement>("[data-perfil]");
  const form = q<HTMLFormElement>("[data-jogador-form]");
  if (!estado || !perfil || !form) return;

  const avatar = q<HTMLElement>("[data-perfil-avatar]");
  const nome = q<HTMLElement>("[data-perfil-nome]");
  const apelido = q<HTMLElement>("[data-perfil-apelido]");
  const chips = q<HTMLElement>("[data-perfil-chips]");
  const instagram = q<HTMLAnchorElement>("[data-perfil-instagram]");
  const btnArquivar = q<HTMLButtonElement>("[data-arquivar]");
  const btnExcluir = q<HTMLButtonElement>("[data-excluir]");
  const painel = q<HTMLElement>("[data-confirmacao-exclusao]");
  const painelTexto = q<HTMLElement>("[data-confirmacao-texto]");
  const btnConfirmar = q<HTMLButtonElement>("[data-confirmar-exclusao]");
  const btnCancelar = q<HTMLButtonElement>("[data-cancelar-exclusao]");
  const statusAcoes = q<HTMLElement>("[data-acoes-status]");

  let atual: Jogador | null = null;

  function mostrarEstado(texto: string, comRetentar = false): void {
    perfil!.hidden = true;
    estado!.textContent = texto;
    estado!.hidden = false;
    if (comRetentar) {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "pf-retentar";
      botao.textContent = "Tentar novamente";
      botao.addEventListener("click", () => void carregar());
      estado!.append(" ", botao);
    }
  }

  function statusDasAcoes(texto: string, tipo: "ok" | "erro" = "ok"): void {
    if (!statusAcoes) return;
    statusAcoes.textContent = texto;
    statusAcoes.dataset.tipo = tipo;
    statusAcoes.hidden = texto === "";
  }

  function chip(texto: string, classe = ""): HTMLElement {
    const span = document.createElement("span");
    span.className = `pf-chip ${classe}`.trim();
    span.textContent = texto;
    return span;
  }

  function renderResumo(j: Jogador): void {
    if (avatar) avatar.textContent = iniciaisDoNome(j.nome);
    if (nome) nome.textContent = j.nome;
    if (apelido) {
      apelido.textContent = j.apelido ? `“${j.apelido}”` : "";
      apelido.hidden = !j.apelido;
    }
    if (chips) {
      chips.textContent = "";
      if (!j.ativo) chips.append(chip("Arquivado", "pf-chip--arquivado"));
      if (j.genero) chips.append(chip(rotuloGenero(j.genero)));
      const local = [j.cidade, j.uf].filter(Boolean).join("/");
      if (local) chips.append(chip(`📍 ${local}`));
    }
    if (instagram) {
      const url = j.instagram ? instagramUrl(`@${j.instagram}`) : null;
      instagram.hidden = !url;
      if (url) {
        instagram.href = url;
        instagram.textContent = `@${j.instagram}`;
      }
    }
    if (btnArquivar) {
      btnArquivar.textContent = j.ativo ? "Arquivar jogador" : "Reativar jogador";
    }
    document.title = `${j.nome} — Pingo Futevôlei`;
  }

  async function carregar(): Promise<void> {
    if (!id) {
      mostrarEstado("Jogador não informado. Volte à lista e escolha um jogador.");
      return;
    }
    mostrarEstado("Carregando perfil…");
    const r = await store.obter(id);
    if (!r.ok) {
      mostrarEstado(mensagemDoErro(r.erro), r.erro.code === "FALHA_LEITURA");
      return;
    }
    atual = r.valor;
    estado!.hidden = true;
    perfil!.hidden = false;
    renderResumo(atual);
    preencherFormulario(form!, atual);
  }

  // ---- Edição -------------------------------------------------------------

  async function salvar(confirmado: boolean): Promise<void> {
    if (!atual) return;
    limparErros(form!);
    esconderStatus(form!);
    const entrada = lerFormulario(form!);

    const validado = validarJogador(entrada);
    if (!validado.ok) {
      esconderHomonimos(form!);
      mostrarErro(form!, validado.erro);
      return;
    }

    // Só checa homônimo quando o NOME muda (a leitura extra é desnecessária
    // nas demais edições). Se a leitura falhar, não bloqueia a edição.
    if (!confirmado && chaveTexto(validado.valor.nome) !== chaveTexto(atual.nome)) {
      const lista = await store.listar({ incluirArquivados: true });
      if (lista.ok) {
        const homonimos = encontrarHomonimos(validado.valor.nome, lista.valor, atual.id);
        if (homonimos.length > 0) {
          mostrarHomonimos(form!, homonimos, hrefPerfilJogador);
          return;
        }
      }
    }
    esconderHomonimos(form!);

    definirEnviando(form!, true);
    const r = await store.atualizar(atual.id, entrada);
    definirEnviando(form!, false);

    if (!r.ok) {
      mostrarErro(form!, r.erro);
      return;
    }
    atual = r.valor;
    renderResumo(atual);
    preencherFormulario(form!, atual);
    mostrarStatus(form!, "Alterações salvas.");
  }

  form.addEventListener("submit", (evento) => {
    evento.preventDefault();
    void salvar(false);
  });
  form
    .querySelector("[data-confirmar-homonimo]")
    ?.addEventListener("click", () => void salvar(true));
  form
    .querySelector("[data-cancelar-homonimo]")
    ?.addEventListener("click", () => {
      esconderHomonimos(form);
      form.querySelector<HTMLInputElement>('[name="nome"]')?.focus();
    });

  // ---- Arquivar / reativar ------------------------------------------------

  btnArquivar?.addEventListener("click", async () => {
    if (!atual) return;
    btnArquivar.disabled = true;
    const r = await store.definirAtivo(atual.id, !atual.ativo);
    btnArquivar.disabled = false;
    if (!r.ok) {
      statusDasAcoes(mensagemDoErro(r.erro), "erro");
      return;
    }
    atual = r.valor;
    renderResumo(atual);
    statusDasAcoes(atual.ativo ? "Jogador reativado." : "Jogador arquivado.");
  });

  // ---- Excluir (com confirmação em tela) ----------------------------------

  function fecharConfirmacao(): void {
    if (painel) painel.hidden = true;
  }

  btnExcluir?.addEventListener("click", async () => {
    if (!atual || !painel || !painelTexto) return;
    statusDasAcoes("");
    const v = await store.contarVinculos(atual.id);
    if (!v.ok) {
      statusDasAcoes(mensagemDoErro(v.erro), "erro");
      return;
    }
    painelTexto.textContent =
      v.valor > 0
        ? `Este jogador participa de ${v.valor} ${v.valor === 1 ? "inscrição" : "inscrições"} em duplas e não pode ser apagado. Ele será arquivado e deixará de aparecer na lista.`
        : "O jogador será excluído definitivamente. Esta ação não pode ser desfeita.";
    if (btnConfirmar) btnConfirmar.textContent = v.valor > 0 ? "Arquivar" : "Excluir de vez";
    painel.hidden = false;
    btnConfirmar?.focus();
  });

  btnCancelar?.addEventListener("click", fecharConfirmacao);

  btnConfirmar?.addEventListener("click", async () => {
    if (!atual) return;
    btnConfirmar.disabled = true;
    const r = await store.excluir(atual.id);
    btnConfirmar.disabled = false;
    if (!r.ok) {
      statusDasAcoes(mensagemDoErro(r.erro), "erro");
      return;
    }
    if (r.valor === "excluido") {
      irParaLista();
      return;
    }
    // Arquivado (tinha histórico): permanece na tela, agora como arquivado.
    atual = { ...atual, ativo: false };
    renderResumo(atual);
    fecharConfirmacao();
    statusDasAcoes("Jogador arquivado.");
  });

  await carregar();
}
