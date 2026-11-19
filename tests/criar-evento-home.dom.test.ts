// @vitest-environment happy-dom
//
// Home: botão "Criar evento" só para administrador e organizador; e a chegada ao
// formulário de novo campeonato depois da guarda.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import type { PapelGerenciar } from "../src/domain/auth/types";
import { iniciarCriarEventoHome } from "../src/scripts/criar-evento-home";
import { rolarParaFormularioSeHash } from "../src/scripts/rolar-para-formulario";

const botao = () => document.querySelector<HTMLAnchorElement>("[data-criar-evento]")!;
const iniciar = (papel: PapelGerenciar | null) =>
  iniciarCriarEventoHome({ descobrir: async () => papel });

beforeEach(() => {
  document.body.innerHTML = '<a data-criar-evento hidden>Criar evento</a>';
});

describe("botão Criar evento (home)", () => {
  it.each(["admin", "organizador"] as const)("%s vê o botão, com o link do formulário", async (papel) => {
    await iniciar(papel);
    expect(botao().hidden).toBe(false);
    expect(botao().getAttribute("href")).toMatch(/\/gerenciar_campeonatos#novo-campeonato$/);
  });
  it("visitante e conta comum não veem nada", async () => {
    await iniciar(null);
    expect(botao().hidden).toBe(true);
    expect(botao().getAttribute("href")).toBeNull();
  });
  it("falha ao descobrir o papel não lança e mantém oculto", async () => {
    await expect(
      iniciarCriarEventoHome({ descobrir: async () => { throw new Error("x"); } })
    ).resolves.toBeUndefined();
    expect(botao().hidden).toBe(true);
  });
  it("sem o elemento na página, nem consulta o papel", async () => {
    document.body.innerHTML = "";
    const descobrir = vi.fn(async () => "admin" as PapelGerenciar);
    await iniciarCriarEventoHome({ descobrir });
    expect(descobrir).not.toHaveBeenCalled();
  });
  it("chamar duas vezes é inofensivo", async () => {
    await iniciar("admin");
    await iniciar("admin");
    expect(document.querySelectorAll("[data-criar-evento]")).toHaveLength(1);
    expect(botao().hidden).toBe(false);
  });
});

describe("rolarParaFormularioSeHash", () => {
  const montar = () => {
    document.body.innerHTML = '<section id="novo-campeonato"><input id="novo-nome"></section>';
    const cartao = document.getElementById("novo-campeonato")!;
    cartao.scrollIntoView = vi.fn();
    return cartao;
  };
  const base = { idCartao: "novo-campeonato", idCampo: "novo-nome" };

  it("com a âncora, rola até o cartão e foca o nome", () => {
    const cartao = montar();
    expect(rolarParaFormularioSeHash({ ...base, hash: "#novo-campeonato" })).toBe(true);
    expect(cartao.scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
    expect(document.activeElement?.id).toBe("novo-nome");
  });
  it("reduzir movimento rola sem animação", () => {
    const cartao = montar();
    rolarParaFormularioSeHash({ ...base, hash: "novo-campeonato", reduzirMovimento: true });
    expect(cartao.scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "auto" });
  });
  it("outra âncora ou nenhuma: não faz nada", () => {
    const cartao = montar();
    expect(rolarParaFormularioSeHash({ ...base, hash: "" })).toBe(false);
    expect(rolarParaFormularioSeHash({ ...base, hash: "#outra" })).toBe(false);
    expect(cartao.scrollIntoView).not.toHaveBeenCalled();
  });
  it("cartão ausente não lança", () => {
    document.body.innerHTML = "";
    expect(rolarParaFormularioSeHash({ ...base, hash: "#novo-campeonato" })).toBe(false);
  });
});

describe("fontes", () => {
  const ler = (rel: string) => readFileSync(`src/${rel}`, "utf8");
  it("o Hero tem o botão oculto e sem caminho de gerenciar no HTML", () => {
    const f = ler("components/Hero.astro");
    expect(f).toMatch(/<a[^>]*data-criar-evento[^>]*\bhidden\b/);
    expect(f).not.toMatch(/gerenciar/);
    expect(f).not.toMatch(/data-criar-evento[^>]*href=/);
  });
  it("a home descobre o papel uma vez e liga os dois iniciadores", () => {
    const f = ler("pages/index.astro");
    expect(f.match(/descobrirPapel\(\)/g)).toHaveLength(1);
    expect(f).toMatch(/iniciarCriarEventoHome\(\{ descobrir: \(\) => papel \}\)/);
    expect(f).toMatch(/iniciarAtalhosHome\(\{ descobrir: \(\) => papel \}\)/);
  });
  it("a lista de gerenciamento só rola para o formulário depois de liberada, e o id do campo existe", () => {
    const f = ler("pages/gerenciar_campeonatos/index.astro");
    expect(f.indexOf("rolarParaFormularioSeHash(")).toBeGreaterThan(f.indexOf("if (!liberado) return;"));
    expect(ler("components/CampeonatosLista.astro")).toMatch(/id="novo-campeonato"/);
    expect(ler("components/CampeonatosLista.astro")).toMatch(/prefixo="novo"/);
    expect(ler("components/CampeonatoForm.astro")).toMatch(/id=\{`\$\{prefixo\}-nome`\}/);
  });
});
