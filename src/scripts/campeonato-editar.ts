// src/scripts/campeonato-editar.ts
//
// Tela /gerenciar_campeonatos/editar?id=…: edição, arquivar/reativar e exclusão
// (com confirmação em tela) de UM campeonato. Recebe a store e o id por
// injeção (testável sem Supabase nem URL real).
//
// Contrato de DOM (data-*), dentro de `raiz`:
//   [data-estado-perfil] · [data-perfil] (conteúdo, oculto até carregar)
//   [data-perfil-nome|chips|periodo|local] · [data-organizar-link]
//   [data-categorias-estado] [data-categorias-lista]
//   [data-campeonato-form] · [data-arquivar] · [data-excluir]
//   [data-confirmacao-exclusao] [data-confirmacao-texto]
//   [data-confirmar-exclusao] [data-cancelar-exclusao] · [data-acoes-status]
//
// Regra de exclusão: só apaga de vez o campeonato SEM categorias. Com
// categorias, a confirmação avisa e o campeonato é ARQUIVADO (apagar levaria
// duplas, chaveamentos e jogos junto).

import type { CampeonatoDetalhe } from "../domain/campeonatos/types";
import { mensagemDoErro } from "../domain/campeonatos/mensagens";
import { validarCampeonato } from "../domain/campeonatos/validation";
import type { CampeonatoStore } from "../store/campeonatoStore";
import { comBase, formatarPeriodo } from "../utils/url";
import {
  definirEnviando,
  esconderStatus,
  lerFormulario,
  limparErros,
  mostrarErro,
  mostrarStatus,
  preencherFormulario,
} from "./campeonato-form";
import { irParaGerenciarCampeonatos } from "./rotas-gerenciar";

export interface DepsEditar {
  store: CampeonatoStore;
  /** id vindo da query string (?id=…); null quando ausente. */
  id: string | null;
  raiz?: ParentNode;
  /** Navegação após excluir de vez. Padrão: volta para a lista de gerenciamento. */
  irParaLista?: () => void;
}

