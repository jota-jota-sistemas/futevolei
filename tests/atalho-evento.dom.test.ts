// @vitest-environment happy-dom
//
// Página pública do evento: botões "Organizar" e "Editar" só para quem gerencia.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { iniciarAtalhoEvento } from "../src/scripts/atalho-evento";
import type { CampeonatoStore } from "../src/store/campeonatoStore";
import type { PapelGerenciar } from "../src/domain/auth/types";

function montar(id = "copa-2026") {
  document.body.innerHTML = `
    <div data-gestao data-campeonato-id="${id}" hidden>
      <a data-gestao-organizar href="#">Organizar</a>
      <a data-gestao-editar href="#">Editar campeonato</a>
    </div>`;
}
const bloco = () => document.querySelector<HTMLElement>("[data-gestao]")!;
const link = (sel: string) => document.querySelector<HTMLAnchorElement>(sel)!;

function storeCom(resposta: unknown) {
  const podeGerenciar = vi.fn(async () => resposta);
  return { podeGerenciar, store: { podeGerenciar } as unknown as CampeonatoStore };
}

const iniciar = (papel: PapelGerenciar | null, store?: CampeonatoStore) =>
  iniciarAtalhoEvento({ descobrir: async () => papel, criarCampeonatoStore: () => store ?? ({} as CampeonatoStore) });

describe("atalhos do evento (Organizar e Editar)", () => {
  beforeEach(() => montar());

  it("visitante ou conta comum: o bloco continua oculto e sem links", async () => {
    await iniciar(null);
    expect(bloco().hidden).toBe(true);
    expect(link("[data-gestao-organizar]").getAttribute("href")).toBe("#");
  });

  it("administrador: revela e preenche os links, sem consultar a posse", async () => {
    const { store, podeGerenciar } = storeCom({ ok: true, valor: false });
    await iniciar("admin", store);
    expect(bloco().hidden).toBe(false);
    expect(link("[data-gestao-organizar]").getAttribute("href")).toBe("/campeonatos/copa-2026/organizar");
    expect(link("[data-gestao-editar]").getAttribute("href")).toBe("/gerenciar_campeonatos/editar?id=copa-2026");
    expect(podeGerenciar).not.toHaveBeenCalled();
  });

  it("organizador dono: revela (a posse vem do banco)", async () => {
    const { store, podeGerenciar } = storeCom({ ok: true, valor: true });
    await iniciar("organizador", store);
    expect(podeGerenciar).toHaveBeenCalledWith("copa-2026");
    expect(bloco().hidden).toBe(false);
  });

  it("organizador de outro evento, ou erro ao conferir: não revela nada", async () => {
    await iniciar("organizador", storeCom({ ok: true, valor: false }).store);
    expect(bloco().hidden).toBe(true);
    await iniciar("organizador", storeCom({ ok: false, erro: { code: "FALHA_LEITURA" } }).store);
    expect(bloco().hidden).toBe(true);
    expect(link("[data-gestao-organizar]").getAttribute("href")).toBe("#");
  });

  it("o id do evento é escapado nos links", async () => {
    montar("a/b?x=1");
    await iniciar("admin");
    expect(link("[data-gestao-organizar]").getAttribute("href")).toBe("/campeonatos/a%2Fb%3Fx%3D1/organizar");
    expect(link("[data-gestao-editar]").getAttribute("href")).toBe("/gerenciar_campeonatos/editar?id=a%2Fb%3Fx%3D1");
  });

  it("falhas não lançam e nada é revelado", async () => {
    await expect(
      iniciarAtalhoEvento({
        descobrir: async () => {
          throw new Error("x");
        },
      })
    ).resolves.toBeUndefined();
    await expect(
      iniciarAtalhoEvento({
        descobrir: async () => "organizador",
        criarCampeonatoStore: () => {
          throw new Error("sem env");
        },
      })
    ).resolves.toBeUndefined();
    expect(bloco().hidden).toBe(true);
  });

  it("página sem o bloco (ou sem id): nem descobre o papel", async () => {
    document.body.innerHTML = "<p>x</p>";
    const descobrir = vi.fn(async () => "admin" as PapelGerenciar);
    await iniciarAtalhoEvento({ descobrir });
    montar("");
    await iniciarAtalhoEvento({ descobrir });
    expect(descobrir).not.toHaveBeenCalled();
  });
});

describe("HTML público da página do evento", () => {
  const fonte = readFileSync(join(__dirname, "..", "src", "pages", "campeonatos", "[id].astro"), "utf8");

  it("o bloco nasce oculto e sem os caminhos de gerenciar no HTML", () => {
    expect(fonte).toMatch(/data-gestao[^>]*data-campeonato-id=\{campeonato\.id\}[^>]*hidden/);
    // Os caminhos de gerenciar só são preenchidos pelo script, no navegador.
    expect(fonte).not.toMatch(/gerenciar_campeonatos|\/gerenciar/);
    expect(fonte).not.toMatch(/GuardaAcesso|guardarAcesso/); // a página pública continua sem guarda
  });
});
