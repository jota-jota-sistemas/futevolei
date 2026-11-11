// @vitest-environment happy-dom
//
// Feature: perfil de jogador (CRUD): integração das telas no DOM.
// Cobre /jogadores (lista, busca, cadastro, aviso de homônimo) e
// /jogadores/perfil (carregar, editar, arquivar, excluir). A store é um fake em
// memória (nenhum Supabase); o fixture replica o contrato data-* dos componentes.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Jogador, ResultadoJogador } from "../src/domain/jogadores/types";
import { validarJogador } from "../src/domain/jogadores/validation";
import type { DestinoExclusao, JogadorStore } from "../src/store/jogadorStore";
import { iniciarLista } from "../src/scripts/jogadores-lista";
import { iniciarPerfil } from "../src/scripts/jogador-perfil";

// ---------------------------------------------------------------------------
// Fake da store
// ---------------------------------------------------------------------------

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

function jog(p: Partial<Jogador> & { nome: string }): Jogador {
  return {
    id: uuid(), apelido: null, genero: null, cidade: null, uf: null, instagram: null,
    ativo: true, criadoEm: "2026-01-01T00:00:00.000Z", atualizadoEm: "2026-01-01T00:00:00.000Z", ...p,
  };
}

const naoEncontrado = (): ResultadoJogador<never> => ({ ok: false, erro: { code: "JOGADOR_NAO_ENCONTRADO" } });

class FakeStore implements JogadorStore {
  jogadores: Jogador[];
  vinculos = 0;
  falharListar = 0; // nº de próximas chamadas de listar que falham
  falharCriar = false;
  criados: unknown[] = [];

  constructor(jogadores: Jogador[] = []) { this.jogadores = jogadores; }

  listar = vi.fn(async (opcoes?: { incluirArquivados?: boolean }): Promise<ResultadoJogador<Jogador[]>> => {
    if (this.falharListar > 0) { this.falharListar--; return { ok: false, erro: { code: "FALHA_LEITURA" } }; }
    const base = opcoes?.incluirArquivados ? this.jogadores : this.jogadores.filter((j) => j.ativo);
    return { ok: true, valor: [...base] };
  });

  obter = vi.fn(async (id: string): Promise<ResultadoJogador<Jogador>> => {
    const j = this.jogadores.find((x) => x.id === id);
    return j ? { ok: true, valor: j } : naoEncontrado();
  });

  criar = vi.fn(async (entrada: Parameters<JogadorStore["criar"]>[0]): Promise<ResultadoJogador<Jogador>> => {
    const v = validarJogador(entrada);
    if (!v.ok) return v;
    if (this.falharCriar) return { ok: false, erro: { code: "FALHA_PERSISTENCIA" } };
    const novo = jog({ ...v.valor });
    this.jogadores.push(novo);
    this.criados.push(entrada);
    return { ok: true, valor: novo };
  });

  atualizar = vi.fn(async (id: string, entrada: Parameters<JogadorStore["atualizar"]>[1]): Promise<ResultadoJogador<Jogador>> => {
    const v = validarJogador(entrada);
    if (!v.ok) return v;
    const i = this.jogadores.findIndex((x) => x.id === id);
    if (i < 0) return naoEncontrado();
    this.jogadores[i] = { ...this.jogadores[i], ...v.valor };
    return { ok: true, valor: this.jogadores[i] };
  });

  definirAtivo = vi.fn(async (id: string, ativo: boolean): Promise<ResultadoJogador<Jogador>> => {
    const i = this.jogadores.findIndex((x) => x.id === id);
    if (i < 0) return naoEncontrado();
    this.jogadores[i] = { ...this.jogadores[i], ativo };
    return { ok: true, valor: this.jogadores[i] };
  });

  contarVinculos = vi.fn(async (): Promise<ResultadoJogador<number>> => ({ ok: true, valor: this.vinculos }));

