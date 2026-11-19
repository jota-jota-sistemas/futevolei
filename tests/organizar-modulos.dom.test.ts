// @vitest-environment happy-dom
//
// Módulos de UI da organização (duplas, colar lista, formato, nivelador) com a
// store simulada: o que a pessoa vê e o que é gravado.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BracketStore } from "../src/store/bracketStore";
import type { Pair, DomainError } from "../src/domain/bracket/types";
import { ligarDuplas, textoContagem } from "../src/scripts/organizar/duplas";
import { ligarColarLista, textoResumo } from "../src/scripts/organizar/colar-lista";
import { ligarFormato, descreverGrupos } from "../src/scripts/organizar/formato";
import { ligarNivelador } from "../src/scripts/organizar/nivelador";
import { criarRascunho } from "../src/scripts/organizar/rascunho";
import { interpretarLista } from "../src/domain/pairs/lista";
import { resumirGeracao } from "../src/domain/bracket/resumo";

const REF = { campeonatoId: "c1", categoriaId: "k1" };
const par = (id: string, a: string, b: string, seed = 0): Pair => ({
  id, nomeDupla: `${a} & ${b} ${id}`, atletaA: a, atletaB: b, seed, criadoEm: "2026-01-01T00:00:00.000Z",
});
const okR = <T,>(valor: T) => ({ ok: true as const, valor });
const erroR = (code: string) => ({ ok: false as const, erro: { code } as unknown as DomainError });
const memoria = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const esperar = () => new Promise((r) => setTimeout(r, 0));
const toasts = () => Array.from(document.querySelectorAll(".toast")).map((t) => t.querySelector(".toast__texto")?.textContent);
const digitar = (el: HTMLInputElement | HTMLTextAreaElement, v: string) => {
  el.value = v;
  el.dispatchEvent(new Event("input", { bubbles: true }));
};
const q = <T extends Element>(sel: string) => document.querySelector(sel) as T;

let store: { [K in keyof BracketStore]: ReturnType<typeof vi.fn> };
beforeEach(() => {
  document.body.innerHTML = "";
  let n = 0;
  store = {
    adicionarDupla: vi.fn(async (_r, d) => okR(par(`n${++n}`, d.atletaA, d.atletaB))),
    adicionarDuplas: vi.fn(async (_r, lote: { atletaA: string; atletaB: string }[]) => okR(lote.map((d) => par(`l${++n}`, d.atletaA, d.atletaB)))),
    removerDupla: vi.fn(async () => okR(undefined)),
    editarDupla: vi.fn(async (_r, id, d) => okR(par(id, d.atletaA, d.atletaB))),
    salvarConfig: vi.fn(async () => okR(undefined)),
    salvarSeeding: vi.fn(async () => okR(undefined)),
  } as never;
});

const HTML_DUPLAS = `
  <section id="s">
    <form data-form-dupla>
      <input id="dupla-atleta-a" name="atletaA" /><input id="dupla-atleta-b" name="atletaB" />
      <button type="submit" data-add-dupla>Adicionar</button>
      <div data-aviso-repetida hidden><p data-repetida-msg></p>
        <button type="button" data-repetida-revisar>Revisar</button>
        <button type="button" data-repetida-forcar>Forçar</button></div>
      <p data-erro-dupla></p>
    </form>
    <p data-contagem-duplas></p><p data-aviso-chaveamento hidden></p><ul data-lista-duplas></ul>
  </section>`;

