// @vitest-environment happy-dom
//
// "Duplicar" na edição do campeonato: nome e datas sugeridos, cópia dos dados e
// (opcional) das categorias, e navegação direta ao novo evento.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { iniciarDuplicar } from "../src/scripts/campeonato-duplicar";
import type { CampeonatoRegistro, ResultadoCampeonato } from "../src/domain/campeonatos/types";
import { validarCampeonato } from "../src/domain/campeonatos/validation";
import type { CampeonatoStore } from "../src/store/campeonatoStore";
import type { CategoriaStore } from "../src/store/categoriaStore";

const origem: CampeonatoRegistro = {
  id: "copa-2026",
  nome: "Copa Cabeça 2026",
  data: "2026-12-05",
  dataFim: "2026-12-06",
  cidade: "Santos",
  uf: "SP",
  endereco: "Praia do Gonzaga",
  preco: 160,
  precoTexto: "R$ 160,00",
  inscricao: "https://x.com/i",
  instagram: "@copa",
  descricao: "Texto",
  listado: false,
  ativo: true,
  fonte: "manual",
  criadoEm: "2026-01-01T00:00:00.000Z",
  atualizadoEm: "2026-01-01T00:00:00.000Z",
};

function montar() {
  document.body.innerHTML = `
    <form data-duplicar-form novalidate>
      <input name="nome" type="text">
      <input name="data" type="date">
      <input name="dataFim" type="date">
      <input type="checkbox" name="copiarCategorias" checked>
      <p data-duplicar-erro hidden></p>
      <button type="submit" data-duplicar-enviar>Criar cópia</button>
    </form>`;
}

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const campo = (nome: string) => $<HTMLInputElement>(`[name="${nome}"]`);
const tick = () => new Promise((r) => setTimeout(r, 0));
const enviar = () => $("form").dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));

function lojas(opcoes: { falharCriar?: boolean; falharCopia?: boolean } = {}) {
  const criar = vi.fn(async (entrada: Parameters<CampeonatoStore["criar"]>[0]): Promise<ResultadoCampeonato<CampeonatoRegistro>> => {
    if (opcoes.falharCriar) return { ok: false, erro: { code: "FALHA_PERSISTENCIA" } };
    const v = validarCampeonato(entrada);
    if (!v.ok) return v;
    return { ok: true, valor: { ...origem, ...v.valor, id: "copa-2027", fonte: "manual" } as CampeonatoRegistro };
  });
  const copiarDe = vi.fn(async () =>
    opcoes.falharCopia
      ? ({ ok: false, erro: { code: "FALHA_PERSISTENCIA" } } as const)
      : ({ ok: true, valor: { criadas: [], repetidas: [], invalidas: [] } } as const)
  );
  return {
    store: { criar } as unknown as CampeonatoStore,
    categoriaStore: { copiarDe } as unknown as CategoriaStore,
    criar,
    copiarDe,
  };
}