  excluir = vi.fn(async (id: string): Promise<ResultadoJogador<DestinoExclusao>> => {
    if (this.vinculos > 0) {
      await this.definirAtivo(id, false);
      return { ok: true, valor: "arquivado" };
    }
    this.jogadores = this.jogadores.filter((x) => x.id !== id);
    return { ok: true, valor: "excluido" };
  });
}

// ---------------------------------------------------------------------------
// Fixtures (contrato data-* de components/JogadorForm.astro e das páginas)
// ---------------------------------------------------------------------------

const FORM = `
  <form data-jogador-form novalidate>
    <input name="nome" type="text" />
    <p data-erro="nome" hidden></p>
    <input name="apelido" type="text" />
    <p data-erro="apelido" hidden></p>
    <select name="genero"><option value="">Não informar</option><option value="masculino">M</option><option value="feminino">F</option></select>
    <p data-erro="genero" hidden></p>
    <input name="cidade" type="text" />
    <p data-erro="cidade" hidden></p>
    <select name="uf"><option value="">—</option><option value="SP">SP</option><option value="RJ">RJ</option></select>
    <p data-erro="uf" hidden></p>
    <input name="instagram" type="text" />
    <p data-erro="instagram" hidden></p>
    <div data-homonimos hidden>
      <p data-homonimos-texto></p><ul data-homonimos-lista></ul>
      <button type="button" data-confirmar-homonimo>Salvar mesmo assim</button>
      <button type="button" data-cancelar-homonimo>Revisar</button>
    </div>
    <p data-status hidden></p>
    <button type="submit" data-enviar>Enviar</button>
  </form>`;

const montarLista = () => {
  document.body.innerHTML = `
    <input type="search" data-busca />
    <input type="checkbox" data-mostrar-arquivados />
    <p data-contador-jogadores></p>
    <p data-estado-lista></p>
    <ul data-lista></ul>
    ${FORM}`;
};