function montarDuplas(duplas: Pair[], bracket: unknown = null) {
  document.body.innerHTML = HTML_DUPLAS;
  const estado = { duplas, bracket: bracket as never, vinculos: {} as Record<string, never> };
  const aoMudar = vi.fn();
  const ctl = ligarDuplas({
    secao: q("#s"), store: store as unknown as BracketStore, ref: REF, estado,
    rascunho: criarRascunho("p:", memoria()),
    avisar: (o) => {
      const t = document.createElement("div");
      t.className = "toast";
      t.innerHTML = '<span class="toast__texto"></span>';
      (t.firstElementChild as HTMLElement).textContent = o.texto;
      if (o.desfazer) {
        const b = document.createElement("button");
        b.className = "toast__acao";
        b.addEventListener("click", () => void o.desfazer!.aoDesfazer());
        t.append(b);
      }
      document.body.append(t);
    },
    aoMudar, seletor: () => null, opcoesJogadores: () => null,
  });
  ctl.render();
  return { estado, aoMudar };
}
const enviar = () => q<HTMLFormElement>("[data-form-dupla]").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
const nomesNaLista = () => Array.from(document.querySelectorAll(".org__dupla-nome")).map((e) => e.textContent);

describe("duplas", () => {
  it("contagem no singular e no plural", () => {
    expect(textoContagem(0)).toBe("Nenhuma dupla cadastrada.");
    expect(textoContagem(1)).toBe("1 dupla cadastrada.");
    expect(textoContagem(8)).toBe("8 duplas cadastradas.");
  });
  it("adiciona sem reler o banco, limpa o formulário e avisa", async () => {
    const { estado, aoMudar } = montarDuplas([]);
    digitar(q("#dupla-atleta-a"), "Ana");
    digitar(q("#dupla-atleta-b"), "Bia");
    enviar();
    await esperar();
    expect(store.adicionarDupla).toHaveBeenCalledTimes(1);
    expect(estado.duplas).toHaveLength(1);
    expect(nomesNaLista()).toEqual(["Ana & Bia"]);
    expect(q<HTMLInputElement>("#dupla-atleta-a").value).toBe("");
    expect(toasts()[0]).toContain("Ana & Bia");
    expect(aoMudar).toHaveBeenCalled();
  });
  it("duplo toque grava uma vez só", async () => {
    montarDuplas([]);
    digitar(q("#dupla-atleta-a"), "Ana");
    digitar(q("#dupla-atleta-b"), "Bia");
    enviar();
    enviar();
    await esperar();
    expect(store.adicionarDupla).toHaveBeenCalledTimes(1);
  });
  it("dupla repetida (em qualquer ordem) pede confirmação antes de gravar", async () => {
    montarDuplas([par("1", "Ana", "Bia")]);
    digitar(q("#dupla-atleta-a"), "bia");
    digitar(q("#dupla-atleta-b"), "ANA");
    enviar();
    await esperar();
    expect(store.adicionarDupla).not.toHaveBeenCalled();
    expect(q<HTMLElement>("[data-aviso-repetida]").hidden).toBe(false);
    q<HTMLButtonElement>("[data-repetida-forcar]").click();
    await esperar();
    expect(store.adicionarDupla).toHaveBeenCalledTimes(1);
    expect(q<HTMLElement>("[data-aviso-repetida]").hidden).toBe(true);
  });
  it("'Revisar' fecha o aviso sem gravar", async () => {
    montarDuplas([par("1", "Ana", "Bia")]);
    digitar(q("#dupla-atleta-a"), "Ana");
    digitar(q("#dupla-atleta-b"), "Bia");
    enviar();
    q<HTMLButtonElement>("[data-repetida-revisar]").click();
    expect(q<HTMLElement>("[data-aviso-repetida]").hidden).toBe(true);
    expect(store.adicionarDupla).not.toHaveBeenCalled();
  });
  it("erro do banco aparece junto do formulário", async () => {
    store.adicionarDupla.mockResolvedValueOnce(erroR("FALHA_PERSISTENCIA"));
    montarDuplas([]);
    digitar(q("#dupla-atleta-a"), "Ana");
    digitar(q("#dupla-atleta-b"), "Bia");
    enviar();
    await esperar();
    expect(q("[data-erro-dupla]").textContent).toContain("Falha ao salvar");
  });
  it("remover tira da lista e 'Desfazer' inscreve de novo", async () => {
    const { estado } = montarDuplas([par("1", "Ana", "Bia")]);
    q<HTMLButtonElement>(".org__remover").click();
    await esperar();
    expect(store.removerDupla).toHaveBeenCalledWith("1");
    expect(estado.duplas).toHaveLength(0);
    expect(toasts()[0]).toContain("removida");
    q<HTMLButtonElement>(".toast__acao").click();
    await esperar();
    expect(store.adicionarDupla).toHaveBeenCalledTimes(1);
    expect(estado.duplas.map((d) => d.atletaA)).toEqual(["Ana"]);
  });
  it("com chaveamento gerado, editar e remover somem e o aviso aparece", () => {
    montarDuplas([par("1", "Ana", "Bia")], { matches: [] });
    expect(document.querySelectorAll(".org__acao-linha")).toHaveLength(0);
    expect(q<HTMLElement>("[data-aviso-chaveamento]").hidden).toBe(false);
  });
  it("editar corrige os atletas e não mexe nos vínculos quando o texto não mudou", async () => {
    const { estado } = montarDuplas([par("1", "Ana", "Bia")]);
    document.querySelector<HTMLButtonElement>(".org__acao-linha")!.click();
    const campos = document.querySelectorAll<HTMLInputElement>(".org__dupla-edicao input");
    digitar(campos[0], "Ana Lima");
    document.querySelector<HTMLFormElement>(".org__dupla-edicao")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await esperar();
    const dados = store.editarDupla.mock.calls[0][2];
    expect(dados).toMatchObject({ atletaA: "Ana Lima", atletaB: "Bia", jogadorAId: null, jogadorBId: undefined });
    expect(estado.duplas[0].atletaA).toBe("Ana Lima");
    expect(nomesNaLista()).toEqual(["Ana Lima & Bia"]);
  });
  it("cancelar a edição não grava", () => {
    montarDuplas([par("1", "Ana", "Bia")]);
    document.querySelector<HTMLButtonElement>(".org__acao-linha")!.click();
    Array.from(document.querySelectorAll<HTMLButtonElement>(".org__dupla-edicao button")).find((b) => b.textContent === "Cancelar")!.click();
    expect(store.editarDupla).not.toHaveBeenCalled();
    expect(nomesNaLista()).toEqual(["Ana & Bia"]);
  });
});

