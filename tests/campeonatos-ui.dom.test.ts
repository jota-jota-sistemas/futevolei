// @vitest-environment happy-dom
//
// Feature: gerenciar campeonatos (eventos): integração das telas no DOM.
// Cobre /gerenciar_campeonatos (lista, busca, arquivados, cadastro) e
// /gerenciar_campeonatos/editar (carregar, editar, arquivar, excluir). A store é
// um fake em memória (nenhum Supabase); o fixture replica o contrato data-* dos
// componentes.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  CampeonatoDetalhe,
  CampeonatoDono,
  CampeonatoRegistro,
  ResultadoCampeonato,
} from "../src/domain/campeonatos/types";
import { validarCampeonato } from "../src/domain/campeonatos/validation";
import type { CampeonatoStore, DestinoExclusaoCampeonato } from "../src/store/campeonatoStore";
import { iniciarLista } from "../src/scripts/campeonatos-lista";
import { iniciarEdicao } from "../src/scripts/campeonato-editar";

// ---------------------------------------------------------------------------
// Fake da store
// ---------------------------------------------------------------------------

function camp(p: Partial<CampeonatoDetalhe> & { id: string; nome: string }): CampeonatoDetalhe {
  return {
    data: "2026-12-05",
    dataFim: null,
    cidade: null,
    uf: null,
    endereco: null,
    preco: null,
    precoTexto: null,
    inscricao: null,
    instagram: null,
    descricao: null,
    listado: true,
    ativo: true,
    fonte: "manual",
    criadoEm: "2026-01-01T00:00:00.000Z",
    atualizadoEm: "2026-01-01T00:00:00.000Z",
    categorias: [],
    ...p,
  };
}

const naoEncontrado = (): ResultadoCampeonato<never> => ({
  ok: false,
  erro: { code: "CAMPEONATO_NAO_ENCONTRADO" },
});

const semCategorias = ({ categorias: _c, ...registro }: CampeonatoDetalhe): CampeonatoRegistro => registro;

class FakeStore implements CampeonatoStore {
  itens: CampeonatoDetalhe[];
  falharListar = 0; // nº de próximas chamadas de listar que falham
  falharObter = false;
  falharCriar = false;

  constructor(itens: CampeonatoDetalhe[] = []) {
    this.itens = itens;
  }

  listar = vi.fn(async (opcoes?: { incluirArquivados?: boolean }): Promise<ResultadoCampeonato<CampeonatoRegistro[]>> => {
    if (this.falharListar > 0) {
      this.falharListar--;
      return { ok: false, erro: { code: "FALHA_LEITURA" } };
    }
    const base = opcoes?.incluirArquivados ? this.itens : this.itens.filter((c) => c.ativo);
    return { ok: true, valor: base.map(semCategorias) };
  });

  obter = vi.fn(async (id: string): Promise<ResultadoCampeonato<CampeonatoDetalhe>> => {
    if (this.falharObter) return { ok: false, erro: { code: "FALHA_LEITURA" } };
    const c = this.itens.find((x) => x.id === id);
    return c ? { ok: true, valor: c } : naoEncontrado();
  });

  criar = vi.fn(async (entrada: Parameters<CampeonatoStore["criar"]>[0]): Promise<ResultadoCampeonato<CampeonatoRegistro>> => {
    const v = validarCampeonato(entrada);
    if (!v.ok) return v;
    if (this.falharCriar) return { ok: false, erro: { code: "FALHA_PERSISTENCIA" } };
    const novo = camp({ id: `novo-${this.itens.length + 1}`, ...v.valor });
    this.itens.push(novo);
    return { ok: true, valor: semCategorias(novo) };
  });

  atualizar = vi.fn(async (id: string, entrada: Parameters<CampeonatoStore["atualizar"]>[1]): Promise<ResultadoCampeonato<CampeonatoRegistro>> => {
    const v = validarCampeonato(entrada);
    if (!v.ok) return v;
    const i = this.itens.findIndex((x) => x.id === id);
    if (i < 0) return naoEncontrado();
    this.itens[i] = { ...this.itens[i], ...v.valor };
    return { ok: true, valor: semCategorias(this.itens[i]) };
  });

  definirAtivo = vi.fn(async (id: string, ativo: boolean): Promise<ResultadoCampeonato<CampeonatoRegistro>> => {
    const i = this.itens.findIndex((x) => x.id === id);
    if (i < 0) return naoEncontrado();
    this.itens[i] = { ...this.itens[i], ativo };
    return { ok: true, valor: semCategorias(this.itens[i]) };
  });

  /** Donos por campeonato (id -> e-mails). */
  donos: Record<string, string[]> = {};
  falharDonos = false;
  /** e-mails que já são organizadores (os únicos que podem ser donos). */
  organizadores: string[] = ["ana@x.com", "bia@x.com", "novo@x.com"];
  /** Quando true, simula o trigger do banco: não remove o último dono. */
  protegerUltimoDono = false;

  listarDonos = vi.fn(async (id: string): Promise<ResultadoCampeonato<CampeonatoDono[]>> => {
    if (this.falharDonos) return { ok: false, erro: { code: "FALHA_LEITURA" } };
    return { ok: true, valor: (this.donos[id] ?? []).map((email) => ({ email, criadoEm: "2026-01-01T00:00:00.000Z" })) };
  });

  adicionarDono = vi.fn(async (id: string, email: string): Promise<ResultadoCampeonato<CampeonatoDono>> => {
    const e = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { ok: false, erro: { code: "EMAIL_INVALIDO" } };
    if (!this.organizadores.includes(e)) return { ok: false, erro: { code: "NAO_ORGANIZADOR" } };
    const atuais = (this.donos[id] ??= []);
    if (!atuais.includes(e)) atuais.push(e);
    return { ok: true, valor: { email: e, criadoEm: "2026-01-01T00:00:00.000Z" } };
  });

  removerDono = vi.fn(async (id: string, email: string): Promise<ResultadoCampeonato<void>> => {
    const atuais = this.donos[id] ?? [];
    if (this.protegerUltimoDono && atuais.length <= 1) return { ok: false, erro: { code: "ULTIMO_DONO" } };
    this.donos[id] = atuais.filter((e) => e !== email);
    return { ok: true, valor: undefined };
  });

