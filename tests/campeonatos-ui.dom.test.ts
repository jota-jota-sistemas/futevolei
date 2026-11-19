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
    <input name="dataFim" type="date" /><p data-erro="dataFim" hidden></p>
    ${campoTexto("cidade")}
    <select name="uf"><option value="">—</option><option value="SP">SP</option><option value="RJ">RJ</option></select>
    <p data-erro="uf" hidden></p>
    ${campoTexto("endereco")}
    ${campoTexto("preco")}
    ${campoTexto("precoTexto")}
    ${campoTexto("inscricao")}
    ${campoTexto("instagram")}
    <textarea name="descricao"></textarea><p data-erro="descricao" hidden></p>
    <input type="checkbox" name="listado" checked />
    <p data-status hidden></p>
    <button type="submit" data-enviar>Enviar</button>
  </form>`;

const montarLista = () => {
  document.body.innerHTML = `
    <input type="search" data-busca />
    <input type="checkbox" data-mostrar-arquivados />
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
      <p data-categorias-estado></p><ul data-categorias-lista></ul>
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

  it("carrega todos (inclusive arquivados) e mostra só os ativos, mais recentes primeiro, com contador", async () => {
    await iniciarLista({ store });
    expect(store.listar).toHaveBeenCalledWith({ incluirArquivados: true });
    expect(nomesNaLista()).toEqual(["Copa Cabeça", "Evento Oculto", "Açaí Open"]);
    expect($("[data-contador-campeonatos]").textContent).toBe("3 campeonatos");
    expect($("[data-estado-lista]").hidden).toBe(true);
  });

  it("cada item leva à edição pelo id e mostra período e cidade/UF", async () => {
    await iniciarLista({ store });
    const copa = todos(".cl-item").find((a) => a.textContent?.includes("Copa"))!;
    expect(copa.getAttribute("href")).toContain("/gerenciar_campeonatos/editar?id=copa-2026");
    expect(copa.querySelector(".cl-sub")!.textContent).toContain("Santos/SP");
    const acai = todos(".cl-item").find((a) => a.textContent?.includes("Açaí"))!;
    expect(acai.querySelector(".cl-sub")!.textContent).toMatch(/01 a 03 de outubro de 2026/);
  });

  it("marca os ocultos na home e, ao pedir, mostra os arquivados com a marca", async () => {
    await iniciarLista({ store });
    const oculto = todos(".cl-item").find((a) => a.textContent?.includes("Oculto"))!;
    expect(oculto.textContent).toContain("Oculto na home");

    const check = $<HTMLInputElement>("[data-mostrar-arquivados]");
    check.checked = true;
    check.dispatchEvent(new Event("change"));
    expect(nomesNaLista()).toContain("Torneio Antigo");
    const antigo = todos(".cl-item").find((a) => a.textContent?.includes("Antigo"))!;
    expect(antigo.textContent).toContain("Arquivado");
    expect($("[data-contador-campeonatos]").textContent).toBe("4 campeonatos");
  });

  it("a busca filtra sem acento e mostra 'x de y'; sem resultado mostra o aviso", async () => {
    await iniciarLista({ store });
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
    await iniciarLista({ store });
    expect($("[data-estado-lista]").textContent).toContain("Nenhum campeonato cadastrado");
  });

  it("falha de leitura: mostra o erro e 'Tentar novamente' recarrega", async () => {
    store.falharListar = 1;
    await iniciarLista({ store });
    expect($("[data-estado-lista]").textContent).toContain("Não foi possível carregar");
    expect(todos(".cl-item")).toHaveLength(0);
    clicar(".cl-retentar");
    await tick();
    expect(nomesNaLista()).toHaveLength(3);
  });

  it("texto malicioso no nome é exibido como texto (sem HTML)", async () => {
    store.itens.push(camp({ id: "x", nome: "<img src=x onerror=alert(1)>", data: "2027-01-01" }));
    await iniciarLista({ store });
    expect(document.querySelector("img")).toBeNull();
    expect(nomesNaLista()[0]).toBe("<img src=x onerror=alert(1)>");
  });

  describe("organizador (apenasMeus)", () => {
    it("lista só os campeonatos dele (listarMeus, nunca listar) e troca o título", async () => {
      document.body.insertAdjacentHTML("beforeend", `<h2 id="lista-campeonatos-titulo">Todos os campeonatos</h2>`);
      store.meusIds = ["acai-2026", "velho-2025"];
      await iniciarLista({ store, apenasMeus: true });
      expect(store.listarMeus).toHaveBeenCalledWith({ incluirArquivados: true });
      expect(store.listar).not.toHaveBeenCalled();
      expect(nomesNaLista()).toEqual(["Açaí Open"]); // o arquivado só com o filtro
      expect($("#lista-campeonatos-titulo").textContent).toBe("Meus campeonatos");
      expect($("[data-contador-campeonatos]").textContent).toBe("1 campeonato");
    });

    it("sem campeonatos dele: aviso próprio", async () => {
      store.meusIds = [];
      await iniciarLista({ store, apenasMeus: true });
      expect($("[data-estado-lista]").textContent).toContain("Você ainda não tem campeonatos");
    });

    it("administrador (padrão) segue vendo todos pela listar", async () => {
      await iniciarLista({ store });
      expect(store.listar).toHaveBeenCalled();
      expect(store.listarMeus).not.toHaveBeenCalled();
    });
  });

  describe("cadastro", () => {
    it("dados inválidos: mostra o erro no campo e NÃO chama a store", async () => {
      await iniciarLista({ store });
      preencher("nome", "  ");
      preencher("data", "2026-12-05");
      enviar();
      await tick();
      expect(store.criar).not.toHaveBeenCalled();
      expect(erroDe("nome").hidden).toBe(false);
      expect(erroDe("nome").textContent).toContain("nome do campeonato");
      expect(campo("nome").getAttribute("aria-invalid")).toBe("true");
    });

    it("data final anterior ao início: erro no campo da data final", async () => {
      await iniciarLista({ store });
      preencher("nome", "Novo");
      preencher("data", "2026-12-05");
      preencher("dataFim", "2026-12-01");
      enviar();
      await tick();
      expect(store.criar).not.toHaveBeenCalled();
      expect(erroDe("dataFim").hidden).toBe(false);
    });

    it("sucesso: entra na lista, limpa o formulário (listado volta a ligado) e avisa", async () => {
      await iniciarLista({ store });
      preencher("nome", "Copa Nova");
      preencher("data", "2027-02-01");
      preencher("cidade", "Santos");
      preencher("uf", "SP");
      preencher("preco", "R$ 160,00");
      campo("listado").checked = false;
      enviar();
      await tick();

      expect(store.criar).toHaveBeenCalledTimes(1);
      expect(store.criar.mock.calls[0][0]).toMatchObject({
        nome: "Copa Nova", data: "2027-02-01", cidade: "Santos", uf: "SP", preco: "R$ 160,00", listado: false,
      });
      expect(nomesNaLista()[0]).toBe("Copa Nova"); // data mais recente, vai ao topo
      expect(todos(".cl-item")[0].textContent).toContain("Oculto na home");
      expect(campo("nome").value).toBe("");
      expect(campo("listado").checked).toBe(true);
      expect(status().hidden).toBe(false);
      expect(status().textContent).toContain("Copa Nova foi cadastrado");
      expect(store.listar).toHaveBeenCalledTimes(1); // sem nova leitura
    });

    it("falha de persistência: mostra o erro geral e mantém o que foi digitado", async () => {
      store.falharCriar = true;
      await iniciarLista({ store });
      preencher("nome", "Copa Nova");
      preencher("data", "2027-02-01");
      enviar();
      await tick();
      expect(status().dataset.tipo).toBe("erro");
      expect(status().textContent).toContain("Falha ao salvar");
      expect(campo("nome").value).toBe("Copa Nova");
      expect($<HTMLButtonElement>("[data-enviar]").disabled).toBe(false);
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
    expect(todos("[data-categorias-lista] li").map((e) => e.textContent)).toEqual(["Amador", "Open"]);
    expect($("[data-categorias-estado]").hidden).toBe(true);
    expect($<HTMLAnchorElement>("[data-organizar-link]").getAttribute("href")).toContain("/campeonatos/copa-2026/organizar");

    expect(campo("nome").value).toBe("Copa Cabeça");
    expect(campo("data").value).toBe("2026-12-05");
    expect(campo("dataFim").value).toBe("2026-12-06");
    expect(campo("uf").value).toBe("SP");
    expect(campo("preco").value).toBe("160,5");
    expect(campo("precoTexto").value).toBe("R$ 160,50");
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

  it("sem categorias: mostra o aviso no lugar da lista", async () => {
    await iniciar("sem-cat-2026");
    expect($("[data-categorias-estado]").hidden).toBe(false);
    expect($("[data-categorias-estado]").textContent).toContain("Nenhuma categoria");
    expect(todos("[data-categorias-lista] li")).toHaveLength(0);
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
    expect(todos("[data-categorias-lista] li")).toHaveLength(2);
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
