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
//   [data-duplas-contador] [data-duplas-estado] [data-duplas-lista] (histórico de duplas)

import type { Jogador, ParticipacaoDupla } from "../domain/jogadores/types";
import { mensagemDoErro } from "../domain/jogadores/mensagens";
import {
  chaveTexto,
  encontrarHomonimos,
  iniciaisDoNome,
  rotuloGenero,
  validarJogador,
} from "../domain/jogadores/validation";
import type { JogadorStore } from "../store/jogadorStore";
import { comBase, formatarData, hrefPerfilJogador, instagramUrl } from "../utils/url";
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
  /**
   * Habilita a área de gerenciamento (editar, arquivar/reativar, excluir).
   * Padrão `false`: perfil público, somente leitura. Mesmo que o HTML tenha o
   * formulário ou os botões, nada é ligado sem este modo.
   */
  gerenciar?: boolean;
  /** Link do perfil de outro jogador (ex.: o parceiro). Padrão: o perfil público. */
  hrefPerfil?: (id: string) => string;
  /** Navegação após excluir de vez. Padrão: vai para /jogadores. */
  irParaLista?: () => void;
  /**
   * Ids de evento que têm página de detalhe. Só esses viram link no histórico
   * de duplas (os demais aparecem como texto). Padrão: nenhum.
   */
  eventosComDetalhe?: ReadonlySet<string>;
}

export async function iniciarPerfil({
  store,
  id,
  raiz = document,
  gerenciar = false,
  hrefPerfil = hrefPerfilJogador,
  irParaLista = () => {
    window.location.href = comBase("/jogadores");
  },
  eventosComDetalhe = new Set<string>(),
}: DepsPerfil): Promise<void> {
  const q = <T extends Element>(seletor: string) => raiz.querySelector<T>(seletor);
  const estado = q<HTMLElement>("[data-estado-perfil]");
  const perfil = q<HTMLElement>("[data-perfil]");
  // O formulário só existe (e só é usado) na área de gerenciamento.
  const form = gerenciar ? q<HTMLFormElement>("[data-jogador-form]") : null;
  if (!estado || !perfil || (gerenciar && !form)) return;

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
  const duplasContador = q<HTMLElement>("[data-duplas-contador]");
  const duplasEstado = q<HTMLElement>("[data-duplas-estado]");
  const duplasLista = q<HTMLElement>("[data-duplas-lista]");

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
      if (j.categoria) chips.append(chip(j.categoria));
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

  // ---- Histórico de duplas ------------------------------------------------

  function texto(valor: string): Text {
    return document.createTextNode(valor);
  }

  /** Nome do parceiro: link para o perfil dele quando também está vinculado. */
  function nomeDoParceiro(p: ParticipacaoDupla, nome: string): Node {
    if (!p.parceiroJogadorId) return texto(nome);
    const a = document.createElement("a");
    a.href = hrefPerfil(p.parceiroJogadorId);
    a.textContent = nome;
    return a;
  }

  /** Item "A & B" (o jogador em negrito) + categoria · evento · data. */
  function itemDeParticipacao(p: ParticipacaoDupla): HTMLLIElement {
    const li = document.createElement("li");
    li.className = "pf-dupla";

    const proprio = (nome: string): Node => {
      const forte = document.createElement("strong");
      forte.textContent = nome;
      return forte;
    };
    const nomes = document.createElement("p");
    nomes.className = "pf-dupla__nomes";
    if (p.posicao === "A") {
      nomes.append(proprio(p.atletaA), " & ", nomeDoParceiro(p, p.atletaB));
    } else {
      nomes.append(nomeDoParceiro(p, p.atletaA), " & ", proprio(p.atletaB));
    }
    li.append(nomes);

    const meta = document.createElement("p");
    meta.className = "pf-dupla__meta";
    const partes: Node[] = [];
    if (p.categoria) partes.push(texto(p.categoria));
    if (p.campeonato) {
      if (eventosComDetalhe.has(p.campeonato.id)) {
        const a = document.createElement("a");
        a.href = comBase(`/campeonatos/${p.campeonato.id}`);
        a.textContent = p.campeonato.nome;
        partes.push(a);
      } else {
        partes.push(texto(p.campeonato.nome));
      }
      if (p.campeonato.data) partes.push(texto(formatarData(p.campeonato.data)));
    }
    partes.forEach((parte, i) => {
      if (i > 0) meta.append(" · ");
      meta.append(parte);
    });
    if (partes.length > 0) li.append(meta);
    return li;
  }

  function mostrarEstadoDuplas(msg: string, comRetentar = false): void {
    if (!duplasEstado) return;
    duplasEstado.textContent = msg;
    duplasEstado.hidden = false;
    if (comRetentar) {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "pf-retentar";
      botao.textContent = "Tentar novamente";
      botao.addEventListener("click", () => void carregarDuplas());
      duplasEstado.append(" ", botao);
    }
  }

  async function carregarDuplas(): Promise<void> {
    if (!atual || !duplasLista) return;
    duplasLista.textContent = "";
    if (duplasContador) duplasContador.hidden = true;
    mostrarEstadoDuplas("Carregando duplas…");

    const r = await store.listarParticipacoes(atual.id);
    if (!r.ok) {
      mostrarEstadoDuplas("Não foi possível carregar o histórico de duplas.", true);
      return;
    }
    if (r.valor.length === 0) {
      mostrarEstadoDuplas(
        "Ainda não participou de nenhuma dupla. As duplas aparecem aqui quando a inscrição é vinculada a este jogador na organização do evento."
      );
      return;
    }
    if (duplasEstado) duplasEstado.hidden = true;
    for (const p of r.valor) duplasLista.append(itemDeParticipacao(p));
    if (duplasContador) {
      const n = r.valor.length;
      duplasContador.textContent = `${n} ${n === 1 ? "participação" : "participações"}`;
      duplasContador.hidden = false;
    }
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
    if (form) preencherFormulario(form, atual);
    void carregarDuplas();
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
          mostrarHomonimos(form!, homonimos, hrefPerfil);
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

  // Tudo abaixo só é ligado na área de gerenciamento. A consulta pública é
  // somente leitura: sem edição, sem arquivar e sem excluir.
  if (gerenciar && form) {
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
  }

  await carregar();
}