const montarPerfil = () => {
  document.body.innerHTML = `
    <p data-estado-perfil></p>
    <div data-perfil hidden>
      <span data-perfil-avatar></span><p data-perfil-nome></p><p data-perfil-apelido hidden></p>
      <div data-perfil-chips></div>
      <a data-perfil-instagram href="#" hidden></a>
      <button type="button" data-arquivar>Arquivar jogador</button>
      <button type="button" data-excluir>Excluir jogador</button>
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
const campo = (nome: string) => $<HTMLInputElement & HTMLSelectElement>(`[name="${nome}"]`);
const preencher = (nome: string, valor: string) => { campo(nome).value = valor; };
const enviar = () => $("form").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
const digitarBusca = (texto: string) => { const b = $<HTMLInputElement>("[data-busca]"); b.value = texto; b.dispatchEvent(new Event("input")); };
const nomesNaLista = () => todos(".jl-item .jl-nome").map((e) => e.textContent);
const status = () => $("[data-status]");

// ===========================================================================
// /jogadores
// ===========================================================================

describe("lista de jogadores", () => {
  let store: FakeStore;
  beforeEach(() => {
    seq = 0;
    montarLista();
    store = new FakeStore([
      jog({ nome: "Carla Dias", apelido: "Cacá", cidade: "Santos", uf: "SP" }),
      jog({ nome: "Álvaro Lima", genero: "masculino" }),
      jog({ nome: "Bruno Reis", ativo: false }),
    ]);
  });

  it("carrega, mostra só os ativos em ordem e conta", async () => {
    await iniciarLista({ store });
    expect(store.listar).toHaveBeenCalledWith({ incluirArquivados: true });
    expect(nomesNaLista()).toEqual(["Álvaro Lima", "Carla Dias"]);
    expect($("[data-contador-jogadores]").textContent).toBe("2 jogadores");
    expect($("[data-estado-lista]").hidden).toBe(true);
  });

  it("cada item leva ao perfil pelo id e mostra o subtítulo com o que existir", async () => {
    await iniciarLista({ store });
    const carla = todos(".jl-item").find((a) => a.textContent?.includes("Carla"))!;
    expect(carla.getAttribute("href")).toContain("/jogadores/perfil?id=");
    expect(carla.textContent).toContain("“Cacá” · Santos/SP");
    expect(carla.querySelector(".jl-avatar")?.textContent).toBe("CD");
  });

  it("'Mostrar arquivados' inclui os arquivados com a marca", async () => {
    await iniciarLista({ store });
    const check = $<HTMLInputElement>("[data-mostrar-arquivados]");
    check.checked = true;
    check.dispatchEvent(new Event("change"));
    expect(nomesNaLista()).toEqual(["Álvaro Lima", "Bruno Reis", "Carla Dias"]);
    expect(todos(".jl-chip").map((c) => c.textContent)).toEqual(["Arquivado"]);
    expect($("[data-contador-jogadores]").textContent).toBe("3 jogadores");
  });

  it("busca sem diferenciar acento/caixa e atualiza o contador", async () => {
    await iniciarLista({ store });
    digitarBusca("alvaro");
    expect(nomesNaLista()).toEqual(["Álvaro Lima"]);
    expect($("[data-contador-jogadores]").textContent).toBe("1 de 2 jogadores");
    digitarBusca("zzz");
    expect(nomesNaLista()).toEqual([]);
    expect($("[data-estado-lista]").hidden).toBe(false);
    expect($("[data-estado-lista]").textContent).toContain("Nenhum jogador encontrado");
  });

  it("sem jogadores cadastrados, convida a cadastrar o primeiro", async () => {
    await iniciarLista({ store: new FakeStore([]) });
    expect($("[data-estado-lista]").textContent).toContain("Nenhum jogador cadastrado");
  });

  it("falha ao carregar mostra a mensagem e permite tentar de novo", async () => {
    store.falharListar = 1;
    await iniciarLista({ store });
    expect($("[data-estado-lista]").textContent).toContain("Não foi possível carregar");
    const retentar = $<HTMLButtonElement>(".jl-retentar");
    expect(retentar).toBeTruthy();
    retentar.click();
    await vi.waitFor(() => expect(nomesNaLista()).toEqual(["Álvaro Lima", "Carla Dias"]));
  });

  it("nomes com HTML são exibidos como texto (sem injetar elementos)", async () => {
    store.jogadores.push(jog({ nome: '<img src=x onerror="alert(1)">' }));
    await iniciarLista({ store });
    expect(document.querySelector("[data-lista] img")).toBeNull();
    expect(nomesNaLista()).toContain('<img src=x onerror="alert(1)">');
  });

  describe("cadastro", () => {
    it("cria, ordena na lista, limpa o formulário e confirma", async () => {
      await iniciarLista({ store });
      preencher("nome", "  Bia Alves ");
      preencher("genero", "feminino");
      preencher("uf", "SP");
      preencher("instagram", "@Bia.Alves");
      enviar();
      await vi.waitFor(() => expect(nomesNaLista()).toContain("Bia Alves"));

      expect(store.criar).toHaveBeenCalledTimes(1);
      expect(nomesNaLista()).toEqual(["Álvaro Lima", "Bia Alves", "Carla Dias"]); // ordenado
      expect(campo("nome").value).toBe("");
      expect(status().hidden).toBe(false);
      expect(status().textContent).toBe("Bia Alves foi cadastrado.");
    });

    it("dados inválidos: mostra o erro no campo, marca aria-invalid e NÃO chama a store", async () => {
      await iniciarLista({ store });
      enviar();
      await Promise.resolve();
      expect(store.criar).not.toHaveBeenCalled();
      expect($('[data-erro="nome"]').hidden).toBe(false);
      expect($('[data-erro="nome"]').textContent).toContain("Informe o nome");
      expect(campo("nome").getAttribute("aria-invalid")).toBe("true");
    });

    it("erro de Instagram aparece no campo certo", async () => {
      await iniciarLista({ store });
      preencher("nome", "Bia");
      preencher("instagram", "https://www.instagram.com/p/ABC/");
      enviar();
      await Promise.resolve();
      expect(store.criar).not.toHaveBeenCalled();
      expect($('[data-erro="instagram"]').textContent).toContain("não de uma publicação");
    });

    it("homônimo: avisa e não cria até confirmar", async () => {
      await iniciarLista({ store });
      preencher("nome", "alvaro   LIMA");
      enviar();
      await Promise.resolve();
      expect(store.criar).not.toHaveBeenCalled();
      expect($("[data-homonimos]").hidden).toBe(false);
      expect($("[data-homonimos-texto]").textContent).toContain("Já existe um jogador com este nome");
      expect($("[data-homonimos-lista] a").textContent).toBe("Álvaro Lima");

      $<HTMLButtonElement>("[data-confirmar-homonimo]").click();
      await vi.waitFor(() => expect(store.criar).toHaveBeenCalledTimes(1));
      expect($("[data-homonimos]").hidden).toBe(true);
    });

    it("homônimo: 'Revisar' fecha o aviso sem criar", async () => {
      await iniciarLista({ store });
      preencher("nome", "Carla Dias");
      enviar();
      await Promise.resolve();
      $<HTMLButtonElement>("[data-cancelar-homonimo]").click();
      expect($("[data-homonimos]").hidden).toBe(true);
      expect(store.criar).not.toHaveBeenCalled();
    });

    it("homônimo também vale para arquivados", async () => {
      await iniciarLista({ store });
      preencher("nome", "Bruno Reis");
      enviar();
      await Promise.resolve();
      expect($("[data-homonimos]").hidden).toBe(false);
    });

    it("falha ao salvar: mostra erro geral e não altera a lista", async () => {
      store.falharCriar = true;
      await iniciarLista({ store });
      preencher("nome", "Bia Alves");
      enviar();
      await vi.waitFor(() => expect(status().hidden).toBe(false));
      expect(status().dataset.tipo).toBe("erro");
      expect(status().textContent).toContain("Falha ao salvar");
      expect(nomesNaLista()).toEqual(["Álvaro Lima", "Carla Dias"]);
      expect(campo("nome").value).toBe("Bia Alves"); // não perde o que foi digitado
    });
  });
});

// ===========================================================================
// /jogadores/perfil
// ===========================================================================

describe("perfil do jogador", () => {
  let store: FakeStore;
  let ana: Jogador;
  let irParaLista: ReturnType<typeof vi.fn>;
  const abrir = (id: string | null = ana.id) => iniciarPerfil({ store, id, irParaLista });

  beforeEach(() => {
    seq = 0;
    montarPerfil();
    ana = jog({ nome: "Ana Lima", apelido: "Aninha", genero: "feminino", cidade: "Santos", uf: "SP", instagram: "ana.lima" });
    store = new FakeStore([ana, jog({ nome: "Bruno Reis" })]);
    irParaLista = vi.fn();
  });

  it("sem id na URL, orienta a voltar e não mostra o perfil", async () => {
    await abrir(null);
    expect($("[data-estado-perfil]").textContent).toContain("Jogador não informado");
    expect($("[data-perfil]").hidden).toBe(true);
    expect(store.obter).not.toHaveBeenCalled();
  });

  it("jogador inexistente -> mensagem de não encontrado", async () => {
    await abrir("00000000-0000-4000-8000-0000000000ff");
    expect($("[data-estado-perfil]").textContent).toContain("Jogador não encontrado");
    expect($("[data-perfil]").hidden).toBe(true);
  });

  it("erro de leitura oferece nova tentativa", async () => {
    const original = store.obter.getMockImplementation()!;
    store.obter.mockImplementationOnce(async () => ({ ok: false, erro: { code: "FALHA_LEITURA" } }));
    await abrir();
    expect($("[data-estado-perfil]").textContent).toContain("Não foi possível carregar");
    store.obter.mockImplementation(original);
    $<HTMLButtonElement>(".pf-retentar").click();
    await vi.waitFor(() => expect($("[data-perfil]").hidden).toBe(false));
  });

  it("mostra o resumo e preenche o formulário de edição", async () => {
    await abrir();
    expect($("[data-perfil]").hidden).toBe(false);
    expect($("[data-estado-perfil]").hidden).toBe(true);
    expect($("[data-perfil-nome]").textContent).toBe("Ana Lima");
    expect($("[data-perfil-avatar]").textContent).toBe("AL");
    expect($("[data-perfil-apelido]").textContent).toBe("“Aninha”");
    expect(todos("[data-perfil-chips] .pf-chip").map((c) => c.textContent)).toEqual(["Feminino", "📍 Santos/SP"]);
    const ig = $<HTMLAnchorElement>("[data-perfil-instagram]");
    expect(ig.hidden).toBe(false);
    expect(ig.getAttribute("href")).toBe("https://instagram.com/ana.lima");
    expect(ig.textContent).toBe("@ana.lima");
    expect(campo("nome").value).toBe("Ana Lima");
    expect(campo("instagram").value).toBe("@ana.lima");
    expect($("[data-arquivar]").textContent).toBe("Arquivar jogador");
    expect(document.title).toBe("Ana Lima — Pingo Futevôlei");
  });

  it("jogador sem apelido nem Instagram esconde esses itens", async () => {
    ana.apelido = null; ana.instagram = null;
    await abrir();
    expect($("[data-perfil-apelido]").hidden).toBe(true);
    expect($("[data-perfil-instagram]").hidden).toBe(true);
  });

  describe("edição", () => {
    it("salva, atualiza o resumo e confirma", async () => {
      await abrir();
      preencher("nome", "Ana Souza");
      preencher("apelido", "");
      enviar();
      await vi.waitFor(() => expect(status().hidden).toBe(false));
      expect(store.atualizar).toHaveBeenCalledWith(ana.id, expect.objectContaining({ nome: "Ana Souza", apelido: "" }));
      expect($("[data-perfil-nome]").textContent).toBe("Ana Souza");
      expect($("[data-perfil-apelido]").hidden).toBe(true);
      expect(status().textContent).toBe("Alterações salvas.");
    });

    it("dado inválido: erro no campo e a store não é chamada", async () => {
      await abrir();
      preencher("nome", "");
      enviar();
      await Promise.resolve();
      expect(store.atualizar).not.toHaveBeenCalled();
      expect($('[data-erro="nome"]').textContent).toContain("Informe o nome");
    });

    it("renomear para um nome que outro jogador já tem: avisa; confirmar salva", async () => {
      await abrir();
      preencher("nome", "BRUNO reis");
      enviar();
      await vi.waitFor(() => expect($("[data-homonimos]").hidden).toBe(false));
      expect(store.atualizar).not.toHaveBeenCalled();
      $<HTMLButtonElement>("[data-confirmar-homonimo]").click();
      await vi.waitFor(() => expect(store.atualizar).toHaveBeenCalledTimes(1));
    });

    it("editar sem mudar o nome não dispara a checagem de homônimo (nem lê a lista)", async () => {
      await abrir();
      store.listar.mockClear();
      preencher("cidade", "Niterói");
      enviar();
      await vi.waitFor(() => expect(store.atualizar).toHaveBeenCalledTimes(1));
      expect(store.listar).not.toHaveBeenCalled();
    });

    it("mudar só a caixa/acento do PRÓPRIO nome não conta como homônimo de si mesmo", async () => {
      await abrir();
      preencher("nome", "ana lima");
      enviar();
      await vi.waitFor(() => expect(store.atualizar).toHaveBeenCalledTimes(1));
      expect($("[data-homonimos]").hidden).toBe(true);
    });
  });

  describe("arquivar e reativar", () => {
    it("alterna o estado, o rótulo do botão e a marca de arquivado", async () => {
      await abrir();
      $<HTMLButtonElement>("[data-arquivar]").click();
      await vi.waitFor(() => expect($("[data-arquivar]").textContent).toBe("Reativar jogador"));
      expect(store.definirAtivo).toHaveBeenCalledWith(ana.id, false);
      expect(todos("[data-perfil-chips] .pf-chip").map((c) => c.textContent)).toContain("Arquivado");
      expect($("[data-acoes-status]").textContent).toBe("Jogador arquivado.");

      $<HTMLButtonElement>("[data-arquivar]").click();
      await vi.waitFor(() => expect($("[data-arquivar]").textContent).toBe("Arquivar jogador"));
      expect(store.definirAtivo).toHaveBeenLastCalledWith(ana.id, true);
      expect($("[data-acoes-status]").textContent).toBe("Jogador reativado.");
    });
  });

  describe("excluir", () => {
    it("sem vínculos: confirma em tela e exclui de vez, voltando à lista", async () => {
      await abrir();
      $<HTMLButtonElement>("[data-excluir]").click();
      await vi.waitFor(() => expect($("[data-confirmacao-exclusao]").hidden).toBe(false));
      expect($("[data-confirmacao-texto]").textContent).toContain("excluído definitivamente");
      expect($("[data-confirmar-exclusao]").textContent).toBe("Excluir de vez");
      expect(store.excluir).not.toHaveBeenCalled(); // ainda precisa confirmar

      $<HTMLButtonElement>("[data-confirmar-exclusao]").click();
      await vi.waitFor(() => expect(irParaLista).toHaveBeenCalledTimes(1));
      expect(store.jogadores.some((j) => j.id === ana.id)).toBe(false);
    });

    it("com vínculos: explica que será arquivado e permanece na tela como arquivado", async () => {
      store.vinculos = 2;
      await abrir();
      $<HTMLButtonElement>("[data-excluir]").click();
      await vi.waitFor(() => expect($("[data-confirmacao-exclusao]").hidden).toBe(false));
      expect($("[data-confirmacao-texto]").textContent).toContain("2 inscrições");
      expect($("[data-confirmacao-texto]").textContent).toContain("será arquivado");
      expect($("[data-confirmar-exclusao]").textContent).toBe("Arquivar");

      $<HTMLButtonElement>("[data-confirmar-exclusao]").click();
      await vi.waitFor(() => expect($("[data-confirmacao-exclusao]").hidden).toBe(true));
      expect(irParaLista).not.toHaveBeenCalled();
      expect(store.jogadores.find((j) => j.id === ana.id)?.ativo).toBe(false);
      expect(todos("[data-perfil-chips] .pf-chip").map((c) => c.textContent)).toContain("Arquivado");
      expect($("[data-acoes-status]").textContent).toBe("Jogador arquivado.");
    });

    it("usa o singular com 1 vínculo", async () => {
      store.vinculos = 1;
      await abrir();
      $<HTMLButtonElement>("[data-excluir]").click();
      await vi.waitFor(() => expect($("[data-confirmacao-exclusao]").hidden).toBe(false));
      expect($("[data-confirmacao-texto]").textContent).toContain("1 inscrição ");
    });

    it("Cancelar fecha a confirmação sem excluir", async () => {
      await abrir();
      $<HTMLButtonElement>("[data-excluir]").click();
      await vi.waitFor(() => expect($("[data-confirmacao-exclusao]").hidden).toBe(false));
      $<HTMLButtonElement>("[data-cancelar-exclusao]").click();
      expect($("[data-confirmacao-exclusao]").hidden).toBe(true);
      expect(store.excluir).not.toHaveBeenCalled();
      expect(irParaLista).not.toHaveBeenCalled();
    });
  });
});
