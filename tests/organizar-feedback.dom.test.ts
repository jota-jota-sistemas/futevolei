// @vitest-environment happy-dom
//
// Base de feedback e navegação da organização: toast (com "Desfazer"), rascunho
// dos campos e barra de seções.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  DURACAO_LONGA_MS,
  DURACAO_PADRAO_MS,
  MAX_TOASTS,
  mostrarToast,
} from "../src/scripts/organizar/toast";
import { criarRascunho, ligarRascunho, prefixoDoRascunho } from "../src/scripts/organizar/rascunho";
import { ligarSecoes } from "../src/scripts/organizar/secoes";

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const todos = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));
const textos = () => todos(".toast__texto").map((e) => e.textContent);

describe("toast", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("aparece num contêiner no pé (criado se não existir), como aviso 'status', e some sozinho", () => {
    mostrarToast({ texto: "Dupla Ana & Bia adicionada" });
    expect($("[data-toasts]")).not.toBeNull();
    expect(textos()).toEqual(["Dupla Ana & Bia adicionada"]);
    expect($(".toast").getAttribute("role")).toBe("status");
    vi.advanceTimersByTime(DURACAO_PADRAO_MS - 1);
    expect(textos()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(textos()).toHaveLength(0);
  });

  it("usa o contêiner que já está na página (componente Toasts)", () => {
    document.body.innerHTML = `<div data-toasts id="meu"></div>`;
    mostrarToast({ texto: "x" });
    expect(document.querySelectorAll("[data-toasts]")).toHaveLength(1);
    expect($("#meu .toast")).not.toBeNull();
  });

  it("erro é 'alert', fica mais tempo e pode ser fechado no botão (alvo com rótulo)", () => {
    mostrarToast({ texto: "Falha ao salvar", tipo: "erro" });
    expect($(".toast").getAttribute("role")).toBe("alert");
    expect($(".toast").classList.contains("toast--erro")).toBe(true);
    vi.advanceTimersByTime(DURACAO_PADRAO_MS + 1);
    expect(textos()).toHaveLength(1);
    expect($(".toast__fechar").getAttribute("aria-label")).toBe("Fechar aviso");
    $<HTMLButtonElement>(".toast__fechar").click();
    expect(textos()).toHaveLength(0);
  });

  it("'Desfazer': roda a ação uma vez e fecha o aviso; o botão trava enquanto roda", async () => {
    let resolver: () => void = () => undefined;
    const aoDesfazer = vi.fn(() => new Promise<void>((r) => (resolver = r)));
    mostrarToast({ texto: "Dupla removida", desfazer: { aoDesfazer } });
    const botao = $<HTMLButtonElement>(".toast__acao");
    expect(botao.textContent).toBe("Desfazer");
    botao.click();
    botao.click();
    await Promise.resolve();
    expect(aoDesfazer).toHaveBeenCalledTimes(1);
    expect(botao.disabled).toBe(true);
    resolver();
    await vi.advanceTimersByTimeAsync(0);
    expect(textos()).toHaveLength(0);
  });

  it("com 'Desfazer' fica mais tempo na tela; a duração pode ser escolhida; 0 = não some", () => {
    mostrarToast({ texto: "a", desfazer: { aoDesfazer: () => undefined } });
    vi.advanceTimersByTime(DURACAO_PADRAO_MS + 1);
    expect(textos()).toEqual(["a"]);
    vi.advanceTimersByTime(DURACAO_LONGA_MS);
    expect(textos()).toHaveLength(0);

    mostrarToast({ texto: "curto", duracaoMs: 500 });
    vi.advanceTimersByTime(501);
    expect(textos()).toHaveLength(0);

    mostrarToast({ texto: "fixo", duracaoMs: 0 });
    vi.advanceTimersByTime(60_000);
    expect(textos()).toEqual(["fixo"]);
  });

  it("empilha no máximo MAX_TOASTS: o mais antigo sai", () => {
    for (let i = 1; i <= MAX_TOASTS + 2; i++) mostrarToast({ texto: `aviso ${i}` });
    expect(textos()).toEqual(["aviso 3", "aviso 4", "aviso 5"]);
  });

  it("fechar é idempotente e a ação que lança não quebra o aviso", async () => {
    const t = mostrarToast({ texto: "x", desfazer: { aoDesfazer: () => Promise.reject(new Error("falhou")) } });
    $<HTMLButtonElement>(".toast__acao").click();
    await vi.advanceTimersByTimeAsync(0);
    expect(textos()).toHaveLength(0);
    expect(() => t.fechar()).not.toThrow();
  });

  it("o texto é exibido como texto (sem HTML)", () => {
    mostrarToast({ texto: "<img src=x onerror=alert(1)>" });
    expect(document.querySelector(".toast img")).toBeNull();
    expect(textos()[0]).toBe("<img src=x onerror=alert(1)>");
  });
});

