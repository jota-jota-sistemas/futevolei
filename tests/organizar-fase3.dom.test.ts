// @vitest-environment happy-dom
//
// Fase 3: fila "Próximos jogos" e tela de placar com a store/gravação simuladas.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import type { Bracket, Pair } from "../src/domain/bracket/types";
import { gerarChaveamento } from "../src/domain/bracket/generator";
import { numerarJogos } from "../src/domain/bracket/ordenacao";
import { ligarFila, LIMITE_FILA } from "../src/scripts/organizar/fila";
import { abrirTelaPlacar, DICA_EMPATE } from "../src/scripts/organizar/placar";

const duplas = (n: number): Pair[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`, nomeDupla: `D${i + 1}`, atletaA: `A${i + 1}`, atletaB: `B${i + 1}`,
    seed: i + 1, criadoEm: "2026-01-01T00:00:00.000Z",
  }));
const gerar = (n: number, config: Parameters<typeof gerarChaveamento>[0]["config"]): Bracket => {
  const r = gerarChaveamento({ duplas: duplas(n), config });
  if (!r.ok) throw new Error("falha");
  return numerarJogos({ ...r.bracket, campeonatoId: "c", categoriaId: "k" });
};
const q = <T extends Element>(sel: string) => document.querySelector(sel) as T;
const esperar = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("fila de próximos jogos", () => {
  const montar = (bracket: Bracket | null) => {
    document.body.innerHTML = `<section id="s"><section data-fila hidden><ul data-fila-lista></ul>
      <button data-fila-ver-todos hidden></button></section></section>`;
    const abrir = vi.fn();
    const ctl = ligarFila({ secao: q("#s"), bracket: () => bracket, abrirPlacar: abrir });
    ctl.render();
    return abrir;
  };
  it("sem chaveamento a seção fica oculta", () => {
    montar(null);
    expect(q<HTMLElement>("[data-fila]").hidden).toBe(true);
  });
  it("mostra até 5 jogos e 'Ver todos' abre o resto", () => {
    montar(gerar(8, { formato: "fase de grupos", numeroDeGrupos: 2, classificadosPorGrupo: 2 }));
    expect(q<HTMLElement>("[data-fila]").hidden).toBe(false);
    expect(document.querySelectorAll(".org__fila-item")).toHaveLength(LIMITE_FILA);
    const ver = q<HTMLButtonElement>("[data-fila-ver-todos]");
    expect(ver.hidden).toBe(false);
    ver.click();
    expect(document.querySelectorAll(".org__fila-item").length).toBeGreaterThan(LIMITE_FILA);
    expect(ver.textContent).toBe("Ver menos");
  });
  it("'Lançar placar' abre a tela do jogo certo", () => {
    const b = gerar(4, { formato: "dupla eliminação" });
    const abrir = montar(b);
    const primeiro = q<HTMLElement>(".org__fila-item");
    primeiro.querySelector<HTMLButtonElement>("button")!.click();
    expect(abrir).toHaveBeenCalledWith(primeiro.dataset.matchId);
    expect(primeiro.querySelector(".org__fila-jogo")!.textContent).toMatch(/^Jogo \d+$/);
    expect(primeiro.querySelector(".org__fila-duplas")!.textContent).toContain("×");
  });
  it("jogo ao vivo aparece primeiro, com o placar e 'Continuar placar'", () => {
    const b = gerar(4, { formato: "dupla eliminação" });
    const alvo = b.matches.filter((m) => m.a.pairId && m.b.pairId && !m.a.bye && !m.b.bye).pop()!;
    const vivo = { ...b, matches: b.matches.map((m) => (m.id === alvo.id ? { ...m, placarA: 7, placarB: 5 } : m)) };
    montar(vivo);
    const primeiro = q<HTMLElement>(".org__fila-item");
    expect(primeiro.dataset.matchId).toBe(alvo.id);
    expect(primeiro.textContent).toContain("Ao vivo: 7 a 5");
    expect(primeiro.querySelector("button")!.textContent).toBe("Continuar placar");
  });
  it("sem jogo pronto, explica", () => {
    const b = gerar(4, { formato: "dupla eliminação" });
    montar({ ...b, matches: b.matches.map((m) => ({ ...m, vencedorId: m.a.pairId ?? "x" })) });
    expect(q(".org__fila-vazio").textContent).toContain("Nenhum jogo pronto");
  });
});

describe("tela de placar", () => {
  const bracket = gerar(4, { formato: "dupla eliminação" });
  const jogo = bracket.matches.find((m) => m.a.pairId && m.b.pairId && !m.a.bye && !m.b.bye)!;
  const deps = () => ({
    bracket: () => bracket,
    salvarAoVivo: vi.fn(async () => null as string | null),
    registrar: vi.fn(async () => null as string | null),
    avisar: vi.fn(),
  });
  beforeEach(() => {
    // happy-dom não implementa showModal/close de <dialog> por completo.
    (HTMLDialogElement.prototype as unknown as { showModal: () => void }).showModal = function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    (HTMLDialogElement.prototype as unknown as { close: () => void }).close = function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  });
  const campos = () => document.querySelectorAll<HTMLInputElement>(".placar-tela__pontos");
  const tecla = (el: HTMLElement, key: string) => el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

  it("abre com o campo do primeiro lado em foco e teclado numérico", () => {
    abrirTelaPlacar(deps(), jogo.id);
    expect(document.activeElement).toBe(campos()[0]);
    expect(campos()[0].inputMode).toBe("numeric");
  });
  it("não abre duas telas ao mesmo tempo", () => {
    const d = deps();
    abrirTelaPlacar(d, jogo.id);
    abrirTelaPlacar(d, jogo.id);
    expect(document.querySelectorAll(".placar-tela")).toHaveLength(1);
  });
  it("empate: 'Partida encerrada' desabilitada, com a dica", () => {
    abrirTelaPlacar(deps(), jogo.id);
    const enc = q<HTMLButtonElement>(".placar-tela__encerrar");
    expect(enc.disabled).toBe(true);
    expect(q(".placar-tela__dica").textContent).toBe(DICA_EMPATE);
    q<HTMLButtonElement>(".placar-tela__mais").click();
    expect(enc.disabled).toBe(false);
    expect(q(".placar-tela__dica").textContent).toBe("");
  });
  it("cada +1 grava o placar ao vivo", async () => {
    const d = deps();
    abrirTelaPlacar(d, jogo.id);
    q<HTMLButtonElement>(".placar-tela__mais").click();
    q<HTMLButtonElement>(".placar-tela__mais").click();
    await esperar();
    expect(d.salvarAoVivo).toHaveBeenLastCalledWith(jogo.id, 2, 0);
  });
  it("Enter no primeiro campo vai para o segundo; Enter no segundo encerra", async () => {
    const d = deps();
    abrirTelaPlacar(d, jogo.id);
    const [a, b] = Array.from(campos());
    a.value = "15";
    a.dispatchEvent(new Event("input", { bubbles: true }));
    tecla(a, "Enter");
    expect(document.activeElement).toBe(b);
    b.value = "9";
    b.dispatchEvent(new Event("input", { bubbles: true }));
    tecla(b, "Enter");
    await esperar();
    expect(d.registrar).toHaveBeenCalledWith(jogo.id, 15, 9);
    expect(document.querySelector(".placar-tela")).toBeNull();
  });
  it("Enter com empate não encerra e explica", async () => {
    const d = deps();
    abrirTelaPlacar(d, jogo.id);
    const [, b] = Array.from(campos());
    tecla(b, "Enter");
    await esperar();
    expect(d.registrar).not.toHaveBeenCalled();
    expect(q(".placar-tela__msg").textContent).toBe(DICA_EMPATE);
  });
  it("fechar com placar parcial avisa que ficou salvo", async () => {
    const d = deps();
    abrirTelaPlacar(d, jogo.id);
    q<HTMLButtonElement>(".placar-tela__mais").click();
    await esperar();
    Array.from(document.querySelectorAll<HTMLButtonElement>(".placar-tela__acoes button")).find((x) => x.textContent === "Fechar")!.click();
    await esperar();
    expect(d.avisar).toHaveBeenCalledWith({ texto: "Placar parcial salvo (ao vivo)." });
  });
  it("fechar sem nenhum ponto não avisa", async () => {
    const d = deps();
    abrirTelaPlacar(d, jogo.id);
    Array.from(document.querySelectorAll<HTMLButtonElement>(".placar-tela__acoes button")).find((x) => x.textContent === "Fechar")!.click();
    await esperar();
    expect(d.avisar).not.toHaveBeenCalled();
  });
  it("erro ao encerrar mantém a tela aberta com a mensagem", async () => {
    const d = deps();
    d.registrar.mockResolvedValueOnce("Falha ao salvar.");
    abrirTelaPlacar(d, jogo.id);
    q<HTMLButtonElement>(".placar-tela__mais").click();
    q<HTMLButtonElement>(".placar-tela__encerrar").click();
    await esperar();
    expect(q(".placar-tela__msg").textContent).toBe("Falha ao salvar.");
    expect(q<HTMLButtonElement>(".placar-tela__encerrar").disabled).toBe(false);
    expect(document.querySelector(".placar-tela")).not.toBeNull();
  });
});

describe("página (Fase 3)", () => {
  const fonte = readFileSync("src/pages/campeonatos/[id]/organizar/[categoria].astro", "utf8");
  it.each(["data-fila", "data-fila-lista", "data-fila-ver-todos", "data-matamata-info", "data-matamata-previa", "data-matamata-confirmar", "data-matamata-cancelar", 'id="titulo-fila"'])(
    "tem %s no markup",
    (m) => expect(fonte).toContain(m)
  );
  it("a página não tem mais a tela de placar embutida", () => {
    expect(fonte).not.toContain('document.createElement("dialog")');
    expect(fonte).toContain("scripts/organizar/placar");
  });
});