describe("colar lista", () => {
  function montar(duplas: Pair[] = []) {
    document.body.innerHTML = `<section id="s"><textarea data-colar-texto></textarea><p data-colar-resumo></p>
      <ul data-colar-previa></ul><button data-colar-confirmar disabled></button><p data-colar-erro></p></section>`;
    const estado = { duplas };
    ligarColarLista({
      secao: q("#s"), store: store as unknown as BracketStore, ref: REF, estado,
      avisar: (o) => { const d = document.createElement("div"); d.className = "toast"; d.innerHTML = '<span class="toast__texto"></span>'; d.firstElementChild!.textContent = o.texto; document.body.append(d); },
      aoMudar: vi.fn(), renderDuplas: vi.fn(),
    });
    return estado;
  }
  it("mostra a prévia com ✓ ✗ ⚠ e o resumo", () => {
    montar([par("1", "Ana", "Bia")]);
    digitar(q("[data-colar-texto]"), "1. Caio e Duda\nsó um nome\nbia & ana");
    const marcas = Array.from(document.querySelectorAll(".org__colar-marca")).map((m) => m.textContent);
    expect(marcas).toEqual(["✓", "✗", "⚠"]);
    expect(q("[data-colar-resumo]").textContent).toBe("1 válida · 1 inválida · 1 repetida");
    expect(q("[data-colar-confirmar]").textContent).toBe("Adicionar 1 dupla");
  });
  it("confirmar grava só as válidas, em uma escrita, com nomes internos distintos", async () => {
    const estado = montar();
    digitar(q("[data-colar-texto]"), "Ana & Bia\nCaio e Duda\nEdu / Fê");
    q<HTMLButtonElement>("[data-colar-confirmar]").click();
    await esperar();
    expect(store.adicionarDuplas).toHaveBeenCalledTimes(1);
    const lote = store.adicionarDuplas.mock.calls[0][1] as { nomeDupla: string }[];
    expect(lote).toHaveLength(3);
    expect(new Set(lote.map((l) => l.nomeDupla)).size).toBe(3);
    expect(estado.duplas).toHaveLength(3);
    expect(toasts()[0]).toBe("3 duplas adicionadas.");
    expect(q<HTMLTextAreaElement>("[data-colar-texto]").value).toBe("");
  });
  it("sem linhas válidas o botão fica desabilitado", () => {
    montar();
    digitar(q("[data-colar-texto]"), "xxx");
    expect(q<HTMLButtonElement>("[data-colar-confirmar]").disabled).toBe(true);
  });
  it("falha do banco mostra o erro e não limpa o texto", async () => {
    store.adicionarDuplas.mockResolvedValueOnce(erroR("NOME_DUPLICADO"));
    montar();
    digitar(q("[data-colar-texto]"), "Ana & Bia");
    q<HTMLButtonElement>("[data-colar-confirmar]").click();
    await esperar();
    expect(q("[data-colar-erro]").textContent).toContain("Já existe");
    expect(q<HTMLTextAreaElement>("[data-colar-texto]").value).toBe("Ana & Bia");
  });
  it("textoResumo avisa quando o limite de linhas foi excedido", () => {
    const texto = Array.from({ length: 201 }, (_, i) => `A${i} & B${i}`).join("\n");
    expect(textoResumo(interpretarLista(texto))).toContain("primeiras 200 linhas");
  });
});

