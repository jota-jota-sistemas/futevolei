// @vitest-environment happy-dom
//
// Ajuste do link "Voltar" da faixa de topo.
import { describe, it, expect, beforeEach } from "vitest";
import { trocarVoltar } from "../src/scripts/topo";

describe("trocarVoltar", () => {
  beforeEach(() => {
    document.body.innerHTML = `<a class="topo__voltar" data-voltar href="/gerenciar"><span aria-hidden="true">←</span> Voltar ao painel</a>`;
  });

  it("troca o destino e o texto, mantendo a seta decorativa", () => {
    trocarVoltar(document, "/", "Voltar ao início");
    const a = document.querySelector<HTMLAnchorElement>("[data-voltar]")!;
    expect(a.getAttribute("href")).toBe("/");
    expect(a.textContent).toBe("← Voltar ao início");
    expect(a.querySelector("span")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("sem o link na página, não faz nada", () => {
    document.body.innerHTML = "<p>x</p>";
    expect(() => trocarVoltar(document, "/", "x")).not.toThrow();
  });
});
