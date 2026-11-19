// src/scripts/campeonato-editar.ts
//
// Tela /gerenciar_campeonatos/editar?id=…: edição, arquivar/reativar e exclusão
// (com confirmação em tela) de UM campeonato. Recebe a store e o id por
// injeção (testável sem Supabase nem URL real).
//
// Contrato de DOM (data-*), dentro de `raiz`:
//   [data-estado-perfil] · [data-perfil] (conteúdo, oculto até carregar)
//   [data-perfil-nome|chips|periodo|local] · [data-organizar-link]
//   (categorias: editor em components/CategoriasEditor.astro, ligado por scripts/categorias-editor.ts)
//   [data-donos-estado] [data-donos-lista] [data-donos-form] [data-donos-status]
//   (organizadores do evento: o dono e o administrador adicionam e removem)
//   [data-campeonato-form] · [data-arquivar] · [data-excluir]
//   [data-confirmacao-exclusao] [data-confirmacao-texto]
//   [data-confirmar-exclusao] [data-cancelar-exclusao] · [data-acoes-status]
//
// Regra de exclusão: só apaga de vez o campeonato SEM categorias. Com
// categorias, a confirmação avisa e o campeonato é ARQUIVADO (apagar levaria
// duplas, chaveamentos e jogos junto).

import type { CampeonatoDetalhe, CampeonatoDono } from "../domain/campeonatos/types";
import { mensagemDoErro } from "../domain/campeonatos/mensagens";
import { validarCampeonatoTodos } from "../domain/campeonatos/validation";
import type { CampeonatoStore } from "../store/campeonatoStore";
import type { CategoriaStore } from "../store/categoriaStore";
import { formatarPeriodo, hrefOrganizarCampeonato } from "../utils/url";
import {
  definirEnviando,
  esconderStatus,
  lerFormulario,
  limparErros,
  ligarResumoDetalhes,
  mostrarErro,
  mostrarErros,
  mostrarStatus,
  preencherFormulario,
} from "./campeonato-form";
import { iniciarDuplicar } from "./campeonato-duplicar";
import { iniciarCategoriasEditor, type EventoParaCopiar } from "./categorias-editor";
import { irParaGerenciarCampeonatos } from "./rotas-gerenciar";

export interface DepsEditar {
  store: CampeonatoStore;
  /** id vindo da query string (?id=…); null quando ausente. */
  id: string | null;
  raiz?: ParentNode;
  /** Navegação após excluir de vez. Padrão: volta para a lista de gerenciamento. */
  irParaLista?: () => void;
  /**
   * Confere no banco se a conta gerencia ESTE campeonato antes de mostrar a
   * edição (organizador). Padrão `false`: administrador gerencia todos.
   */
  verificarPosse?: boolean;
  /** Store das categorias; sem ela o editor de categorias não é ligado. */
  categoriaStore?: CategoriaStore;
  /** Eventos que a pessoa gerencia, para "copiar categorias de outro evento". */
  listarEventosParaCopiar?: () => Promise<EventoParaCopiar[]>;
  /** Navegação depois de duplicar (padrão: `window.location.assign`). */
  irPara?: (url: string) => void;
}

