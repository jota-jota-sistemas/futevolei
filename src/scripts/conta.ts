// src/scripts/conta.ts
//
// Tela /conta ("Minha conta"): dados da conta, vínculo com um jogador
// cadastrado e botão de sair. Quem não está logado vai para /entrar.

import type { AuthStore } from "../store/authStore";
import type { JogadorStore } from "../store/jogadorStore";
import type { Jogador } from "../domain/jogadores/types";
import type { Perfil } from "../domain/auth/types";
import { mensagemAuth } from "../domain/auth/mensagens";
import { hrefEntrar, hrefConta } from "./rotas-auth";
import { hrefGerenciar } from "./rotas-gerenciar";
import { comBase, hrefPerfilJogador } from "../utils/url";

export interface OpcoesConta {
  store: AuthStore;
  jogadorStore: JogadorStore;
  raiz?: ParentNode;
  irPara?: (url: string) => void;
}

/** Só aceita foto por https (evita esquemas estranhos em <img src>). */
export function avatarSeguro(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export async function iniciarConta(opcoes: OpcoesConta): Promise<void> {
  const { store, jogadorStore } = opcoes;
  const raiz = opcoes.raiz ?? document;
  const irPara = opcoes.irPara ?? ((url: string) => window.location.replace(url));
  const q = <T extends HTMLElement>(sel: string) => raiz.querySelector<T>(sel);

  const estado = q("[data-conta-estado]");
  const conteudo = q("[data-conta-conteudo]");

  const sessao = await store.sessaoAtual();
  if (!sessao.ok) {
    if (estado) estado.textContent = mensagemAuth(sessao.erro);
    return;
  }
  if (!sessao.valor) {
    if (estado) estado.textContent = "Redirecionando para o login…";
    irPara(hrefEntrar(hrefConta()));
    return;
  }

  const [perfilR, adminR, jogadoresR] = await Promise.all([
    store.meuPerfil(),
    store.eAdmin(),
    jogadorStore.listar(),
  ]);
  if (!perfilR.ok || !perfilR.valor) {
    if (estado) estado.textContent = mensagemAuth(perfilR.ok ? { code: "FALHA_LEITURA" } : perfilR.erro);
    return;
  }

  let perfil: Perfil = perfilR.valor;
  const admin = adminR.ok && adminR.valor;
  const jogadores: Jogador[] = jogadoresR.ok ? jogadoresR.valor : [];

  // ---- Dados da conta ----
  const nome = q("[data-conta-nome]");
  if (nome) nome.textContent = perfil.nome ?? sessao.valor.email ?? "Minha conta";
  const email = q("[data-conta-email]");
  if (email) email.textContent = sessao.valor.email ?? "";
  const papel = q("[data-conta-papel]");
  if (papel) papel.textContent = admin ? "Administrador" : "Conta comum";

  const foto = avatarSeguro(perfil.avatarUrl);
  const avatar = q<HTMLImageElement>("[data-conta-avatar]");
  if (avatar && foto) {
    avatar.src = foto;
    avatar.hidden = false;
  }

  const linkGerenciar = q<HTMLAnchorElement>("[data-conta-gerenciar]");
  if (linkGerenciar && admin) {
    linkGerenciar.href = hrefGerenciar();
    linkGerenciar.hidden = false;
  }

  // ---- Vínculo com jogador ----
  const seletor = q<HTMLSelectElement>("[data-vinculo-select]");
  const botaoVincular = q<HTMLButtonElement>("[data-vincular]");
  const botaoDesvincular = q<HTMLButtonElement>("[data-desvincular]");
  const atual = q("[data-vinculo-atual]");
  const msg = q("[data-vinculo-msg]");
  const formVinculo = q("[data-vinculo-form]");

  if (seletor) {
    seletor.textContent = "";
    const vazio = document.createElement("option");
    vazio.value = "";
    vazio.textContent = "Escolha um jogador";
    seletor.append(vazio);
    for (const j of jogadores) {
      const o = document.createElement("option");
      o.value = j.id;
      o.textContent = j.apelido ? `${j.nome} (${j.apelido})` : j.nome;
      seletor.append(o);
    }
  }

  const desenharVinculo = () => {
    const vinculado = perfil.jogadorId ? jogadores.find((j) => j.id === perfil.jogadorId) : null;
    if (atual) {
      atual.textContent = "";
      if (perfil.jogadorId) {
        atual.append("Vinculada ao jogador ");
        if (vinculado) {
          const a = document.createElement("a");
          a.href = hrefPerfilJogador(vinculado.id);
          a.textContent = vinculado.nome;
          atual.append(a, ".");
        } else {
          atual.append("cadastrado (perfil arquivado ou indisponível).");
        }
      } else {
        atual.textContent = "Sua conta ainda não está vinculada a nenhum jogador.";
      }
    }
    if (formVinculo) formVinculo.hidden = perfil.jogadorId !== null;
    if (botaoDesvincular) botaoDesvincular.hidden = perfil.jogadorId === null;
  };
  desenharVinculo();

  const dizer = (texto: string) => {
    if (msg) msg.textContent = texto;
  };

  botaoVincular?.addEventListener("click", async () => {
    const id = seletor?.value ?? "";
    if (id === "") {
      dizer("Escolha um jogador da lista.");
      return;
    }
    botaoVincular.disabled = true;
    const r = await store.vincularJogador(id);
    botaoVincular.disabled = false;
    if (!r.ok) {
      dizer(mensagemAuth(r.erro));
      return;
    }
    perfil = r.valor;
    dizer("Conta vinculada.");
    desenharVinculo();
  });

  botaoDesvincular?.addEventListener("click", async () => {
    botaoDesvincular.disabled = true;
    const r = await store.desvincularJogador();
    botaoDesvincular.disabled = false;
    if (!r.ok) {
      dizer(mensagemAuth(r.erro));
      return;
    }
    perfil = r.valor;
    dizer("Vínculo removido.");
    desenharVinculo();
  });

  q<HTMLButtonElement>("[data-sair]")?.addEventListener("click", async () => {
    const r = await store.sair();
    if (!r.ok) {
      dizer(mensagemAuth(r.erro));
      return;
    }
    irPara(comBase("/"));
  });

  if (estado) estado.hidden = true;
  if (conteudo) conteudo.hidden = false;
}