describe("duplicar campeonato", () => {
  const irPara = vi.fn();
  beforeEach(() => {
    montar();
    irPara.mockClear();
  });

  it("vem com nome e datas sugeridos (52 semanas depois, mesmo dia da semana)", () => {
    const l = lojas();
    iniciarDuplicar({ ...l, campeonato: origem, irPara });
    expect(campo("nome").value).toBe("Copa Cabeça 2026 (cópia)");
    expect(campo("data").value).toBe("2027-12-04");
    expect(campo("dataFim").value).toBe("2027-12-05");
    expect(campo("copiarCategorias").checked).toBe(true);
  });

  it("cria com os mesmos dados (novo nome e datas), copia as categorias e vai direto à edição do novo", async () => {
    const l = lojas();
    iniciarDuplicar({ ...l, campeonato: origem, irPara });
    campo("nome").value = "Copa Cabeça 2027";
    enviar();
    await tick();
    expect(l.criar).toHaveBeenCalledTimes(1);
    expect(l.criar.mock.calls[0][0]).toMatchObject({
      nome: "Copa Cabeça 2027",
      data: "2027-12-04",
      dataFim: "2027-12-05",
      cidade: "Santos",
      uf: "SP",
      preco: "160",
      precoTexto: "R$ 160,00",
      listado: false,
    });
    expect(l.copiarDe).toHaveBeenCalledWith("copa-2026", "copa-2027");
    expect(irPara).toHaveBeenCalledWith("/gerenciar_campeonatos/editar?id=copa-2027#categorias");
  });

  it("sem marcar 'Copiar as categorias': só o campeonato é criado", async () => {
    const l = lojas();
    iniciarDuplicar({ ...l, campeonato: origem, irPara });
    campo("copiarCategorias").checked = false;
    enviar();
    await tick();
    expect(l.criar).toHaveBeenCalledTimes(1);
    expect(l.copiarDe).not.toHaveBeenCalled();
    expect(irPara).toHaveBeenCalledTimes(1);
  });

  it("dados inválidos (nome vazio, data final antes do início): todos os erros, nada é criado", async () => {
    const l = lojas();
    iniciarDuplicar({ ...l, campeonato: origem, irPara });
    campo("nome").value = "  ";
    campo("dataFim").value = "2027-01-01";
    enviar();
    await tick();
    expect(l.criar).not.toHaveBeenCalled();
    expect($("[data-duplicar-erro]").hidden).toBe(false);
    expect($("[data-duplicar-erro]").textContent).toContain("nome do campeonato");
    expect($("[data-duplicar-erro]").textContent).toContain("data final");
    expect(irPara).not.toHaveBeenCalled();
  });

  it("falha ao criar: mensagem, botão liberado e nada de navegação", async () => {
    const l = lojas({ falharCriar: true });
    iniciarDuplicar({ ...l, campeonato: origem, irPara });
    enviar();
    await tick();
    expect($("[data-duplicar-erro]").textContent).toContain("Falha ao salvar");
    expect($<HTMLButtonElement>("[data-duplicar-enviar]").disabled).toBe(false);
    expect(l.copiarDe).not.toHaveBeenCalled();
    expect(irPara).not.toHaveBeenCalled();
  });

  it("criou mas não conseguiu copiar as categorias: avisa com link para o novo (sem perder o trabalho)", async () => {
    const l = lojas({ falharCopia: true });
    iniciarDuplicar({ ...l, campeonato: origem, irPara });
    enviar();
    await tick();
    expect(irPara).not.toHaveBeenCalled();
    const texto = $("[data-duplicar-erro]").textContent!;
    expect(texto).toContain("O campeonato foi criado");
    expect(texto).toContain("Copiar categorias de outro evento");
    const link = $<HTMLAnchorElement>("[data-duplicar-erro] a");
    expect(link.getAttribute("href")).toBe("/gerenciar_campeonatos/editar?id=copa-2027#categorias");
    expect($<HTMLButtonElement>("[data-duplicar-enviar]").disabled).toBe(false);
  });

  it("chamar de novo (a edição recarregou) atualiza as sugestões sem duplicar o envio", async () => {
    const l = lojas();
    iniciarDuplicar({ ...l, campeonato: origem, irPara });
    iniciarDuplicar({ ...l, campeonato: { ...origem, nome: "Outro nome", data: "2026-12-12", dataFim: null }, irPara });
    expect(campo("nome").value).toBe("Outro nome (cópia)");
    expect(campo("data").value).toBe("2027-12-11");
    expect(campo("dataFim").value).toBe("");
    enviar();
    await tick();
    expect(l.criar).toHaveBeenCalledTimes(1); // um ouvinte só
    expect(l.criar.mock.calls[0][0]).toMatchObject({ nome: "Outro nome (cópia)" });
  });

  it("sem o formulário na página, nada acontece", () => {
    document.body.innerHTML = "<p>x</p>";
    expect(() => iniciarDuplicar({ ...lojas(), campeonato: origem })).not.toThrow();
  });
});
