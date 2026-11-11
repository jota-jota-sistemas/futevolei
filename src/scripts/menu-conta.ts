// src/scripts/menu-conta.ts
//
// Atualiza os itens de conta do cabeçalho conforme o login:
//   visitante -> "Entrar" (já vem no HTML estático);
//   logado    -> "Minha conta";
//   admin     -> "Gerenciar" + "Minha conta".
// Os itens públicos (Eventos, Jogadores) nunca mudam. Para quem nunca entrou
// não carrega o SDK do Supabase: só olha se há sessão salva no navegador.

import { itensConta, temSessaoSalva, type EstadoConta } from "../utils/menu";
import { hrefEntrar, hrefConta } from "./rotas-auth";
import { hrefGerenciar } from "./rotas-gerenciar";
import type { AuthStore } from "../store/authStore";

export interface OpcoesMenuConta {
  /** Cria a store só quando preciso (evita carregar o SDK à toa). */
  criarStore?: () => AuthStore | Promise<AuthStore>;
  raiz?: ParentNode;
  chavesStorage?: () => string[];
  pathname?: string;
}

function chavesDoLocalStorage(): string[] {
  try {
    return Object.keys(window.localStorage);
  } catch {
    return [];
  }
}

function desenhar(
  contenedor: HTMLElement,
  modelo: HTMLAnchorElement,
  estado: EstadoConta,
  pathname: string
): void {
  const itens = itensConta(estado, {
    entrar: hrefEntrar(),
    conta: hrefConta(),
    gerenciar: hrefGerenciar(),
  });
  contenedor.textContent = "";
  for (const item of itens) {
    // Clona o link estático: mantém o atributo de escopo dos estilos do Astro.
    const a = modelo.cloneNode(false) as HTMLAnchorElement;
    a.removeAttribute("aria-current");
    a.href = item.href;
    if (item.rotuloCurto) {
      // Dois rótulos; o CSS do cabeçalho mostra só um conforme a largura.
      const longo = document.createElement("span");
      longo.className = "header__rot-longo";
      longo.textContent = item.rotulo;
      const curto = document.createElement("span");
      curto.className = "header__rot-curto";
      curto.textContent = item.rotuloCurto;
      a.append(longo, curto);
    } else {
      a.textContent = item.rotulo;
    }
    if (item.secundario) a.classList.add("header__link--secundario");
    if (pathname.replace(/\/+$/, "") === item.href.replace(/\/+$/, "")) {
      a.setAttribute("aria-current", "page");
    }
    contenedor.append(a);
  }
}

export async function iniciarMenuConta(opcoes: OpcoesMenuConta = {}): Promise<void> {
  const raiz = opcoes.raiz ?? document;
  const contenedor = raiz.querySelector<HTMLElement>("[data-menu-conta]");
  if (!contenedor) return;
  const pathname = opcoes.pathname ?? window.location.pathname;
  const modelo = contenedor.querySelector<HTMLAnchorElement>("a");
  if (!modelo) return;

  // Nunca entrou neste navegador: mantém o "Entrar" estático, sem carregar o SDK.
  const chaves = (opcoes.chavesStorage ?? chavesDoLocalStorage)();
  if (!temSessaoSalva(chaves)) return;

  try {
    const criar =
      opcoes.criarStore ??
      (async () => (await import("../store/authStore")).criarAuthStoreBrowser());
    const store = await criar();

    const aplicar = async (logado: boolean) => {
      if (!logado) {
        desenhar(contenedor, modelo, "visitante", pathname);
        return;
      }
      desenhar(contenedor, modelo, "logado", pathname);
      const admin = await store.eAdmin();
      if (admin.ok && admin.valor) desenhar(contenedor, modelo, "admin", pathname);
    };

    const sessao = await store.sessaoAtual();
    await aplicar(sessao.ok && sessao.valor !== null);
    store.aoMudarSessao((nova) => void aplicar(nova !== null));
  } catch {
    /* o cabeçalho continua com o "Entrar" estático */
  }
}
