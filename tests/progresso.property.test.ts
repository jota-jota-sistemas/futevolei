// tests/progresso.property.test.ts
//
// "Meus eventos": progresso, filtros por situação, ordenação para gestão e dados
// da cópia (puro, sem I/O).

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  FILTROS_ESTADO,
  PROGRESSO_VAZIO,
  acontecendoHoje,
  contarPorEstado,
  dadosDaCopia,
  ehProximo,
  filtroInicial,
  filtrarPorEstado,
  nomeDaCopia,
  ordenarParaGestao,
  resumirProgresso,
  rotuloProgresso,
  somarDias,
  sugerirDatasDaCopia,
} from "../src/domain/campeonatos/progresso";
import { validarCampeonato, interpretarPreco } from "../src/domain/campeonatos/validation";
import type { CampeonatoRegistro } from "../src/domain/campeonatos/types";

function camp(p: Partial<CampeonatoRegistro> & { id: string }): CampeonatoRegistro {
  return {
    nome: p.id,
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
    ...p,
  };
}

const dados = (p: Partial<typeof PROGRESSO_VAZIO> = {}) => ({ ...PROGRESSO_VAZIO, ...p });

describe("resumirProgresso / rotuloProgresso", () => {
  it("a etapa é a mais atrasada que ainda falta", () => {
    expect(resumirProgresso(dados()).etapa).toBe("sem_categorias");
    expect(resumirProgresso(dados({ categorias: 2 })).etapa).toBe("sem_duplas");
    expect(resumirProgresso(dados({ categorias: 2, duplas: 8 })).etapa).toBe("sem_chaveamento");
    expect(resumirProgresso(dados({ categorias: 2, duplas: 8, chaveamentos: 1, jogos: 6, concluidos: 2 })).etapa).toBe("em_andamento");
    expect(resumirProgresso(dados({ categorias: 1, duplas: 4, chaveamentos: 1, jogos: 3, concluidos: 3 })).etapa).toBe("concluido");
  });

  it("chaveamento gerado sem jogos contabilizados continua em andamento (nunca 'concluído' por zero)", () => {
    expect(resumirProgresso(dados({ categorias: 1, duplas: 2, chaveamentos: 1, jogos: 0, concluidos: 0 })).etapa).toBe("em_andamento");
  });

  it("rótulos em português, com singular e plural", () => {
    const r = (p: Partial<typeof PROGRESSO_VAZIO>) => rotuloProgresso(resumirProgresso(dados(p)));
    expect(r({})).toBe("Sem categorias");
    expect(r({ categorias: 1 })).toBe("1 categoria · sem duplas");
    expect(r({ categorias: 3, duplas: 24 })).toBe("3 categorias · 24 duplas · chaveamento não gerado");
    expect(r({ categorias: 3, duplas: 24, chaveamentos: 3, jogos: 18, concluidos: 5 })).toBe(
      "3 categorias · 24 duplas · chaveamento gerado · 5/18 jogos"
    );
    expect(r({ categorias: 3, duplas: 24, chaveamentos: 1, jogos: 6, concluidos: 0 })).toBe(
      "3 categorias · 24 duplas · chaveamento em 1/3 · 0/6 jogos"
    );
    expect(r({ categorias: 1, duplas: 4, chaveamentos: 1, jogos: 3, concluidos: 3 })).toBe(
      "1 categoria · 4 duplas · todos os 3 jogos concluídos"
    );
    expect(r({ categorias: 1, duplas: 2, chaveamentos: 1, jogos: 1, concluidos: 1 })).toBe(
      "1 categoria · 2 duplas · o único jogo concluído"
    );
  });
});