  /** ids que a conta (organizador) gerencia como dona. */
  meusIds: string[] = [];
  falharPosse = false;

  listarMeus = vi.fn(async (opcoes?: { incluirArquivados?: boolean }): Promise<ResultadoCampeonato<CampeonatoRegistro[]>> => {
    if (this.falharListar > 0) {
      this.falharListar--;
      return { ok: false, erro: { code: "FALHA_LEITURA" } };
    }
    const base = this.itens.filter((c) => this.meusIds.includes(c.id) && (opcoes?.incluirArquivados || c.ativo));
    return { ok: true, valor: base.map(semCategorias) };
  });

  podeGerenciar = vi.fn(async (id: string): Promise<ResultadoCampeonato<boolean>> => {
    if (this.falharPosse) return { ok: false, erro: { code: "FALHA_LEITURA" } };
    return { ok: true, valor: this.meusIds.includes(id) };
  });

  contarCategorias = vi.fn(async (id: string): Promise<ResultadoCampeonato<number>> => {
    const c = this.itens.find((x) => x.id === id);
    return c ? { ok: true, valor: c.categorias.length } : naoEncontrado();
  });

  excluir = vi.fn(async (id: string): Promise<ResultadoCampeonato<DestinoExclusaoCampeonato>> => {
    const c = this.itens.find((x) => x.id === id);
    if (!c) return naoEncontrado();
    if (c.categorias.length > 0) {
      await this.definirAtivo(id, false);
      return { ok: true, valor: "arquivado" };
    }
    this.itens = this.itens.filter((x) => x.id !== id);
    return { ok: true, valor: "excluido" };
  });
}

// ---------------------------------------------------------------------------
// Fixtures (contrato data-* de components/CampeonatoForm.astro e das páginas)
// ---------------------------------------------------------------------------

const campoTexto = (nome: string) => `<input name="${nome}" type="text" /><p data-erro="${nome}" hidden></p>`;

const FORM = `
  <form data-campeonato-form novalidate>
    ${campoTexto("nome")}
    <input name="data" type="date" /><p data-erro="data" hidden></p>
    <details data-detalhes>
      <summary><span>Mais detalhes</span> <span data-detalhes-resumo></span></summary>
      <input name="dataFim" type="date" /><p data-erro="dataFim" hidden></p>
      ${campoTexto("cidade")}
      <select name="uf"><option value="">—</option><option value="SP">SP</option><option value="RJ">RJ</option></select>
      <p data-erro="uf" hidden></p>
      ${campoTexto("endereco")}
      ${campoTexto("preco")}
      <input type="checkbox" name="precoAConfirmar" />
      ${campoTexto("inscricao")}
      ${campoTexto("instagram")}
      <textarea name="descricao"></textarea><p data-erro="descricao" hidden></p>
      <input type="checkbox" name="listado" checked />
    </details>
    <p data-status hidden></p>
    <button type="submit" data-enviar>Enviar</button>
  </form>`;

const montarLista = () => {
  document.body.innerHTML = `
    <input type="search" data-busca />
    <div data-filtros-estado></div>
    <p data-contador-campeonatos></p>
    <p data-estado-lista></p>
    <ul data-lista></ul>
    ${FORM}`;
};

const montarEdicao = () => {
  document.body.innerHTML = `
    <p data-estado-perfil></p>
    <div data-perfil hidden>
      <p data-perfil-nome></p><p data-perfil-periodo></p><p data-perfil-local hidden></p>
      <div data-perfil-chips></div>
      <p data-donos-estado hidden></p><ul data-donos-lista></ul>
      <form data-donos-form novalidate>
        <input name="email" type="email" /><button type="submit" data-donos-adicionar>Adicionar</button>
      </form>
      <p data-donos-status hidden></p>
      <a data-organizar-link href="#">Organizar</a>
      <button type="button" data-arquivar>Arquivar campeonato</button>
      <button type="button" data-excluir>Excluir campeonato</button>
      <div data-confirmacao-exclusao hidden>
        <p data-confirmacao-texto></p>
        <button type="button" data-confirmar-exclusao>Excluir de vez</button>
        <button type="button" data-cancelar-exclusao>Cancelar</button>
      </div>
      <p data-acoes-status hidden></p>
      ${FORM}
    </div>`;
};

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const todos = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));
const campo = (nome: string) => $<HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement>(`[name="${nome}"]`);
const preencher = (nome: string, valor: string) => { campo(nome).value = valor; };
const enviar = () =>
  $("[data-campeonato-form]").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
const enviarDono = () => $("[data-donos-form]").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
const emailDono = () => $<HTMLInputElement>('[data-donos-form] [name="email"]');
const donosNaLista = () => todos("[data-donos-lista] .pf-dono__email").map((e) => e.textContent);
const clicar = (sel: string) => $<HTMLButtonElement>(sel).click();
const tick = () => new Promise((r) => setTimeout(r, 0));
const digitarBusca = (texto: string) => {
  const b = $<HTMLInputElement>("[data-busca]");
  b.value = texto;
  b.dispatchEvent(new Event("input"));
};
const nomesNaLista = () => todos(".cl-item .cl-nome").map((e) => e.textContent);
const status = () => $("[data-status]");
const erroDe = (nome: string) => $(`[data-erro="${nome}"]`);

// ===========================================================================
// /gerenciar_campeonatos
// ===========================================================================

