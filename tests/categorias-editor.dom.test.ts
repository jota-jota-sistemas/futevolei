// @vitest-environment happy-dom
//
// Editor de categorias da edição do campeonato (lista, Gênero × Nível, avulsa,
// copiar de outro evento). A store é um fake em memória (nenhum Supabase).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { iniciarCategoriasEditor } from "../src/scripts/categorias-editor";
import { mesclarCategorias } from "../src/domain/categorias/validation";
import type { CategoriaItem, ResultadoCategoria } from "../src/domain/categorias/types";
import type { CategoriaStore, ResultadoCriacao } from "../src/store/categoriaStore";

// ---------------------------------------------------------------------------
// Fake da store
// ---------------------------------------------------------------------------

let seq = 0;
class FakeStore implements CategoriaStore {
  itens: Record<string, CategoriaItem[]> = {};
  falharListar = false;
  falharCriar: "FALHA_PERSISTENCIA" | "SEM_PERMISSAO" | null = null;

  constructor(inicial: CategoriaItem[] = []) {
    this.itens["copa-2026"] = inicial;
  }

  listar = vi.fn(async (id: string): Promise<ResultadoCategoria<CategoriaItem[]>> => {
    if (this.falharListar) return { ok: false, erro: { code: "FALHA_LEITURA" } };
    return { ok: true, valor: [...(this.itens[id] ?? [])] };
  });

  criarVarias = vi.fn(async (id: string, nomes: readonly string[]): Promise<ResultadoCategoria<ResultadoCriacao>> => {
    if (this.falharCriar) return { ok: false, erro: { code: this.falharCriar } };
    const atuais = (this.itens[id] ??= []);
    const m = mesclarCategorias(atuais.map((c) => c.nome), nomes);
    const criadas = m.adicionar.map((nome) => ({ id: `n${++seq}`, nome, duplas: 0 }));
    atuais.push(...criadas);
    return { ok: true, valor: { criadas, repetidas: m.repetidas, invalidas: m.invalidas } };
  });

  remover = vi.fn(async (categoriaId: string): Promise<ResultadoCategoria<void>> => {
    for (const id of Object.keys(this.itens)) {
      const c = this.itens[id].find((x) => x.id === categoriaId);
      if (!c) continue;
      if (c.duplas > 0) return { ok: false, erro: { code: "TEM_DUPLAS" } };
      this.itens[id] = this.itens[id].filter((x) => x.id !== categoriaId);
      return { ok: true, valor: undefined };
    }
    return { ok: false, erro: { code: "CATEGORIA_NAO_ENCONTRADA" } };
  });

  copiarDe = vi.fn(async (origem: string, destino: string): Promise<ResultadoCategoria<ResultadoCriacao>> => {
    return this.criarVarias(destino, (this.itens[origem] ?? []).map((c) => c.nome));
  });
}

// ---------------------------------------------------------------------------
// Fixture (contrato data-* de components/CategoriasEditor.astro)
// ---------------------------------------------------------------------------

const GENEROS = ["Masculino", "Feminino", "Misto"];
const NIVEIS = ["Iniciante", "Amador", "Open"];

function montar() {
  document.body.innerHTML = `
    <div data-categorias-editor>
      <p data-cat-estado></p>
      <ul data-cat-lista></ul>
      ${GENEROS.map((g) => `<label><input type="checkbox" data-cat-genero value="${g}"><span>${g}</span></label>`).join("")}
      ${NIVEIS.map((n) => `<label><input type="checkbox" data-cat-nivel value="${n}"><span>${n}</span></label>`).join("")}
      <button type="button" data-cat-gerar disabled>Marque gênero e nível</button>
      <p data-cat-dica hidden></p>
      <form data-cat-form-custom><input name="nome" type="text"><button type="submit">Adicionar</button></form>
      <div data-cat-copiar-bloco hidden>
        <select data-cat-copiar-select><option value="">Escolha</option></select>
        <button type="button" data-cat-copiar disabled>Copiar</button>
      </div>
      <p data-cat-status hidden></p>
    </div>`;
}

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const todos = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));
const tick = () => new Promise((r) => setTimeout(r, 0));
const marcar = (sel: string, valor: string, marcado = true) => {
  const el = todos(sel).find((e) => (e as HTMLInputElement).value === valor) as HTMLInputElement;
  el.checked = marcado;
  el.dispatchEvent(new Event("change"));
};
const nomes = () => todos("[data-cat-lista] .cat-item__nome").map((e) => e.textContent);
const status = () => $("[data-cat-status]");
const gerar = () => $<HTMLButtonElement>("[data-cat-gerar]");

