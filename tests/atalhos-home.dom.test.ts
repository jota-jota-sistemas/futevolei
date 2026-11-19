// @vitest-environment happy-dom
//
// Home: atalho "Organizar" nos cards que a pessoa logada gerencia.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { iniciarAtalhosHome } from "../src/scripts/atalhos-home";
import type { CampeonatoStore } from "../src/store/campeonatoStore";
import type { PapelGerenciar } from "../src/domain/auth/types";

function montar() {
  const card = (id: string, nome: string) => `
    <article data-evento data-id="${id}" class="event-card">
      <div class="event-card__corpo">
        <h3>${nome}</h3>
        <a class="btn-destaque event-card__cta" href="/campeonatos/${id}">Ver evento</a>
      </div>
    </article>`;
  document.body.innerHTML = `<div data-grid-eventos>${card("copa-2026", "Copa")}${card("acai-2026", "Açaí")}${card("rio-2026", "Rio")}</div>`;
}

const atalhos = () => Array.from(document.querySelectorAll<HTMLAnchorElement>(".event-card__organizar"));
const idsComAtalho = () =>
  atalhos().map((a) => a.closest<HTMLElement>("[data-evento]")!.dataset.id);

function storeCom(ids: string[], resposta?: unknown) {
  const listarMeus = vi.fn(async () =>
    resposta ?? { ok: true, valor: ids.map((id) => ({ id })) }
  );
  return { listarMeus, store: { listarMeus } as unknown as CampeonatoStore };
}

const iniciar = (papel: PapelGerenciar | null, store?: CampeonatoStore) =>
  iniciarAtalhosHome({
    descobrir: async () => papel,
    criarCampeonatoStore: () => store ?? ({} as CampeonatoStore),
  });

describe("atalhos de organizar na home", () => {
  beforeEach(montar);

  it("visitante ou conta comum: nenhum atalho", async () => {
    await iniciar(null);
    expect(atalhos()).toHaveLength(0);
  });

  it("administrador: todos os cards, sem consultar a lista de donos", async () => {
    const { store, listarMeus } = storeCom([]);
    await iniciar("admin", store);
    expect(idsComAtalho()).toEqual(["copa-2026", "acai-2026", "rio-2026"]);
    expect(listarMeus).not.toHaveBeenCalled();
  });

  it("organizador: só os cards dos eventos dele (listarMeus, incluindo arquivados)", async () => {
    const { store, listarMeus } = storeCom(["acai-2026"]);
    await iniciar("organizador", store);
    expect(idsComAtalho()).toEqual(["acai-2026"]);
    expect(listarMeus).toHaveBeenCalledWith({ incluirArquivados: true });
  });

  it("o link leva à organização do evento, com texto 'Organizar', dentro do corpo do card", async () => {
    await iniciar("admin");
    const a = atalhos()[0];
    expect(a.textContent).toBe("Organizar");
    expect(a.getAttribute("href")).toBe("/campeonatos/copa-2026/organizar");
    expect(a.parentElement!.classList.contains("event-card__corpo")).toBe(true);
    // Fica depois do botão "Ver evento".
    expect(a.previousElementSibling!.classList.contains("event-card__cta")).toBe(true);
  });

  it("organizador sem eventos, ou erro ao ler a lista dele: nenhum atalho", async () => {
    await iniciar("organizador", storeCom([]).store);
    expect(atalhos()).toHaveLength(0);
    await iniciar("organizador", storeCom([], { ok: false, erro: { code: "FALHA_LEITURA" } }).store);
    expect(atalhos()).toHaveLength(0);
  });

  it("é idempotente: rodar de novo não duplica o link", async () => {
    await iniciar("admin");
    await iniciar("admin");
    expect(atalhos()).toHaveLength(3);
  });

  it("falha ao descobrir o papel ou ao criar a store: a home segue sem atalhos, sem lançar", async () => {
    await expect(
      iniciarAtalhosHome({
        descobrir: async () => {
          throw new Error("x");
        },
      })
    ).resolves.toBeUndefined();
    await expect(
      iniciarAtalhosHome({
        descobrir: async () => "organizador",
        criarCampeonatoStore: () => {
          throw new Error("sem env");
        },
      })
    ).resolves.toBeUndefined();
    expect(atalhos()).toHaveLength(0);
  });

  it("sem cards na página: nem descobre o papel", async () => {
    document.body.innerHTML = "<p>Nenhum evento</p>";
    const descobrir = vi.fn(async () => "admin" as PapelGerenciar);
    await iniciarAtalhosHome({ descobrir });
    expect(descobrir).not.toHaveBeenCalled();
  });
});