export async function iniciarEdicao({
  store,
  id,
  raiz = document,
  irParaLista = irParaGerenciarCampeonatos,
  verificarPosse = false,
  categoriaStore,
  listarEventosParaCopiar,
  irPara,
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
  const btnArquivar = q<HTMLButtonElement>("[data-arquivar]");
  const btnExcluir = q<HTMLButtonElement>("[data-excluir]");
  const painel = q<HTMLElement>("[data-confirmacao-exclusao]");
  const painelTexto = q<HTMLElement>("[data-confirmacao-texto]");
  const btnConfirmar = q<HTMLButtonElement>("[data-confirmar-exclusao]");
  const btnCancelar = q<HTMLButtonElement>("[data-cancelar-exclusao]");
  const statusAcoes = q<HTMLElement>("[data-acoes-status]");
  const donosEstado = q<HTMLElement>("[data-donos-estado]");
  const donosLista = q<HTMLElement>("[data-donos-lista]");
  const donosForm = q<HTMLFormElement>("[data-donos-form]");
  const donosStatus = q<HTMLElement>("[data-donos-status]");

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
    }
    if (organizar) organizar.href = hrefOrganizarCampeonato(c.id);
    if (btnArquivar) btnArquivar.textContent = c.ativo ? "Arquivar campeonato" : "Reativar campeonato";
    document.title = `${c.nome} — Gerenciar campeonato — Pingo Futevôlei`;
  }

  // ---- Organizadores do evento ------------------------------------------------

  function statusDosDonos(texto: string, tipo: "ok" | "erro" = "ok"): void {
    if (!donosStatus) return;
    donosStatus.textContent = texto;
    donosStatus.dataset.tipo = tipo;
    donosStatus.hidden = texto === "";
  }

  function itemDeDono(dono: CampeonatoDono): HTMLLIElement {
    const li = document.createElement("li");
    li.className = "pf-dono";
    const email = document.createElement("span");
    email.className = "pf-dono__email";
    email.textContent = dono.email;
    const remover = document.createElement("button");
    remover.type = "button";
    remover.className = "pf-dono__remover";
    remover.textContent = "Remover";
    remover.setAttribute("aria-label", `Remover ${dono.email}`);
    remover.addEventListener("click", () => void removerDono(dono.email, remover));
    li.append(email, remover);
    return li;
  }

  async function carregarDonos(): Promise<void> {
    if (!atual || !donosLista) return;
    const r = await store.listarDonos(atual.id);
    donosLista.textContent = "";
    if (!r.ok) {
      if (donosEstado) {
        donosEstado.textContent = mensagemDoErro(r.erro);
        donosEstado.hidden = false;
      }
      return;
    }
    if (donosEstado) {
      donosEstado.textContent =
        r.valor.length === 0
          ? "Sem organizador: só administradores gerenciam este campeonato. Adicione um organizador abaixo."
          : "";
      donosEstado.hidden = r.valor.length > 0;
    }
    for (const dono of r.valor) donosLista.append(itemDeDono(dono));
  }

  async function removerDono(email: string, botao: HTMLButtonElement): Promise<void> {
    if (!atual) return;
    statusDosDonos("");
    botao.disabled = true;
    const r = await store.removerDono(atual.id, email);
    botao.disabled = false;
    if (!r.ok) {
      statusDosDonos(mensagemDoErro(r.erro), "erro");
      return;
    }
    await carregarDonos();
    statusDosDonos(`${email} foi removido.`);
  }

  async function adicionarDono(): Promise<void> {
    if (!atual || !donosForm) return;
    const campoEmail = donosForm.querySelector<HTMLInputElement>('[name="email"]');
    const botao = donosForm.querySelector<HTMLButtonElement>("[data-donos-adicionar]");
    if (!campoEmail) return;
    campoEmail.removeAttribute("aria-invalid");
    statusDosDonos("");
    if (botao) botao.disabled = true;
    const r = await store.adicionarDono(atual.id, campoEmail.value);
    if (botao) botao.disabled = false;
    if (!r.ok) {
      campoEmail.setAttribute("aria-invalid", "true");
      statusDosDonos(mensagemDoErro(r.erro), "erro");
      campoEmail.focus();
      return;
    }
    campoEmail.value = "";
    await carregarDonos();
    statusDosDonos(`${r.valor.email} agora é organizador deste campeonato.`);
  }

  donosForm?.addEventListener("submit", (evento) => {
    evento.preventDefault();
    void adicionarDono();
  });

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
    if (verificarPosse) {
      const posse = await store.podeGerenciar(id);
      if (!posse.ok) {
        mostrarEstado(mensagemDoErro(posse.erro), true);
        return;
      }
      if (!posse.valor) {
        mostrarEstado(mensagemDoErro({ code: "SEM_PERMISSAO" }));
        return;
      }
    }
    atual = r.valor;
    estado!.hidden = true;
    perfil!.hidden = false;
    renderResumo(atual);
    preencherFormulario(form!, atual);
    if (categoriaStore) {
      void iniciarCategoriasEditor({
        store: categoriaStore,
        campeonatoId: atual.id,
        raiz,
        listarEventos: listarEventosParaCopiar,
      });
      iniciarDuplicar({ store, categoriaStore, campeonato: atual, raiz, irPara });
    }
    void carregarDonos();
  }

  // ---- Edição -------------------------------------------------------------

  async function salvar(): Promise<void> {
    if (!atual) return;
    limparErros(form!);
    esconderStatus(form!);
    const entrada = lerFormulario(form!);

    // Todos os erros de uma vez (cada um no seu campo).
    const erros = validarCampeonatoTodos(entrada);
    if (erros.length > 0) {
      mostrarErros(form!, erros);
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
    if (categoriaStore) iniciarDuplicar({ store, categoriaStore, campeonato: atual, raiz, irPara });
    mostrarStatus(form!, "Alterações salvas.");
  }

  ligarResumoDetalhes(form);
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