describe("formato", () => {
  const HTML = `<section id="s"><form data-form-formato>
    <div data-sugestao hidden><p data-sugestao-texto></p><button type="button" data-usar-sugestao>Usar</button></div>
    <input type="radio" name="formato" value="eliminação simples" data-formato>
    <input type="radio" name="formato" value="dupla eliminação" data-formato>
    <input type="radio" name="formato" value="fase de grupos" data-formato>
    <div data-grupos-params hidden><input id="formato-grupos" name="numeroDeGrupos"><input id="formato-classificados" name="classificadosPorGrupo"></div>
    <p data-formato-dica></p><p data-erro-formato></p></form></section>`;
  const avisar = vi.fn();
  const montar = (nDuplas: number, configSalva: unknown = null) => {
    document.body.innerHTML = HTML;
    const estado = { duplas: Array.from({ length: nDuplas }, (_, i) => par(`p${i}`, `A${i}`, `B${i}`)), bracket: null, configSalva: configSalva as never };
    const ctl = ligarFormato({
      secao: q("#s"), store: store as unknown as BracketStore, ref: REF, estado,
      rascunho: criarRascunho("f:", memoria()), avisar, aoMudar: vi.fn(), atrasoMs: 600,
    });
    ctl.render();
    return { estado, ctl };
  };
  const marcar = (valor: string) => {
    const r = document.querySelector<HTMLInputElement>(`input[value="${valor}"]`)!;
    r.checked = true;
    r.dispatchEvent(new Event("change", { bubbles: true }));
  };
  beforeEach(() => { vi.useFakeTimers(); avisar.mockClear(); });
  afterEach(() => vi.useRealTimers());

  it("o formato salvo já vem marcado, com os parâmetros", () => {
    montar(8, { formato: "fase de grupos", numeroDeGrupos: 2, classificadosPorGrupo: 2 });
    expect(document.querySelector<HTMLInputElement>('input[value="fase de grupos"]')!.checked).toBe(true);
    expect(q<HTMLInputElement>("#formato-grupos").value).toBe("2");
    expect(q<HTMLElement>("[data-grupos-params]").hidden).toBe(false);
    expect(q("[data-formato-dica]").textContent).toBe(descreverGrupos(8, 2, 2));
  });
  it("salva sozinho depois de uma pausa, uma vez só", async () => {
    montar(4);
    marcar("dupla eliminação");
    expect(store.salvarConfig).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(store.salvarConfig).toHaveBeenCalledTimes(1);
    expect(store.salvarConfig.mock.calls[0][1]).toEqual({ formato: "dupla eliminação" });
    expect(avisar).toHaveBeenCalledWith({ texto: "Formato salvo." });
  });
  it("valor inválido mostra o problema e não salva", async () => {
    montar(8);
    marcar("fase de grupos");
    digitar(q("#formato-grupos"), "9");
    digitar(q("#formato-classificados"), "2");
    await vi.advanceTimersByTimeAsync(1000);
    expect(q("[data-erro-formato]").textContent).toContain("Número de grupos inválido");
    expect(store.salvarConfig).not.toHaveBeenCalled();
  });
  it("campo ainda vazio não vira erro", () => {
    montar(8);
    marcar("fase de grupos");
    expect(q("[data-erro-formato]").textContent).toBe("");
  });
  it("sugestão aparece e 'Usar sugestão' aplica e salva na hora", async () => {
    montar(8);
    expect(q<HTMLElement>("[data-sugestao]").hidden).toBe(false);
    q<HTMLButtonElement>("[data-usar-sugestao]").click();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.salvarConfig).toHaveBeenCalledTimes(1);
    expect(store.salvarConfig.mock.calls[0][1]).toEqual({ formato: "fase de grupos", numeroDeGrupos: 2, classificadosPorGrupo: 2 });
    expect(q<HTMLElement>("[data-sugestao]").hidden).toBe(true);
  });
  it("falha ao salvar mostra erro (aviso e junto do campo)", async () => {
    store.salvarConfig.mockResolvedValueOnce(erroR("FALHA_PERSISTENCIA"));
    montar(4);
    marcar("dupla eliminação");
    await vi.advanceTimersByTimeAsync(600);
    expect(avisar).toHaveBeenCalledWith(expect.objectContaining({ tipo: "erro" }));
    expect(q("[data-erro-formato]").textContent).toContain("Falha ao salvar");
  });
});

