// src/scripts/entrar.ts
//
// Tela /entrar: login com Google ou link mágico. Se a pessoa já está logada (ou
// acabou de voltar do Google / do link do e-mail), segue para o destino.
//
// O destino vem de `?volta=` e é validado contra open redirect (caminhoSeguro).

import type { AuthStore } from "../store/authStore";
import { caminhoSeguro } from "../domain/auth/validation";
import { mensagemAuth } from "../domain/auth/mensagens";
import { hrefConta } from "./rotas-auth";

export interface OpcoesEntrar {
  store: AuthStore;
  /** Valor bruto de `?volta=` (null quando ausente). */
  volta: string | null;
  raiz?: ParentNode;
  irPara?: (url: string) => void;
}

export async function iniciarEntrar(opcoes: OpcoesEntrar): Promise<void> {
  const { store } = opcoes;
  const raiz = opcoes.raiz ?? document;
  const irPara = opcoes.irPara ?? ((url: string) => window.location.replace(url));

  const q = <T extends HTMLElement>(sel: string) => raiz.querySelector<T>(sel);
  const estado = q("[data-entrar-estado]");
  const formulario = q("[data-entrar-formulario]");
  const botaoGoogle = q<HTMLButtonElement>("[data-google]");
  const form = q<HTMLFormElement>("[data-form-link]");
  const campo = q<HTMLInputElement>("[data-email]");
  const enviar = q<HTMLButtonElement>("[data-enviar-link]");
  const erro = q("[data-entrar-erro]");
  const sucesso = q("[data-entrar-sucesso]");

  // Destino seguro. `voltaSegura` é repassada ao provedor só quando existe.
  const voltaSegura = caminhoSeguro(opcoes.volta, "");
  const destino = voltaSegura || hrefConta();

  const mostrarErro = (texto: string) => {
    if (sucesso) sucesso.textContent = "";
    if (erro) erro.textContent = texto;
  };
  const mostrarSucesso = (texto: string) => {
    if (erro) erro.textContent = "";
    if (sucesso) sucesso.textContent = texto;
  };

  // Já logado (inclui o retorno do Google/link, que o cliente processa ao iniciar).
  const sessao = await store.sessaoAtual();
  if (sessao.ok && sessao.valor) {
    if (estado) estado.textContent = "Você já está logado. Redirecionando…";
    irPara(destino);
    return;
  }

  store.aoMudarSessao((nova) => {
    if (nova) irPara(destino);
  });

  if (estado) estado.hidden = true;
  if (formulario) formulario.hidden = false;
  if (!sessao.ok) mostrarErro(mensagemAuth(sessao.erro));

  botaoGoogle?.addEventListener("click", async () => {
    botaoGoogle.disabled = true;
    mostrarErro("");
    const r = await store.entrarComGoogle(voltaSegura || undefined);
    // Sucesso: o navegador segue para o Google. Em erro, libera o botão.
    if (!r.ok) {
      mostrarErro(mensagemAuth(r.erro));
      botaoGoogle.disabled = false;
    }
  });

  form?.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    if (!campo || !enviar) return;
    enviar.disabled = true;
    mostrarErro("");
    const email = campo.value;
    const r = await store.entrarComLinkMagico(email, voltaSegura || undefined);
    enviar.disabled = false;
    if (!r.ok) {
      mostrarErro(mensagemAuth(r.erro));
      return;
    }
    mostrarSucesso(
      `Enviamos um link de acesso para ${email.trim().toLowerCase()}. Abra o e-mail e toque no link para entrar.`
    );
  });
}