describe("datas, filtros e ordenação", () => {
  const hoje = "2026-12-05";
  const lista = [
    camp({ id: "passou", data: "2026-11-01" }),
    camp({ id: "hoje-1dia", data: "2026-12-05" }),
    camp({ id: "multi-em-curso", data: "2026-12-04", dataFim: "2026-12-06" }),
    camp({ id: "futuro", data: "2027-01-10" }),
    camp({ id: "multi-passou", data: "2026-11-20", dataFim: "2026-11-22" }),
    camp({ id: "arquivado-futuro", data: "2027-02-01", ativo: false }),
  ];

  it("ehProximo e acontecendoHoje consideram a data final", () => {
    expect(ehProximo(lista[0], hoje)).toBe(false);
    expect(ehProximo(lista[1], hoje)).toBe(true); // hoje conta como próximo
    expect(ehProximo(lista[2], hoje)).toBe(true);
    expect(acontecendoHoje(lista[1], hoje)).toBe(true);
    expect(acontecendoHoje(lista[2], hoje)).toBe(true); // meio de um evento de 3 dias
    expect(acontecendoHoje(lista[3], hoje)).toBe(false);
    expect(acontecendoHoje(lista[4], hoje)).toBe(false);
  });

  it("data final inválida (anterior ao início) é ignorada", () => {
    expect(ehProximo(camp({ id: "x", data: "2026-12-10", dataFim: "2026-12-01" }), hoje)).toBe(true);
  });

  it("filtra por situação; arquivados só em 'Arquivados' e 'Todos'", () => {
    const ids = (f: Parameters<typeof filtrarPorEstado>[1]) => filtrarPorEstado(lista, f, hoje).map((c) => c.id);
    expect(ids("proximos")).toEqual(["hoje-1dia", "multi-em-curso", "futuro"]);
    expect(ids("passados")).toEqual(["passou", "multi-passou"]);
    expect(ids("arquivados")).toEqual(["arquivado-futuro"]);
    expect(ids("todos")).toHaveLength(6);
    expect(contarPorEstado(lista, hoje)).toEqual({ proximos: 3, passados: 2, arquivados: 1, todos: 6 });
  });

  it("o filtro inicial é 'Próximos' quando há algum, senão 'Todos'", () => {
    expect(filtroInicial(lista, hoje)).toBe("proximos");
    expect(filtroInicial([lista[0], lista[4]], hoje)).toBe("todos");
    expect(filtroInicial([], hoje)).toBe("todos");
  });

  it("ordena: próximos do mais perto ao mais longe, depois passados do mais recente ao mais antigo", () => {
    expect(ordenarParaGestao(lista, hoje).map((c) => c.id)).toEqual([
      // Ainda não terminaram, do mais perto ao mais longe (o de 3 dias já em curso vem primeiro).
      "multi-em-curso",
      "hoje-1dia",
      "futuro",
      "arquivado-futuro",
      // Já passaram, do mais recente ao mais antigo.
      "multi-passou",
      "passou",
    ]);
  });

  it("propriedade: filtros particionam a lista de ativos/arquivados e a ordenação é permutação estável", () => {
    const dia = fc.integer({ min: 0, max: 60 }).map((n) => somarDias("2026-10-01", n));
    const arb = fc.record({
      id: fc.string({ minLength: 1, maxLength: 4 }),
      data: dia,
      dataFim: fc.option(dia, { nil: null }),
      ativo: fc.boolean(),
    });
    fc.assert(
      fc.property(fc.array(arb, { maxLength: 12 }), dia, (itens, h) => {
        const l = itens.map((i) => camp(i));
        const c = contarPorEstado(l, h);
        expect(c.proximos + c.passados + c.arquivados).toBe(l.length);
        const o = ordenarParaGestao(l, h);
        expect(o).toHaveLength(l.length);
        expect(ordenarParaGestao(o, h)).toEqual(o);
        const iProximos = o.map((x) => ehProximo(x, h));
        // Primeiro todos os próximos, depois todos os passados.
        expect(iProximos.join(",")).toBe([...iProximos].sort((a, b) => Number(b) - Number(a)).join(","));
      })
    );
  });

  it("os quatro filtros existem, em ordem, com rótulos em português", () => {
    expect(FILTROS_ESTADO.map((f) => f.rotulo)).toEqual(["Próximos", "Passados", "Arquivados", "Todos"]);
  });
});

describe("duplicar", () => {
  it("somarDias é em UTC e atravessa meses e anos", () => {
    expect(somarDias("2026-12-30", 3)).toBe("2027-01-02");
    expect(somarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(somarDias("2026-03-31", -31)).toBe("2026-02-28");
  });

  it("datas sugeridas: 52 semanas depois (mesmo dia da semana), e a final acompanha", () => {
    expect(sugerirDatasDaCopia({ data: "2026-12-05", dataFim: null })).toEqual({ data: "2027-12-04", dataFim: "" });
    expect(sugerirDatasDaCopia({ data: "2026-12-05", dataFim: "2026-12-06" })).toEqual({ data: "2027-12-04", dataFim: "2027-12-05" });
    const dia = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
    expect(dia(sugerirDatasDaCopia({ data: "2026-12-05", dataFim: null }).data)).toBe(dia("2026-12-05"));
  });

  it("nome da cópia: sufixo '(cópia)' e nunca passa de 120 caracteres", () => {
    expect(nomeDaCopia("Copa Cabeça 2026")).toBe("Copa Cabeça 2026 (cópia)");
    expect(nomeDaCopia("A".repeat(120)).length).toBeLessThanOrEqual(120);
    expect(nomeDaCopia("A".repeat(120)).endsWith(" (cópia)")).toBe(true);
  });

  it("dados da cópia: tudo do original, com novo nome e datas; o resultado passa na validação", () => {
    const origem = camp({
      id: "copa-2026",
      nome: "Copa",
      cidade: "Santos",
      uf: "SP",
      endereco: "Praia do Gonzaga",
      preco: 160.5,
      precoTexto: "R$ 160,50",
      inscricao: "https://x.com/i",
      instagram: "@copa",
      descricao: "Texto",
      listado: false,
    });
    const novo = { nome: "Copa 2027", data: "2027-12-04", dataFim: "2027-12-05" };
    const entrada = dadosDaCopia(origem, novo);
    expect(entrada).toMatchObject({ ...novo, cidade: "Santos", uf: "SP", preco: "160.5", precoTexto: "R$ 160,50", listado: false });
    const r = validarCampeonato(entrada);
    expect(r.ok && r.valor.preco).toBe(160.5);
    expect(interpretarPreco(entrada.preco)).toBe(160.5);
  });

  it("original sem campos opcionais: a cópia também (sem 'null' como texto)", () => {
    const entrada = dadosDaCopia(camp({ id: "x" }), { nome: "N", data: "2027-01-01", dataFim: "" });
    expect(Object.values(entrada).some((v) => v === "null" || v === "undefined")).toBe(false);
    expect(validarCampeonato(entrada).ok).toBe(true);
  });
});