export async function iniciarEdicao({
  store,
  id,
  raiz = document,
  irParaLista = irParaGerenciarCampeonatos,
}: DepsEditar): Promise<void> {
  const q = <T extends Element>(seletor: string) => raiz.querySelector<T>(seletor);
  const estado = q<HTMLElement>("[data-estado-perfil]");
  const perfil = q<HTMLElement>("[data-perfil]");
  const form = q<HTMLFormElement>("[data-campeonato-form]");
  if (!estado || !perfil || !form) return;

  const nome = q<HTMLElement>("[data-perfil-nome]");
  const chips = q<HTMLElement>("[data-perfil-chips]");
  const periodo = q<HTMLElement>("[data-perfil-periodo]");
  const local = q<HTMLElement>("[data-perfil-local]");
  const organizar = q<HTMLAnchorElement>("[data-organizar-link]");
  const categoriasEstado = q<HTMLElement>("[data-categorias-estado]");
  const categoriasLista = q<HTMLElement>("[data-categorias-lista]");
  const btnArquivar = q<HTMLButtonElement>("[data-arquivar]");
  const btnExcluir = q<HTMLButtonElement>("[data-excluir]");
  const painel = q<HTMLElement>("[data-confirmacao-exclusao]");
  const painelTexto = q<HTMLElement>("[data-confirmacao-texto]");
  const btnConfirmar = q<HTMLButtonElement>("[data-confirmar-exclusao]");
  const btnCancelar = q<HTMLButtonElement>("[data-cancelar-exclusao]");
  const statusAcoes = q<HTMLElement>("[data-acoes-status]");

  let atual: CampeonatoDetalhe | null = null;

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

  function renderResumo(c: CampeonatoDetalhe): void {
    if (nome) nome.textContent = c.nome;
    if (periodo) periodo.textContent = formatarPeriodo(c.data, c.dataFim ?? undefined);
    if (local) {
      const texto = [c.endereco, [c.cidade, c.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ");
      local.textContent = texto;
      local.hidden = texto === "";
    }
    if (chips) {
      chips.textContent = "";
      if (!c.ativo) chips.append(chip("Arquivado", "pf-chip--arquivado"));
      chips.append(chip(c.listado ? "Visível na home" : "Oculto na home"));
      if (c.fonte) chips.append(chip(`Origem: ${c.fonte}`));
    }
    if (organizar) organizar.href = comBase(`/campeonatos/${encodeURIComponent(c.id)}/organizar`);
    if (btnArquivar) btnArquivar.textContent = c.ativo ? "Arquivar campeonato" : "Reativar campeonato";
    document.title = `${c.nome} — Gerenciar campeonato — Pingo Futevôlei`;
  }

  /** Categorias só para leitura: nomes, com o caminho para organizar. */
  function renderCategorias(c: CampeonatoDetalhe): void {
    if (!categoriasLista || !categoriasEstado) return;
    categoriasLista.textContent = "";
    if (c.categorias.length === 0) {
      categoriasEstado.textContent =
        "Nenhuma categoria ainda. Elas são criadas na organização do evento.";
      categoriasEstado.hidden = false;
      return;
    }
    categoriasEstado.hidden = true;
    for (const nomeCategoria of c.categorias) {
      const li = document.createElement("li");
      li.className = "pf-categoria";
      li.textContent = nomeCategoria;
      categoriasLista.append(li);
    }
  }

  async function carregar(): Promise<void> {
    if (!id) {
      mostrarEstado("Campeonato não informado. Volte à lista e escolha um campeonato.");
      return;
    }
    mostrarEstado("Carregando campeonato…");
    const r = await store.obter(id);
    if (!r.ok) {
      mostrarEstado(mensagemDoErro(r.erro), r.erro.code === "FALHA_LEITURA");
      return;
    }
    atual = r.valor;
    estado!.hidden = true;
    perfil!.hidden = false;
    renderResumo(atual);
    renderCategorias(atual);
    preencherFormulario(form!, atual);
  }

  // ---- Edição -------------------------------------------------------------

  async function salvar(): Promise<void> {
    if (!atual) return;
    limparErros(form!);
    esconderStatus(form!);
    const entrada = lerFormulario(form!);

    const validado = validarCampeonato(entrada);
    if (!validado.ok) {
      mostrarErro(form!, validado.erro);
      return;
    }

    definirEnviando(form!, true);
    const r = await store.atualizar(atual.id, entrada);
    definirEnviando(form!, false);

    if (!r.ok) {
      mostrarErro(form!, r.erro);
      return;
    }
    // `atualizar` não devolve as categorias: mantém as já carregadas.
    atual = { ...r.valor, categorias: atual.categorias };
    renderResumo(atual);
    preencherFormulario(form!, atual);
    mostrarStatus(form!, "Alterações salvas.");
  }

  form.addEventListener("submit", (evento) => {
    evento.preventDefault();
    void salvar();
  });

  // ---- Arquivar / reativar --------------------------------------------------

  btnArquivar?.addEventListener("click", async () => {
    if (!atual) return;
    btnArquivar.disabled = true;
    const r = await store.definirAtivo(atual.id, !atual.ativo);
    btnArquivar.disabled = false;
    if (!r.ok) {
      statusDasAcoes(mensagemDoErro(r.erro), "erro");
      return;
    }
    atual = { ...r.valor, categorias: atual.categorias };
    renderResumo(atual);
    statusDasAcoes(atual.ativo ? "Campeonato reativado." : "Campeonato arquivado.");
  });

  // ---- Excluir (com confirmação em tela) ------------------------------------

  function fecharConfirmacao(): void {
    if (painel) painel.hidden = true;
  }

  btnExcluir?.addEventListener("click", async () => {
    if (!atual || !painel || !painelTexto) return;
    statusDasAcoes("");
    // Contagem fresca (alguém pode ter criado categorias depois do carregamento).
    const n = await store.contarCategorias(atual.id);
    if (!n.ok) {
      statusDasAcoes(mensagemDoErro(n.erro), "erro");
      return;
    }
    painelTexto.textContent =
      n.valor > 0
        ? `Este campeonato tem ${n.valor} ${n.valor === 1 ? "categoria" : "categorias"} (com duplas e chaveamentos) e não pode ser apagado. Ele será arquivado e sairá do site.`
        : "O campeonato será excluído definitivamente. Esta ação não pode ser desfeita.";
    if (btnConfirmar) btnConfirmar.textContent = n.valor > 0 ? "Arquivar" : "Excluir de vez";
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
    // Arquivado (tinha categorias): permanece na tela, agora como arquivado.
    atual = { ...atual, ativo: false };
    renderResumo(atual);
    fecharConfirmacao();
    statusDasAcoes("Campeonato arquivado.");
  });

  await carregar();
}