describe("rascunho", () => {
  function memoria() {
    const d = new Map<string, string>();
    return {
      d,
      getItem: (k: string) => d.get(k) ?? null,
      setItem: (k: string, v: string) => void d.set(k, v),
      removeItem: (k: string) => void d.delete(k),
    };
  }
  const prefixo = prefixoDoRascunho("copa-2026", "cat-1");

  it("o prefixo isola campeonato e categoria", () => {
    expect(prefixo).toBe("pingo:rascunho:copa-2026:cat-1:");
    expect(prefixoDoRascunho("copa-2026", "cat-2")).not.toBe(prefixo);
  });

  it("salvar/ler/limpar; valor vazio apaga a chave", () => {
    const m = memoria();
    const r = criarRascunho(prefixo, m);
    r.salvar("atletaA", "Ana");
    expect(m.d.get(`${prefixo}atletaA`)).toBe("Ana");
    expect(r.ler("atletaA")).toBe("Ana");
    r.salvar("atletaA", "");
    expect(m.d.size).toBe(0);
    r.salvar("atletaB", "Bia");
    r.limpar("atletaB");
    expect(r.ler("atletaB")).toBe("");
  });

  it("armazenamento ausente ou que lança: tudo é ignorado em silêncio", () => {
    const sem = criarRascunho(prefixo, null);
    expect(() => sem.salvar("a", "x")).not.toThrow();
    expect(sem.ler("a")).toBe("");
    const quebrado = criarRascunho(prefixo, {
      getItem: () => {
        throw new Error("x");
      },
      setItem: () => {
        throw new Error("x");
      },
      removeItem: () => {
        throw new Error("x");
      },
    });
    expect(() => quebrado.salvar("a", "x")).not.toThrow();
    expect(quebrado.ler("a")).toBe("");
    expect(() => quebrado.limpar("a")).not.toThrow();
  });

  describe("ligado a um formulário", () => {
    beforeEach(() => {
      document.body.innerHTML = `<form><input name="atletaA"><input name="atletaB"><input name="numeroDeGrupos"></form>`;
    });
    const campo = (n: string) => $<HTMLInputElement>(`[name="${n}"]`);
    const digitar = (n: string, v: string) => {
      campo(n).value = v;
      campo(n).dispatchEvent(new Event("input"));
    };

    it("guarda a cada digitação e restaura num recarregamento (só campos vazios)", () => {
      const m = memoria();
      ligarRascunho($("form"), ["atletaA", "atletaB"], criarRascunho(prefixo, m));
      digitar("atletaA", "Ana");
      digitar("atletaB", "Bi");
      // "Recarrega": formulário novo, mesmo armazenamento.
      document.body.innerHTML = `<form><input name="atletaA"><input name="atletaB" value="já preenchido"><input name="numeroDeGrupos"></form>`;
      ligarRascunho($("form"), ["atletaA", "atletaB"], criarRascunho(prefixo, m));
      expect(campo("atletaA").value).toBe("Ana");
      expect(campo("atletaB").value).toBe("já preenchido"); // o que já está lá vence
    });

    it("limpar() apaga o rascunho (depois de salvar com sucesso)", () => {
      const m = memoria();
      const lig = ligarRascunho($("form"), ["atletaA", "atletaB"], criarRascunho(prefixo, m));
      digitar("atletaA", "Ana");
      expect(m.d.size).toBe(1);
      lig.limpar();
      expect(m.d.size).toBe(0);
    });

    it("campos que não existem na página são ignorados", () => {
      expect(() => ligarRascunho($("form"), ["naoExiste"], criarRascunho(prefixo, memoria()))).not.toThrow();
    });
  });
});

describe("barra de seções", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <nav>
        <a data-secao-link href="#titulo-duplas">Duplas</a>
        <a data-secao-link href="#titulo-formato">Formato</a>
        <a data-secao-link href="#titulo-gerar">Chaveamento</a>
        <a data-secao-link href="#titulo-estado">Jogos</a>
      </nav>
      <h2 id="titulo-duplas"></h2><h2 id="titulo-formato"></h2><h2 id="titulo-gerar"></h2><h2 id="titulo-estado"></h2>`;
  });
  const atual = () => todos("[data-secao-link][aria-current]").map((a) => a.textContent);

  it("marca a primeira seção da barra que está na faixa do topo e troca ao rolar", () => {
    let aoMudar: (v: Set<string>) => void = () => undefined;
    let alvos: Element[] = [];
    ligarSecoes({
      criarObservador: (cb, a) => {
        aoMudar = cb;
        alvos = a;
        return () => undefined;
      },
    });
    expect(alvos.map((a) => a.id)).toEqual(["titulo-duplas", "titulo-formato", "titulo-gerar", "titulo-estado"]);
    aoMudar(new Set(["titulo-formato"]));
    expect(atual()).toEqual(["Formato"]);
    aoMudar(new Set(["titulo-formato", "titulo-gerar"]));
    expect(atual()).toEqual(["Formato"]); // a primeira na ordem da barra
    aoMudar(new Set(["titulo-estado"]));
    expect(atual()).toEqual(["Jogos"]);
    aoMudar(new Set());
    expect(atual()).toEqual([]);
  });

  it("sem links ou sem alvos na página: não faz nada; sem IntersectionObserver: segue como âncoras", () => {
    document.body.innerHTML = "<p>x</p>";
    expect(() => ligarSecoes()).not.toThrow();
    document.body.innerHTML = `<a data-secao-link href="#nao-existe">x</a>`;
    const criar = vi.fn(() => () => undefined);
    ligarSecoes({ criarObservador: criar });
    expect(criar).not.toHaveBeenCalled();
    // happy-dom pode não ter IntersectionObserver: o padrão não pode lançar.
    document.body.innerHTML = `<a data-secao-link href="#a">A</a><h2 id="a"></h2>`;
    expect(() => ligarSecoes()).not.toThrow();
  });
});
