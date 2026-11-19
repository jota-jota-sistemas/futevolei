// src/scripts/campeonato-duplicar.ts
//
// "Duplicar" na edição do campeonato: cria um campeonato novo com os mesmos
// dados e (opcionalmente) as mesmas categorias, sem duplas nem placares. Pensado
// para eventos que se repetem todo ano: nome e datas já vêm sugeridos (52 semanas
// depois, mesmo dia da semana) e, depois de criar, vai direto à edição do novo.
//
// Contrato de DOM (data-*), dentro de `raiz` (ver components/CampeonatoPerfil.astro):
//   [data-duplicar-form] com os campos nome, data, dataFim e copiarCategorias
//   [data-duplicar-erro] · [data-duplicar-enviar]

import type { CampeonatoRegistro } from "../domain/campeonatos/types";
import { mensagemDoErro } from "../domain/campeonatos/mensagens";
import { dadosDaCopia, nomeDaCopia, sugerirDatasDaCopia } from "../domain/campeonatos/progresso";
import { validarCampeonatoTodos } from "../domain/campeonatos/validation";
import { mensagemDoErro as mensagemCategoria } from "../domain/categorias/mensagens";
import type { CampeonatoStore } from "../store/campeonatoStore";
import type { CategoriaStore } from "../store/categoriaStore";
import { hrefGerenciarCampeonato } from "./rotas-gerenciar";

/** Campeonato de origem de cada formulário (atualizado quando a edição recarrega). */
const origens = new WeakMap<HTMLFormElement, CampeonatoRegistro>();

export interface DepsDuplicar {
  store: CampeonatoStore;
  categoriaStore: CategoriaStore;
  /** O campeonato a duplicar (como está agora). */
  campeonato: CampeonatoRegistro;
  raiz?: ParentNode;
  /** Navegação depois de criar (padrão: `window.location.assign`). */
  irPara?: (url: string) => void;
  /** Link da edição de um campeonato. */
  hrefEditar?: (id: string) => string;
}

export function iniciarDuplicar({
  store,
  categoriaStore,
  campeonato,
  raiz = document,
  irPara = (url: string) => window.location.assign(url),
  hrefEditar = hrefGerenciarCampeonato,
}: DepsDuplicar): void {
  const form = raiz.querySelector<HTMLFormElement>("[data-duplicar-form]");
  if (!form) return;
  const campo = (nome: string) => form.querySelector<HTMLInputElement>(`[name="${nome}"]`);
  const erro = raiz.querySelector<HTMLElement>("[data-duplicar-erro]");
  const botao = form.querySelector<HTMLButtonElement>("[data-duplicar-enviar]");

  // Sugestões (sempre atualiza: a edição acabou de carregar/salvar o campeonato).
  const datas = sugerirDatasDaCopia(campeonato);
  const nome = campo("nome");
  const data = campo("data");
  const dataFim = campo("dataFim");
  if (nome) nome.value = nomeDaCopia(campeonato.nome);
  if (data) data.value = datas.data;
  if (dataFim) dataFim.value = datas.dataFim;

  // Os ouvintes entram uma vez só, mesmo que a edição recarregue; a origem se atualiza.
  const jaLigado = origens.has(form);
  origens.set(form, campeonato);
  if (jaLigado) return;

  function mostrarErro(texto: string, link?: { rotulo: string; href: string }): void {
    if (!erro) return;
    erro.textContent = texto;
    if (link) {
      const a = document.createElement("a");
      a.href = link.href;
      a.textContent = link.rotulo;
      erro.append(" ", a);
    }
    erro.hidden = texto === "";
  }

  form.addEventListener("submit", (evento) => {
    evento.preventDefault();
    void (async () => {
      mostrarErro("");
      const origem = origens.get(form) ?? campeonato;
      const entrada = dadosDaCopia(origem, {
        nome: campo("nome")?.value ?? "",
        data: campo("data")?.value ?? "",
        dataFim: campo("dataFim")?.value ?? "",
      });

      const erros = validarCampeonatoTodos(entrada);
      if (erros.length > 0) {
        mostrarErro(erros.map((e) => mensagemDoErro(e)).join(" "));
        return;
      }

      if (botao) botao.disabled = true;
      const criado = await store.criar(entrada);
      if (!criado.ok) {
        if (botao) botao.disabled = false;
        mostrarErro(mensagemDoErro(criado.erro));
        return;
      }

      const destino = `${hrefEditar(criado.valor.id)}#categorias`;
      if (campo("copiarCategorias")?.checked) {
        const copia = await categoriaStore.copiarDe(origem.id, criado.valor.id);
        if (!copia.ok) {
          // O campeonato já existe: não perde o trabalho, e a cópia pode ser refeita no novo.
          if (botao) botao.disabled = false;
          mostrarErro(
            `O campeonato foi criado, mas não deu para copiar as categorias (${mensagemCategoria(copia.erro)}) ` +
              "Abra o novo e use “Copiar categorias de outro evento”.",
            { rotulo: "Abrir o novo campeonato", href: destino }
          );
          return;
        }
      }
      irPara(destino);
    })();
  });
}