const iniciar = (store: FakeStore, extra: Parameters<typeof iniciarCategoriasEditor>[0] extends infer T ? Partial<T> : never = {}) =>
  iniciarCategoriasEditor({ store, campeonatoId: "copa-2026", ...extra });

describe("editor de categorias", () => {
  beforeEach(montar);

  it("lista as categorias do evento com a contagem de duplas e esconde o aviso de vazio", async () => {
    const store = new FakeStore([
      { id: "a", nome: "Open", duplas: 0 },
      { id: "b", nome: "Master", duplas: 3 },
    ]);
    await iniciar(store);
    expect(store.listar).toHaveBeenCalledWith("copa-2026");
    expect(nomes()).toEqual(["Open", "Master"]);
    expect(todos("[data-cat-lista] .cat-item__duplas").map((e) => e.textContent)).toEqual(["sem duplas", "3 duplas"]);
    expect($("[data-cat-estado]").hidden).toBe(true);
  });

  it("sem categorias: explica como criar (nada de 'criadas na organização')", async () => {
    await iniciar(new FakeStore());
    expect($("[data-cat-estado]").hidden).toBe(false);
    expect($("[data-cat-estado]").textContent).toContain("Marque gênero e nível");
    expect(document.body.textContent).not.toContain("criadas na organização");
  });

  it("falha de leitura: mostra a mensagem e não lança", async () => {
    const store = new FakeStore();
    store.falharListar = true;
    await iniciar(store);
    expect($("[data-cat-estado]").textContent).toContain("Não foi possível carregar");
  });

  describe("Gênero × Nível", () => {
    it("o botão mostra quantas categorias serão criadas (e fica desabilitado sem seleção)", async () => {
      await iniciar(new FakeStore());
      expect(gerar().disabled).toBe(true);
      marcar("[data-cat-genero]", "Masculino");
      expect(gerar().disabled).toBe(true); // falta o nível
      marcar("[data-cat-nivel]", "Iniciante");
      expect(gerar().textContent).toBe("Adicionar 1 categoria");
      marcar("[data-cat-genero]", "Feminino");
      marcar("[data-cat-nivel]", "Open");
      expect(gerar().textContent).toBe("Adicionar 4 categorias");
      expect(gerar().disabled).toBe(false);
    });

    it("cria o produto em UMA chamada, atualiza a lista, limpa os chips e avisa", async () => {
      const store = new FakeStore();
      await iniciar(store);
      marcar("[data-cat-genero]", "Masculino");
      marcar("[data-cat-genero]", "Feminino");
      marcar("[data-cat-nivel]", "Iniciante");
      marcar("[data-cat-nivel]", "Open");
      gerar().click();
      await tick();
      expect(store.criarVarias).toHaveBeenCalledTimes(1);
      expect(store.criarVarias.mock.calls[0][1]).toEqual([
        "Masculino Iniciante",
        "Masculino Open",
        "Feminino Iniciante",
        "Feminino Open",
      ]);
      expect(nomes()).toHaveLength(4);
      expect(todos("[data-cat-genero]:checked, [data-cat-nivel]:checked")).toHaveLength(0);
      expect(status().textContent).toBe("4 categorias criadas.");
      expect(gerar().disabled).toBe(true);
    });

    it("o que já existe é descontado (botão e dica) e informado depois de criar", async () => {
      const store = new FakeStore([{ id: "a", nome: "Masculino Open", duplas: 0 }]);
      await iniciar(store);
      marcar("[data-cat-genero]", "Masculino");
      marcar("[data-cat-nivel]", "Iniciante");
      marcar("[data-cat-nivel]", "Open");
      expect(gerar().textContent).toBe("Adicionar 1 categoria");
      expect($("[data-cat-dica]").hidden).toBe(false);
      expect($("[data-cat-dica]").textContent).toContain("já existe");
      gerar().click();
      await tick();
      expect(status().textContent).toBe("1 categoria criada. 1 já existia.");
    });

    it("tudo já existe: botão desabilitado com a explicação", async () => {
      await iniciar(new FakeStore([{ id: "a", nome: "Masculino Open", duplas: 0 }]));
      marcar("[data-cat-genero]", "Masculino");
      marcar("[data-cat-nivel]", "Open");
      expect(gerar().textContent).toBe("Todas já existem");
      expect(gerar().disabled).toBe(true);
    });

    it("falha ao criar: mensagem de erro e a lista não muda", async () => {
      const store = new FakeStore();
      store.falharCriar = "SEM_PERMISSAO";
      await iniciar(store);
      marcar("[data-cat-genero]", "Misto");
      marcar("[data-cat-nivel]", "Amador");
      gerar().click();
      await tick();
      expect(status().dataset.tipo).toBe("erro");
      expect(status().textContent).toBe("Você não gerencia este campeonato.");
      expect(nomes()).toEqual([]);
    });
  });

  describe("categoria avulsa", () => {
    const enviar = (valor: string) => {
      const campo = $<HTMLInputElement>('[data-cat-form-custom] [name="nome"]');
      campo.value = valor;
      $("[data-cat-form-custom]").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    };

    it("adiciona, limpa o campo e mostra na lista", async () => {
      const store = new FakeStore();
      await iniciar(store);
      enviar("  Kids   10+ ");
      await tick();
      expect(store.criarVarias).toHaveBeenCalledWith("copa-2026", ["  Kids   10+ "]);
      expect(nomes()).toEqual(["Kids 10+"]);
      expect($<HTMLInputElement>('[data-cat-form-custom] [name="nome"]').value).toBe("");
    });

    it("repetida e inválida: mensagem de erro clara, o campo é mantido", async () => {
      const store = new FakeStore([{ id: "a", nome: "Open", duplas: 0 }]);
      await iniciar(store);
      enviar("open");
      await tick();
      expect(status().dataset.tipo).toBe("erro");
      expect(status().textContent).toBe("Essa categoria já existe.");
      enviar("###");
      await tick();
      expect(status().textContent).toContain("1 a 60 caracteres");
      expect($<HTMLInputElement>('[data-cat-form-custom] [name="nome"]').value).toBe("###");
    });
  });

  describe("remover", () => {
    it("sem duplas: remove da lista e avisa", async () => {
      const store = new FakeStore([{ id: "a", nome: "Open", duplas: 0 }, { id: "b", nome: "Master", duplas: 0 }]);
      await iniciar(store);
      const botao = todos(".cat-item__remover")[0] as HTMLButtonElement;
      expect(botao.getAttribute("aria-label")).toBe("Remover categoria Open");
      botao.click();
      await tick();
      expect(store.remover).toHaveBeenCalledWith("a");
      expect(nomes()).toEqual(["Master"]);
      expect(status().textContent).toBe("Categoria Open removida.");
    });

    it("com duplas: o botão vem desabilitado e explica por quê (nada é chamado)", async () => {
      const store = new FakeStore([{ id: "a", nome: "Open", duplas: 2 }]);
      await iniciar(store);
      const botao = $<HTMLButtonElement>(".cat-item__remover");
      expect(botao.disabled).toBe(true);
      expect(botao.title).toContain("Remova as duplas");
      expect(botao.getAttribute("aria-label")).toContain("tem duplas inscritas");
      botao.click();
      expect(store.remover).not.toHaveBeenCalled();
    });

    it("ganhou duplas em outra aba (TEM_DUPLAS): mensagem e a contagem é atualizada", async () => {
      const store = new FakeStore([{ id: "a", nome: "Open", duplas: 0 }]);
      await iniciar(store);
      store.itens["copa-2026"][0].duplas = 1; // outra aba inscreveu uma dupla
      $<HTMLButtonElement>(".cat-item__remover").click();
      await tick();
      expect(status().dataset.tipo).toBe("erro");
      expect(status().textContent).toContain("já tem duplas inscritas");
      expect($(".cat-item__duplas").textContent).toBe("1 dupla");
      expect($<HTMLButtonElement>(".cat-item__remover").disabled).toBe(true);
    });
  });

  describe("copiar de outro evento", () => {
    it("sem outros eventos o bloco continua oculto; com eles lista só os outros (não o próprio)", async () => {
      await iniciar(new FakeStore(), { listarEventos: async () => [{ id: "copa-2026", nome: "Esta" }] });
      await tick();
      expect($("[data-cat-copiar-bloco]").hidden).toBe(true);

      montar();
      await iniciar(new FakeStore(), {
        listarEventos: async () => [
          { id: "copa-2026", nome: "Esta" },
          { id: "velha-2025", nome: "Copa 2025" },
        ],
      });
      await tick();
      expect($("[data-cat-copiar-bloco]").hidden).toBe(false);
      expect(todos("[data-cat-copiar-select] option").map((o) => o.textContent)).toEqual(["Escolha", "Copa 2025"]);
    });

    it("copia só os nomes que faltam e mostra o resumo", async () => {
      const store = new FakeStore([{ id: "a", nome: "Open", duplas: 0 }]);
      store.itens["velha-2025"] = [
        { id: "x", nome: "Open", duplas: 5 },
        { id: "y", nome: "Master", duplas: 5 },
      ];
      await iniciar(store, { listarEventos: async () => [{ id: "velha-2025", nome: "Copa 2025" }] });
      await tick();
      const select = $<HTMLSelectElement>("[data-cat-copiar-select]");
      const botao = $<HTMLButtonElement>("[data-cat-copiar]");
      expect(botao.disabled).toBe(true);
      select.value = "velha-2025";
      select.dispatchEvent(new Event("change"));
      expect(botao.disabled).toBe(false);
      botao.click();
      await tick();
      expect(store.copiarDe).toHaveBeenCalledWith("velha-2025", "copa-2026");
      expect(nomes().sort()).toEqual(["Master", "Open"]);
      expect(status().textContent).toBe("1 categoria copiada. 1 já existia.");
      // As duplas do evento de origem NÃO vêm junto (só os nomes).
      expect(todos(".cat-item__duplas").every((e) => e.textContent === "sem duplas")).toBe(true);
    });

    it("nada novo para copiar: aviso", async () => {
      const store = new FakeStore([{ id: "a", nome: "Open", duplas: 0 }]);
      store.itens["velha-2025"] = [{ id: "x", nome: "Open", duplas: 0 }];
      await iniciar(store, { listarEventos: async () => [{ id: "velha-2025", nome: "Copa 2025" }] });
      await tick();
      $<HTMLSelectElement>("[data-cat-copiar-select]").value = "velha-2025";
      $<HTMLSelectElement>("[data-cat-copiar-select]").dispatchEvent(new Event("change"));
      $<HTMLButtonElement>("[data-cat-copiar]").click();
      await tick();
      expect(status().dataset.tipo).toBe("erro");
      expect(status().textContent).toContain("já tem todas");
    });
  });

  it("avisa a quantidade de categorias a cada mudança", async () => {
    const aoMudar = vi.fn();
    const store = new FakeStore();
    await iniciar(store, { aoMudar });
    expect(aoMudar).toHaveBeenLastCalledWith(0);
    marcar("[data-cat-genero]", "Misto");
    marcar("[data-cat-nivel]", "Open");
    gerar().click();
    await tick();
    expect(aoMudar).toHaveBeenLastCalledWith(1);
  });

  it("nomes de categoria são exibidos como texto (sem HTML)", async () => {
    await iniciar(new FakeStore([{ id: "a", nome: "<img src=x onerror=alert(1)>", duplas: 0 }]));
    expect(document.querySelector("[data-cat-lista] img")).toBeNull();
    expect(nomes()[0]).toBe("<img src=x onerror=alert(1)>");
  });
});