describe("nivelador", () => {
  const HTML = `<section id="s"><input type="checkbox" data-usar-nivelador checked>
    <div data-nivelador-conteudo><button data-sortear></button><button data-alfabetica></button>
    <p data-nivelador-estado></p><ol data-lista-seeding></ol><p data-erro-seeding></p></div></section>`;
  const avisar = vi.fn();
  const aplicarSeeds = vi.fn();
  const montar = () => {
    document.body.innerHTML = HTML;
    const estado = { duplas: [par("a", "Ana", "Bia"), par("b", "Caio", "Duda"), par("c", "Edu", "Fê")] };
    const ctl = ligarNivelador({
      secao: q("#s"), store: store as unknown as BracketStore, ref: REF, estado, avisar,
      aplicarSeeds, aoMudar: vi.fn(), atrasoMs: 500,
    });
    ctl.render();
    return ctl;
  };
  const ordem = () => Array.from(document.querySelectorAll<HTMLElement>(".org__nivelador-item")).map((l) => l.dataset.pairId);
  const botao = (id: string, attr: string) => document.querySelector<HTMLButtonElement>(`[data-pair-id="${id}"] [${attr}]`)!;
  beforeEach(() => { vi.useFakeTimers(); avisar.mockClear(); aplicarSeeds.mockClear(); });
  afterEach(() => vi.useRealTimers());

  it("começa em ordem alfabética, com posições e botões nos limites desabilitados", () => {
    montar();
    expect(ordem()).toEqual(["a", "b", "c"]);
    expect(botao("a", "data-sobe").disabled).toBe(true);
    expect(botao("c", "data-fim").disabled).toBe(true);
    expect(document.querySelector(".org__nivelador-pos")!.textContent).toBe("1º");
  });
  it("'Topo' e 'Fim' reordenam e salvam sozinho depois da pausa", async () => {
    montar();
    botao("c", "data-topo").click();
    expect(ordem()).toEqual(["c", "a", "b"]);
    botao("c", "data-fim").click();
    expect(ordem()).toEqual(["a", "b", "c"]);
    botao("b", "data-topo").click();
    expect(store.salvarSeeding).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(store.salvarSeeding).toHaveBeenCalledTimes(1);
    expect(store.salvarSeeding.mock.calls[0][1]).toEqual([
      { pairId: "b", posicao: 1 }, { pairId: "a", posicao: 2 }, { pairId: "c", posicao: 3 },
    ]);
    expect(aplicarSeeds.mock.calls[0][0].get("b")).toBe(1);
    expect(avisar).toHaveBeenCalledWith({ texto: "Nivelador salvo." });
  });
  it("arrastar pela alça (Pointer Events) move a dupla", async () => {
    montar();
    const itens = Array.from(document.querySelectorAll<HTMLElement>(".org__nivelador-item"));
    itens.forEach((el, i) => { el.getBoundingClientRect = () => ({ top: i * 50, height: 50, bottom: i * 50 + 50, left: 0, right: 100, width: 100, x: 0, y: i * 50, toJSON: () => ({}) }); });
    const alca = itens[2].querySelector<HTMLElement>(".org__nivelador-alca")!;
    const ev = (tipo: string, y = 0) => { const e = new Event(tipo, { bubbles: true, cancelable: true }) as Event & { clientY: number; pointerId: number }; e.clientY = y; e.pointerId = 1; return e; };
    alca.dispatchEvent(ev("pointerdown", 125));
    alca.dispatchEvent(ev("pointermove", 10));
    expect(ordem()).toEqual(["c", "a", "b"]);
    alca.dispatchEvent(ev("pointerup", 10));
    await vi.advanceTimersByTimeAsync(500);
    expect(store.salvarSeeding).toHaveBeenCalledTimes(1);
  });
  it("'Sortear e fixar' embaralha e salva na hora", async () => {
    montar();
    q<HTMLButtonElement>("[data-sortear]").click();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.salvarSeeding).toHaveBeenCalledTimes(1);
    expect(new Set(ordem())).toEqual(new Set(["a", "b", "c"]));
  });
  it("'Ordem alfabética' desfaz a ordem montada e salva", async () => {
    montar();
    botao("c", "data-topo").click();
    q<HTMLButtonElement>("[data-alfabetica]").click();
    await vi.advanceTimersByTimeAsync(0);
    expect(ordem()).toEqual(["a", "b", "c"]);
    expect(store.salvarSeeding).toHaveBeenCalledTimes(1);
  });
  it("falha ao salvar mostra erro e não atualiza os seeds", async () => {
    store.salvarSeeding.mockResolvedValueOnce(erroR("FALHA_PERSISTENCIA"));
    montar();
    botao("c", "data-topo").click();
    await vi.advanceTimersByTimeAsync(500);
    expect(q("[data-erro-seeding]").textContent).toContain("Falha ao salvar");
    expect(aplicarSeeds).not.toHaveBeenCalled();
  });
});

describe("resumo antes de gerar", () => {
  it("duplas · formato · nivelador", () => {
    expect(resumirGeracao({ nDuplas: 8, config: { formato: "fase de grupos", numeroDeGrupos: 2, classificadosPorGrupo: 2 }, niveladorDefinido: true }))
      .toBe("8 duplas · Fase de grupos (2 grupos, 2 classificam) · Nivelador: sua ordem");
    expect(resumirGeracao({ nDuplas: 1, config: { formato: "dupla eliminação" }, niveladorDefinido: false }))
      .toBe("1 dupla · Dupla eliminação · Nivelador: sorteio");
    expect(resumirGeracao({ nDuplas: 0, config: null, niveladorDefinido: false })).toContain("falta escolher");
  });
});