describe("lista de campeonatos (área de gerenciamento)", () => {
  let store: FakeStore;
  beforeEach(() => {
    montarLista();
    store = new FakeStore([
      camp({ id: "copa-2026", nome: "Copa Cabeça", data: "2026-12-05", cidade: "Santos", uf: "SP" }),
      camp({ id: "acai-2026", nome: "Açaí Open", data: "2026-10-01", dataFim: "2026-10-03" }),
      camp({ id: "velho-2025", nome: "Torneio Antigo", data: "2025-05-01", ativo: false }),
      camp({ id: "oculto-2026", nome: "Evento Oculto", data: "2026-11-01", listado: false }),
    ]);
  });

  // "Hoje" fixo: tudo que é ativo está no futuro (Açaí 10/10, Oculto 01/11, Copa 05/12).
  const HOJE = () => "2026-09-01";
  const iniciarL = (extra: Partial<Parameters<typeof iniciarLista>[0]> = {}) =>
    iniciarLista({ store, hoje: HOJE, armazenamento: null, ...extra });
  const chipFiltro = (valor: string) => $<HTMLButtonElement>(`[data-filtros-estado] [data-filtro="${valor}"]`);
  const escolherFiltro = (valor: string) => chipFiltro(valor).click();

  it("carrega todos (inclusive arquivados) e mostra os próximos, do mais perto ao mais longe, com contador", async () => {
    await iniciarL();
    expect(store.listar).toHaveBeenCalledWith({ incluirArquivados: true });
    expect(nomesNaLista()).toEqual(["Açaí Open", "Evento Oculto", "Copa Cabeça"]);
    expect($("[data-contador-campeonatos]").textContent).toBe("3 campeonatos");
    expect($("[data-estado-lista]").hidden).toBe(true);
  });

  it("cada item leva à edição pelo id e mostra período e cidade/UF", async () => {
    await iniciarL();
    const copa = todos(".cl-item").find((a) => a.textContent?.includes("Copa"))!;
    expect(copa.getAttribute("href")).toContain("/gerenciar_campeonatos/editar?id=copa-2026");
    expect(copa.querySelector(".cl-sub")!.textContent).toContain("Santos/SP");
    const acai = todos(".cl-item").find((a) => a.textContent?.includes("Açaí"))!;
    expect(acai.querySelector(".cl-sub")!.textContent).toMatch(/01 a 03 de outubro de 2026/);
  });

  describe("filtros por situação", () => {
    it("chips com a contagem de cada um; 'Próximos' começa marcado", async () => {
      await iniciarL();
      expect(todos("[data-filtros-estado] .cl-filtro").map((b) => b.textContent)).toEqual([
        "Próximos (3)",
        "Passados (0)",
        "Arquivados (1)",
        "Todos (4)",
      ]);
      expect(chipFiltro("proximos").getAttribute("aria-pressed")).toBe("true");
      expect(chipFiltro("passados").getAttribute("aria-pressed")).toBe("false");
    });

    it("'Arquivados' mostra os arquivados com a marca (e só eles)", async () => {
      await iniciarL();
      escolherFiltro("arquivados");
      expect(nomesNaLista()).toEqual(["Torneio Antigo"]);
      const antigo = todos(".cl-item")[0];
      expect(antigo.textContent).toContain("Arquivado");
      expect(chipFiltro("arquivados").getAttribute("aria-pressed")).toBe("true");
      expect($("[data-contador-campeonatos]").textContent).toBe("1 campeonato");
    });

    it("'Todos' junta tudo; filtro vazio explica e aponta para os outros", async () => {
      await iniciarL();
      escolherFiltro("todos");
      expect(nomesNaLista()).toHaveLength(4);
      escolherFiltro("passados");
      expect(nomesNaLista()).toEqual([]);
      expect($("[data-estado-lista]").hidden).toBe(false);
      expect($("[data-estado-lista]").textContent).toContain("Nenhum campeonato em “Passados”");
    });

    it("se não há nenhum próximo, abre em 'Todos' (nunca numa tela vazia)", async () => {
      await iniciarL({ hoje: () => "2027-06-01" }); // tudo já passou
      expect(chipFiltro("todos").getAttribute("aria-pressed")).toBe("true");
      expect(nomesNaLista().length).toBeGreaterThan(0);
    });

    it("a busca vale dentro do filtro escolhido", async () => {
      await iniciarL();
      escolherFiltro("todos");
      digitarBusca("antigo");
      expect(nomesNaLista()).toEqual(["Torneio Antigo"]);
    });

    it("marca 'Hoje' no que está acontecendo (inclusive no meio de um evento de vários dias)", async () => {
      await iniciarL({ hoje: () => "2026-10-02" }); // meio do Açaí (01 a 03/10)
      const acai = todos(".cl-item").find((a) => a.textContent?.includes("Açaí"))!;
      expect(acai.querySelector(".cl-chip--hoje")!.textContent).toBe("Hoje");
      const copa = todos(".cl-item").find((a) => a.textContent?.includes("Copa"))!;
      expect(copa.querySelector(".cl-chip--hoje")).toBeNull();
    });

    it("marca os ocultos na home", async () => {
      await iniciarL();
      const oculto = todos(".cl-item").find((a) => a.textContent?.includes("Oculto"))!;
      expect(oculto.textContent).toContain("Oculto na home");
    });
  });

  describe("ações de cada linha", () => {
    const linhaDe = (parte: string) => todos(".cl-linha").find((li) => li.textContent?.includes(parte))!;

    it("sem o progresso carregado: 'Organizar' e 'Duplicar' em cada campeonato ativo; link de edição sem link dentro de link", async () => {
      await iniciarL();
      const copa = linhaDe("Copa");
      const organizar = copa.querySelector<HTMLAnchorElement>(".cl-organizar")!;
      expect(organizar.getAttribute("href")).toBe("/campeonatos/copa-2026/organizar");
      expect(organizar.textContent).toBe("Organizar");
      expect(organizar.getAttribute("aria-label")).toBe("Organizar Copa Cabeça");
      expect(copa.querySelector(".cl-item")!.getAttribute("href")).toContain("/gerenciar_campeonatos/editar?id=copa-2026");
      expect(copa.querySelector(".cl-item .cl-organizar")).toBeNull();
      const duplicar = copa.querySelector<HTMLAnchorElement>(".cl-duplicar")!;
      expect(duplicar.getAttribute("href")).toBe("/gerenciar_campeonatos/editar?id=copa-2026#duplicar");
      expect(duplicar.getAttribute("aria-label")).toBe("Duplicar Copa Cabeça");
    });

    it("arquivado não tem 'Organizar' (a página não existe), mas pode ser duplicado", async () => {
      await iniciarL();
      escolherFiltro("arquivados");
      const antigo = linhaDe("Antigo");
      expect(antigo.querySelector(".cl-organizar")).toBeNull();
      expect(antigo.querySelector(".cl-duplicar")).not.toBeNull();
    });
  });

  describe("progresso de cada evento", () => {
    const zero = { categorias: 0, duplas: 0, chaveamentos: 0, jogos: 0, concluidos: 0, nomesCategorias: [] as string[] };
    const progressoCom = (valor: Record<string, typeof zero>) => ({
      carregar: vi.fn(async () => ({ ok: true as const, valor })),
    });
    const linhaDe = (parte: string) => todos(".cl-linha").find((li) => li.textContent?.includes(parte))!;

    it("pede o progresso UMA vez, em lote, só dos ativos, e mostra o rótulo na linha", async () => {
      const progressoStore = progressoCom({
        "copa-2026": { ...zero, categorias: 3, duplas: 24, chaveamentos: 3, jogos: 18, concluidos: 5, nomesCategorias: ["A", "B", "C"] },
      });
      await iniciarL({ progressoStore });
      await tick();
      expect(progressoStore.carregar).toHaveBeenCalledTimes(1);
      expect([...progressoStore.carregar.mock.calls[0][0]].sort()).toEqual(["acai-2026", "copa-2026", "oculto-2026"]);
      expect(linhaDe("Copa").querySelector(".cl-progresso")!.textContent).toBe(
        "3 categorias · 24 duplas · chaveamento gerado · 5/18 jogos"
      );
    });

    it("sem categorias: a ação vira 'Criar categorias' e leva direto ao editor de categorias", async () => {
      await iniciarL({ progressoStore: progressoCom({ "copa-2026": zero }) });
      await tick();
      const a = linhaDe("Copa").querySelector<HTMLAnchorElement>(".cl-organizar")!;
      expect(a.textContent).toBe("Criar categorias");
      expect(a.getAttribute("href")).toBe("/gerenciar_campeonatos/editar?id=copa-2026#categorias");
      expect(linhaDe("Copa").querySelector(".cl-progresso")!.textContent).toBe("Sem categorias");
    });

    it("em andamento com UMA categoria: 'Continuar' vai direto à categoria; com várias, ao índice", async () => {
      await iniciarL({
        progressoStore: progressoCom({
          "copa-2026": { ...zero, categorias: 1, duplas: 8, chaveamentos: 1, jogos: 7, concluidos: 2, nomesCategorias: ["Feminino Iniciante"] },
          "acai-2026": { ...zero, categorias: 2, duplas: 8, chaveamentos: 2, jogos: 7, concluidos: 2, nomesCategorias: ["Open", "Master"] },
        }),
      });
      await tick();
      const copa = linhaDe("Copa").querySelector<HTMLAnchorElement>(".cl-organizar")!;
      expect(copa.textContent).toBe("Continuar");
      expect(copa.getAttribute("href")).toBe("/campeonatos/copa-2026/organizar/feminino-iniciante");
      const acai = linhaDe("Açaí").querySelector<HTMLAnchorElement>(".cl-organizar")!;
      expect(acai.textContent).toBe("Continuar");
      expect(acai.getAttribute("href")).toBe("/campeonatos/acai-2026/organizar");
    });

    it("sem duplas ou sem chaveamento: 'Organizar' (ao índice, ou direto à única categoria)", async () => {
      await iniciarL({
        progressoStore: progressoCom({
          "copa-2026": { ...zero, categorias: 1, duplas: 0, nomesCategorias: ["Open"] },
        }),
      });
      await tick();
      const a = linhaDe("Copa").querySelector<HTMLAnchorElement>(".cl-organizar")!;
      expect(a.textContent).toBe("Organizar");
      expect(a.getAttribute("href")).toBe("/campeonatos/copa-2026/organizar/open");
    });

    it("falha ao ler o progresso: a lista continua igual, sem erro na tela", async () => {
      const progressoStore = { carregar: vi.fn(async () => ({ ok: false as const, erro: { code: "FALHA_LEITURA" as const } })) };
      await iniciarL({ progressoStore });
      await tick();
      expect(nomesNaLista()).toHaveLength(3);
      expect($("[data-estado-lista]").hidden).toBe(true);
      expect(document.querySelector(".cl-progresso")).toBeNull();
    });

    it("sem a store de progresso: funciona como antes", async () => {
      await iniciarL();
      await tick();
      expect(nomesNaLista()).toHaveLength(3);
    });
  });

  it("a busca filtra sem acento e mostra 'x de y'; sem resultado mostra o aviso", async () => {
    await iniciarL();
    digitarBusca("acai");
    expect(nomesNaLista()).toEqual(["Açaí Open"]);
    expect($("[data-contador-campeonatos]").textContent).toBe("1 de 3 campeonatos");
    digitarBusca("zzzz");
    expect(nomesNaLista()).toEqual([]);
    expect($("[data-estado-lista]").hidden).toBe(false);
    expect($("[data-estado-lista]").textContent).toContain("Nenhum campeonato encontrado");
  });

  it("sem campeonatos: aviso de lista vazia", async () => {
    store.itens = [];
    await iniciarL();
    expect($("[data-estado-lista]").textContent).toContain("Nenhum campeonato cadastrado");
  });

  it("falha de leitura: mostra o erro e 'Tentar novamente' recarrega", async () => {
    store.falharListar = 1;
    await iniciarL();
    expect($("[data-estado-lista]").textContent).toContain("Não foi possível carregar");
    expect(todos(".cl-item")).toHaveLength(0);
    clicar(".cl-retentar");
    await tick();
    expect(nomesNaLista()).toHaveLength(3);
  });

  it("texto malicioso no nome é exibido como texto (sem HTML)", async () => {
    store.itens.push(camp({ id: "x", nome: "<img src=x onerror=alert(1)>", data: "2027-01-01" }));
    await iniciarL();
    expect(document.querySelector("img")).toBeNull();
    expect(nomesNaLista().at(-1)).toBe("<img src=x onerror=alert(1)>"); // o mais distante vai ao fim
  });

  describe("organizador (apenasMeus)", () => {
    it("lista só os campeonatos dele (listarMeus, nunca listar) e troca o título", async () => {
      document.body.insertAdjacentHTML("beforeend", `<h2 id="lista-campeonatos-titulo">Todos os campeonatos</h2>`);
      store.meusIds = ["acai-2026", "velho-2025"];
      await iniciarL({ apenasMeus: true });
      expect(store.listarMeus).toHaveBeenCalledWith({ incluirArquivados: true });
      expect(store.listar).not.toHaveBeenCalled();
      expect(nomesNaLista()).toEqual(["Açaí Open"]); // o arquivado só com o filtro
      expect($("#lista-campeonatos-titulo").textContent).toBe("Meus campeonatos");
      expect($("[data-contador-campeonatos]").textContent).toBe("1 campeonato");
    });

    it("sem campeonatos dele: aviso próprio", async () => {
      store.meusIds = [];
      await iniciarL({ apenasMeus: true });
      expect($("[data-estado-lista]").textContent).toContain("Você ainda não tem campeonatos");
    });

    it("administrador (padrão) segue vendo todos pela listar", async () => {
      await iniciarL();
      expect(store.listar).toHaveBeenCalled();
      expect(store.listarMeus).not.toHaveBeenCalled();
    });
  });

  describe("cadastro", () => {
    const irPara = vi.fn();
    /** Armazenamento do "último local" em memória (nada de localStorage real entre testes). */
    const memoria = () => {
      const dados = new Map<string, string>();
      return {
        dados,
        getItem: (k: string) => dados.get(k) ?? null,
        setItem: (k: string, v: string) => void dados.set(k, v),
      };
    };
    const iniciarCad = (extra: Partial<Parameters<typeof iniciarLista>[0]> = {}) =>
      iniciarLista({ store, irPara, armazenamento: null, hoje: () => "2026-09-01", ...extra });
    const detalhes = () => $<HTMLDetailsElement>("[data-detalhes]");

    beforeEach(() => irPara.mockClear());

    it("dados inválidos: mostra o erro no campo e NÃO chama a store", async () => {
      await iniciarCad();
      preencher("nome", "  ");
      preencher("data", "2026-12-05");
      enviar();
      await tick();
      expect(store.criar).not.toHaveBeenCalled();
      expect(erroDe("nome").hidden).toBe(false);
      expect(erroDe("nome").textContent).toContain("nome do campeonato");
      expect(campo("nome").getAttribute("aria-invalid")).toBe("true");
      expect(irPara).not.toHaveBeenCalled();
    });

    it("TODOS os erros aparecem de uma vez e o bloco 'Mais detalhes' abre sozinho", async () => {
      await iniciarCad();
      expect(detalhes().open).toBe(false);
      preencher("nome", "");
      preencher("data", "2026-12-05");
      preencher("dataFim", "2026-12-01");
      preencher("inscricao", "movisport");
      enviar();
      await tick();
      expect(store.criar).not.toHaveBeenCalled();
      for (const c of ["nome", "dataFim", "inscricao"]) {
        expect(erroDe(c).hidden, c).toBe(false);
        expect(campo(c).getAttribute("aria-invalid"), c).toBe("true");
      }
      expect(erroDe("data").hidden).toBe(true); // só o que está errado
      expect(detalhes().open).toBe(true);
    });

    it("erro só em campo de dentro do bloco fechado: o bloco abre", async () => {
      await iniciarCad();
      preencher("nome", "Novo");
      preencher("data", "2026-12-05");
      preencher("dataFim", "2026-12-01");
      enviar();
      await tick();
      expect(store.criar).not.toHaveBeenCalled();
      expect(erroDe("dataFim").hidden).toBe(false);
      expect(detalhes().open).toBe(true);
    });

    it("sucesso: entra na lista, limpa o formulário e VAI DIRETO às categorias do evento novo", async () => {
      await iniciarCad();
      preencher("nome", "Copa Nova");
      preencher("data", "2027-02-01");
      preencher("cidade", "Santos");
      preencher("uf", "SP");
      preencher("preco", "160");
      campo("listado").checked = false;
      enviar();
      await tick();

      expect(store.criar).toHaveBeenCalledTimes(1);
      expect(store.criar.mock.calls[0][0]).toMatchObject({
        nome: "Copa Nova", data: "2027-02-01", cidade: "Santos", uf: "SP", preco: "160", precoTexto: "R$ 160,00", listado: false,
      });
      expect(nomesNaLista().at(-1)).toBe("Copa Nova"); // o mais distante vai ao fim
      expect(todos(".cl-item").at(-1)!.textContent).toContain("Oculto na home");
      expect(campo("nome").value).toBe("");
      expect(campo("listado").checked).toBe(true);
      expect(status().textContent).toContain("Copa Nova foi cadastrado");
      expect(irPara).toHaveBeenCalledTimes(1);
      expect(irPara.mock.calls[0][0]).toMatch(/^\/gerenciar_campeonatos\/editar\?id=novo-\d+#categorias$/);
      expect(store.listar).toHaveBeenCalledTimes(1); // sem nova leitura
    });

    it("preço: um campo só (o texto exibível é derivado) e 'Valor a confirmar' sem preço", async () => {
      await iniciarCad();
      preencher("nome", "A");
      preencher("data", "2027-02-01");
      preencher("preco", "1.500,5");
      enviar();
      await tick();
      expect(store.criar.mock.calls[0][0]).toMatchObject({ preco: "1.500,5", precoTexto: "R$ 1.500,50" });

      montarLista();
      await iniciarCad();
      preencher("nome", "B");
      preencher("data", "2027-02-02");
      preencher("preco", "99"); // ignorado: a caixa manda
      (campo("precoAConfirmar") as HTMLInputElement).checked = true;
      enviar();
      await tick();
      expect(store.criar.mock.calls[1][0]).toMatchObject({ preco: "", precoTexto: "Valor a confirmar" });
    });

    it("link de inscrição sem https:// é aceito e gravado com o esquema", async () => {
      await iniciarCad();
      preencher("nome", "Copa");
      preencher("data", "2027-02-01");
      preencher("inscricao", "movisport.pro/copa");
      enviar();
      await tick();
      expect(erroDe("inscricao").hidden).toBe(true);
      expect(store.itens.at(-1)!.inscricao).toBe("https://movisport.pro/copa");
    });

    it("lembra cidade e UF do último evento: o próximo cadastro já vem preenchido", async () => {
      const mem = memoria();
      await iniciarCad({ armazenamento: mem });
      expect(campo("cidade").value).toBe("");
      preencher("nome", "Copa");
      preencher("data", "2027-02-01");
      preencher("cidade", "Santos");
      preencher("uf", "SP");
      enviar();
      await tick();
      expect(JSON.parse(mem.dados.get("pingo:ultimo-local")!)).toEqual({ cidade: "Santos", uf: "SP" });

      montarLista();
      await iniciarCad({ armazenamento: mem });
      expect(campo("cidade").value).toBe("Santos");
      expect(campo("uf").value).toBe("SP");
      // O resumo ao lado de "Mais detalhes" mostra o que está valendo, com o bloco fechado.
      expect($("[data-detalhes-resumo]").textContent).toBe("(Santos/SP)");
      expect(detalhes().open).toBe(false);
    });

    it("sem cidade nem UF não grava nada; armazenamento corrompido é ignorado", async () => {
      const mem = memoria();
      await iniciarCad({ armazenamento: mem });
      preencher("nome", "Copa");
      preencher("data", "2027-02-01");
      enviar();
      await tick();
      expect(mem.dados.size).toBe(0);

      montarLista();
      mem.dados.set("pingo:ultimo-local", "{isso não é json");
      await expect(iniciarCad({ armazenamento: mem })).resolves.toBeUndefined();
      expect(campo("cidade").value).toBe("");
    });

    it("falha de persistência: mostra o erro geral, mantém o que foi digitado e NÃO navega", async () => {
      store.falharCriar = true;
      await iniciarCad();
      preencher("nome", "Copa Nova");
      preencher("data", "2027-02-01");
      enviar();
      await tick();
      expect(status().dataset.tipo).toBe("erro");
      expect(status().textContent).toContain("Falha ao salvar");
      expect(campo("nome").value).toBe("Copa Nova");
      expect($<HTMLButtonElement>("[data-enviar]").disabled).toBe(false);
      expect(irPara).not.toHaveBeenCalled();
    });
  });
});

// ===========================================================================
// /gerenciar_campeonatos/editar
// ===========================================================================

describe("edição de campeonato (área de gerenciamento)", () => {
  let store: FakeStore;
  const irParaLista = vi.fn();
  const iniciar = (id: string | null = "copa-2026") => iniciarEdicao({ store, id, irParaLista });

  beforeEach(() => {
    montarEdicao();
    irParaLista.mockClear();
    store = new FakeStore([
      camp({
        id: "copa-2026",
        nome: "Copa Cabeça",
        data: "2026-12-05",
        dataFim: "2026-12-06",
        cidade: "Santos",
        uf: "SP",
        endereco: "Praia do Gonzaga",
        preco: 160.5,
        precoTexto: "R$ 160,50",
        inscricao: "https://exemplo.com/i",
        instagram: "@copa",
        descricao: "Texto",
        listado: false,
        categorias: ["Amador", "Open"],
      }),
      camp({ id: "sem-cat-2026", nome: "Sem Categoria" }),
    ]);
  });

  it("carrega: resumo, categorias, link de organizar e formulário preenchido", async () => {
    await iniciar();
    expect($("[data-perfil]").hidden).toBe(false);
    expect($("[data-estado-perfil]").hidden).toBe(true);
    expect($("[data-perfil-nome]").textContent).toBe("Copa Cabeça");
    expect($("[data-perfil-periodo]").textContent).toMatch(/05 a 06 de dezembro de 2026/);
    expect($("[data-perfil-local]").textContent).toBe("Praia do Gonzaga · Santos/SP");
    expect($("[data-perfil-chips]").textContent).toContain("Oculto na home");
    expect($("[data-perfil-chips]").textContent).not.toContain("Origem");
    expect($<HTMLAnchorElement>("[data-organizar-link]").getAttribute("href")).toContain("/campeonatos/copa-2026/organizar");

    expect(campo("nome").value).toBe("Copa Cabeça");
    expect(campo("data").value).toBe("2026-12-05");
    expect(campo("dataFim").value).toBe("2026-12-06");
    expect(campo("uf").value).toBe("SP");
    expect(campo("preco").value).toBe("160,5");
    expect((campo("precoAConfirmar") as HTMLInputElement).checked).toBe(false);
    expect(campo("listado").checked).toBe(false);
    expect($("[data-arquivar]").textContent).toBe("Arquivar campeonato");
  });

  describe("organizador (verificarPosse)", () => {
    const iniciarComoOrganizador = (id = "copa-2026") =>
      iniciarEdicao({ store, id, irParaLista, verificarPosse: true });

    it("dono: confere a posse e mostra a edição", async () => {
      store.meusIds = ["copa-2026"];
      await iniciarComoOrganizador();
      expect(store.podeGerenciar).toHaveBeenCalledWith("copa-2026");
      expect($("[data-perfil]").hidden).toBe(false);
      expect(campo("nome").value).toBe("Copa Cabeça");
    });

    it("não é dono: 'Você não gerencia este campeonato' e nada de edição ou formulário preenchido", async () => {
      store.meusIds = ["sem-cat-2026"];
      await iniciarComoOrganizador();
      expect($("[data-estado-perfil]").hidden).toBe(false);
      expect($("[data-estado-perfil]").textContent).toContain("Você não gerencia este campeonato");
      expect($("[data-perfil]").hidden).toBe(true);
      expect(campo("nome").value).toBe("");
    });

    it("falha ao conferir a posse: erro com 'Tentar novamente' e nunca mostra a edição", async () => {
      store.meusIds = ["copa-2026"];
      store.falharPosse = true;
      await iniciarComoOrganizador();
      expect($("[data-estado-perfil]").textContent).toContain("Não foi possível carregar");
      expect($("[data-perfil]").hidden).toBe(true);
      store.falharPosse = false;
      clicar(".pf-retentar");
      await tick();
      expect($("[data-perfil]").hidden).toBe(false);
    });

    it("administrador (padrão) não precisa conferir a posse", async () => {
      await iniciar();
      expect(store.podeGerenciar).not.toHaveBeenCalled();
      expect($("[data-perfil]").hidden).toBe(false);
    });

    it("sem permissão ao salvar (RLS recusou): mensagem clara no formulário", async () => {
      store.meusIds = ["copa-2026"];
      await iniciarComoOrganizador();
      store.atualizar.mockResolvedValueOnce({ ok: false, erro: { code: "SEM_PERMISSAO" } });
      enviar();
      await tick();
      expect(status().dataset.tipo).toBe("erro");
      expect(status().textContent).toBe("Você não gerencia este campeonato.");
    });
  });

  describe("organizadores do evento", () => {
    beforeEach(() => {
      store.donos = { "copa-2026": ["ana@x.com"] };
    });

    it("lista os donos do evento ao carregar", async () => {
      await iniciar();
      await tick();
      expect(store.listarDonos).toHaveBeenCalledWith("copa-2026");
      expect(donosNaLista()).toEqual(["ana@x.com"]);
      expect($("[data-donos-estado]").hidden).toBe(true);
    });

    it("evento sem dono: explica que só administradores gerenciam", async () => {
      store.donos = {};
      await iniciar();
      await tick();
      expect(donosNaLista()).toEqual([]);
      expect($("[data-donos-estado]").hidden).toBe(false);
      expect($("[data-donos-estado]").textContent).toContain("só administradores");
    });

    it("falha ao ler os donos: mostra o erro, sem quebrar a edição", async () => {
      store.falharDonos = true;
      await iniciar();
      await tick();
      expect($("[data-donos-estado]").textContent).toContain("Não foi possível carregar");
      expect($("[data-perfil]").hidden).toBe(false);
    });

    it("adicionar: grava, atualiza a lista, limpa o campo e avisa", async () => {
      await iniciar();
      await tick();
      emailDono().value = "  Bia@X.com ";
      enviarDono();
      await tick();
      expect(store.adicionarDono).toHaveBeenCalledWith("copa-2026", "Bia@X.com");
      expect(donosNaLista()).toEqual(["ana@x.com", "bia@x.com"]);
      expect(emailDono().value).toBe("");
      expect($("[data-donos-status]").hidden).toBe(false);
      expect($("[data-donos-status]").textContent).toContain("bia@x.com agora é organizador");
    });

    it("adicionar e-mail inválido ou de quem não é organizador: erro claro e o campo fica marcado", async () => {
      await iniciar();
      await tick();
      emailDono().value = "bia";
      enviarDono();
      await tick();
      expect($("[data-donos-status]").dataset.tipo).toBe("erro");
      expect($("[data-donos-status]").textContent).toBe("Informe um e-mail válido.");
      expect(emailDono().getAttribute("aria-invalid")).toBe("true");

      emailDono().value = "estranho@x.com";
      enviarDono();
      await tick();
      expect($("[data-donos-status]").textContent).toContain("precisa ser organizadora primeiro");
      expect(donosNaLista()).toEqual(["ana@x.com"]);
      expect($<HTMLButtonElement>("[data-donos-adicionar]").disabled).toBe(false);
    });

    it("remover: tira o dono da lista e avisa", async () => {
      store.donos = { "copa-2026": ["ana@x.com", "bia@x.com"] };
      await iniciar();
      await tick();
      const remover = todos(".pf-dono__remover")[1];
      expect(remover.getAttribute("aria-label")).toBe("Remover bia@x.com");
      remover.click();
      await tick();
      expect(store.removerDono).toHaveBeenCalledWith("copa-2026", "bia@x.com");
      expect(donosNaLista()).toEqual(["ana@x.com"]);
      expect($("[data-donos-status]").textContent).toBe("bia@x.com foi removido.");
    });

    it("remover o último dono (organizador): o banco recusa e a lista não muda", async () => {
      store.protegerUltimoDono = true;
      await iniciar();
      await tick();
      todos(".pf-dono__remover")[0].click();
      await tick();
      expect($("[data-donos-status]").dataset.tipo).toBe("erro");
      expect($("[data-donos-status]").textContent).toBe("O campeonato precisa de ao menos um organizador.");
      expect(donosNaLista()).toEqual(["ana@x.com"]);
    });

    it("e-mail de dono é exibido como texto (sem HTML)", async () => {
      store.donos = { "copa-2026": ["<img src=x onerror=alert(1)>@x.com"] };
      await iniciar();
      await tick();
      expect(document.querySelector("[data-donos-lista] img")).toBeNull();
      expect(donosNaLista()[0]).toBe("<img src=x onerror=alert(1)>@x.com");
    });
  });

  it("liga o editor de categorias do evento aberto (e só quando a store de categorias é dada)", async () => {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div data-categorias-editor><p data-cat-estado></p><ul data-cat-lista></ul></div>`
    );
    const categoriaStore = {
      listar: vi.fn(async () => ({ ok: true, valor: [{ id: "c1", nome: "Open", duplas: 0 }] })),
    };
    await iniciarEdicao({ store, id: "copa-2026", irParaLista, categoriaStore: categoriaStore as never });
    await tick();
    expect(categoriaStore.listar).toHaveBeenCalledWith("copa-2026");
    expect(todos("[data-cat-lista] .cat-item")).toHaveLength(1);

    // Sem a store de categorias, nada é ligado.
    categoriaStore.listar.mockClear();
    await iniciar();
    await tick();
    expect(categoriaStore.listar).not.toHaveBeenCalled();
  });

  it("id ausente, inexistente e falha de leitura (com tentar novamente)", async () => {
    await iniciar(null);
    expect($("[data-estado-perfil]").textContent).toContain("não informado");
    expect($("[data-perfil]").hidden).toBe(true);

    await iniciar("nao-existe");
    expect($("[data-estado-perfil]").textContent).toContain("não encontrado");

    store.falharObter = true;
    await iniciar();
    expect($("[data-estado-perfil]").textContent).toContain("Não foi possível carregar");
    store.falharObter = false;
    clicar(".pf-retentar");
    await tick();
    expect($("[data-perfil]").hidden).toBe(false);
  });

  it("salvar: valida antes; erro de domínio não chama a store", async () => {
    await iniciar();
    preencher("nome", "");
    enviar();
    await tick();
    expect(store.atualizar).not.toHaveBeenCalled();
    expect(erroDe("nome").hidden).toBe(false);
  });

  it("salvar: atualiza o resumo, preserva as categorias e avisa", async () => {
    await iniciar();
    preencher("nome", "  Copa Renomeada ");
    preencher("cidade", "Guarujá");
    campo("listado").checked = true;
    enviar();
    await tick();

    expect(store.atualizar).toHaveBeenCalledTimes(1);
    expect(store.atualizar.mock.calls[0][0]).toBe("copa-2026");
    expect($("[data-perfil-nome]").textContent).toBe("Copa Renomeada");
    expect($("[data-perfil-chips]").textContent).toContain("Visível na home");
    expect(campo("nome").value).toBe("Copa Renomeada");
    expect(status().textContent).toBe("Alterações salvas.");
  });

  it("arquivar e reativar alternam o botão e o chip", async () => {
    await iniciar();
    clicar("[data-arquivar]");
    await tick();
    expect(store.definirAtivo).toHaveBeenLastCalledWith("copa-2026", false);
    expect($("[data-perfil-chips]").textContent).toContain("Arquivado");
    expect($("[data-arquivar]").textContent).toBe("Reativar campeonato");
    expect($("[data-acoes-status]").textContent).toBe("Campeonato arquivado.");

    clicar("[data-arquivar]");
    await tick();
    expect(store.definirAtivo).toHaveBeenLastCalledWith("copa-2026", true);
    expect($("[data-perfil-chips]").textContent).not.toContain("Arquivado");
    expect($("[data-acoes-status]").textContent).toBe("Campeonato reativado.");
  });

  it("excluir SEM categorias: confirma, apaga de vez e volta para a lista", async () => {
    await iniciar("sem-cat-2026");
    clicar("[data-excluir]");
    await tick();
    expect($("[data-confirmacao-exclusao]").hidden).toBe(false);
    expect($("[data-confirmacao-texto]").textContent).toContain("definitivamente");
    expect($("[data-confirmar-exclusao]").textContent).toBe("Excluir de vez");
    expect(store.excluir).not.toHaveBeenCalled(); // só depois de confirmar

    clicar("[data-confirmar-exclusao]");
    await tick();
    expect(store.excluir).toHaveBeenCalledWith("sem-cat-2026");
    expect(irParaLista).toHaveBeenCalledTimes(1);
  });

  it("excluir COM categorias: avisa, o botão vira 'Arquivar' e o campeonato é arquivado (não apagado)", async () => {
    await iniciar();
    clicar("[data-excluir]");
    await tick();
    expect($("[data-confirmacao-texto]").textContent).toContain("2 categorias");
    expect($("[data-confirmacao-texto]").textContent).toContain("não pode ser apagado");
    expect($("[data-confirmar-exclusao]").textContent).toBe("Arquivar");

    clicar("[data-confirmar-exclusao]");
    await tick();
    expect(irParaLista).not.toHaveBeenCalled();
    expect(store.itens.some((c) => c.id === "copa-2026")).toBe(true);
    expect(store.itens.find((c) => c.id === "copa-2026")!.ativo).toBe(false);
    expect($("[data-perfil-chips]").textContent).toContain("Arquivado");
    expect($("[data-confirmacao-exclusao]").hidden).toBe(true);
    expect($("[data-acoes-status]").textContent).toBe("Campeonato arquivado.");
  });

  it("cancelar fecha a confirmação sem excluir", async () => {
    await iniciar("sem-cat-2026");
    clicar("[data-excluir]");
    await tick();
    clicar("[data-cancelar-exclusao]");
    expect($("[data-confirmacao-exclusao]").hidden).toBe(true);
    expect(store.excluir).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Edição: preço em um campo só (o texto exibível é derivado, sem perder o que já existia)
// ===========================================================================

describe("edição: preço único", () => {
  const irParaLista = vi.fn();

  function montarComEvento(parcial: Partial<CampeonatoDetalhe>) {
    montarEdicao();
    const store = new FakeStore([camp({ id: "copa-2026", nome: "Copa", ...parcial })]);
    return store;
  }
  const salvarEdicao = async (store: FakeStore) => {
    await iniciarEdicao({ store, id: "copa-2026", irParaLista });
    enviar();
    await tick();
    return store.atualizar.mock.calls[0][1];
  };

  it("preço e texto iguais ao original: o texto livre que já existia é preservado", async () => {
    const entrada = await salvarEdicao(montarComEvento({ preco: 160, precoTexto: "R$ 160 por dupla" }));
    expect(entrada).toMatchObject({ preco: "160", precoTexto: "R$ 160 por dupla" });
  });

  it("preço alterado: o texto é derivado do novo valor", async () => {
    const store = montarComEvento({ preco: 160, precoTexto: "R$ 160 por dupla" });
    await iniciarEdicao({ store, id: "copa-2026", irParaLista });
    preencher("preco", "200,5");
    enviar();
    await tick();
    expect(store.atualizar.mock.calls[0][1]).toMatchObject({ preco: "200,5", precoTexto: "R$ 200,50" });
  });

  it("preço apagado: o texto antigo não fica órfão", async () => {
    const store = montarComEvento({ preco: 160, precoTexto: "R$ 160,00" });
    await iniciarEdicao({ store, id: "copa-2026", irParaLista });
    preencher("preco", "");
    enviar();
    await tick();
    expect(store.atualizar.mock.calls[0][1]).toMatchObject({ preco: "", precoTexto: "" });
  });

  it("sem preço e com texto livre (ex.: Gratuito): o texto continua", async () => {
    const entrada = await salvarEdicao(montarComEvento({ preco: null, precoTexto: "Gratuito" }));
    expect(entrada).toMatchObject({ preco: "", precoTexto: "Gratuito" });
  });

  it("'Valor a confirmar' vem marcado e, ao desmarcar, o texto some (não é preservado)", async () => {
    const store = montarComEvento({ preco: null, precoTexto: "Valor a confirmar" });
    await iniciarEdicao({ store, id: "copa-2026", irParaLista });
    expect((campo("precoAConfirmar") as HTMLInputElement).checked).toBe(true);
    (campo("precoAConfirmar") as HTMLInputElement).checked = false;
    enviar();
    await tick();
    expect(store.atualizar.mock.calls[0][1]).toMatchObject({ preco: "", precoTexto: "" });
  });

  it("preço inválido: erro no campo do preço (e nada é salvo)", async () => {
    const store = montarComEvento({ preco: 160, precoTexto: "R$ 160,00" });
    await iniciarEdicao({ store, id: "copa-2026", irParaLista });
    preencher("preco", "abc");
    enviar();
    await tick();
    expect(store.atualizar).not.toHaveBeenCalled();
    expect(erroDe("preco").hidden).toBe(false);
  });
});
