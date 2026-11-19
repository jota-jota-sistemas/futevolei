// tests/campeonato-validacao.property.test.ts
//
// Validação, normalização, id (slug), busca e ordenação de campeonatos
// (domínio puro, sem I/O).

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  PRECO_A_CONFIRMAR,
  completarEsquemaHttps,
  precoParaTexto,
  validarCampeonatoTodos,
  compararCampeonatos,
  dataIsoValida,
  filtrarCampeonatos,
  gerarIdCampeonato,
  interpretarPreco,
  normalizarInstagramEvento,
  ordenarCampeonatos,
  slugDoNome,
  urlHttpValida,
  validarCampeonato,
} from "../src/domain/campeonatos/validation";
import { campoDoErro, mensagemDoErro } from "../src/domain/campeonatos/mensagens";
import type { CampeonatoErro, CampeonatoRegistro } from "../src/domain/campeonatos/types";

const base = { nome: "Copa Cabeça", data: "2026-12-05" };

function registro(p: Partial<CampeonatoRegistro> = {}): CampeonatoRegistro {
  return {
    id: "copa-2026",
    nome: "Copa",
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

const erroDe = (entrada: Parameters<typeof validarCampeonato>[0]) => {
  const r = validarCampeonato(entrada);
  return r.ok ? null : r.erro.code;
};

describe("validarCampeonato: exemplos", () => {
  it("só nome e data: o resto vira null e listado é true", () => {
    expect(validarCampeonato(base)).toEqual({
      ok: true,
      valor: {
        nome: "Copa Cabeça",
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
      },
    });
  });

  it("normaliza espaços, UF, preço e instagram", () => {
    const r = validarCampeonato({
      ...base,
      nome: "  Copa  ",
      dataFim: "2026-12-06",
      cidade: " Santos ",
      uf: "sp",
      endereco: " Praia do Gonzaga ",
      preco: "R$ 1.500,50",
      precoTexto: " R$ 1.500,50 ",
      inscricao: " https://exemplo.com/inscricao ",
      instagram: "@Copa.Cabeca",
      descricao: "  Torneio de fim de ano  ",
      listado: false,
    });
    expect(r).toEqual({
      ok: true,
      valor: {
        nome: "Copa",
        data: "2026-12-05",
        dataFim: "2026-12-06",
        cidade: "Santos",
        uf: "SP",
        endereco: "Praia do Gonzaga",
        preco: 1500.5,
        precoTexto: "R$ 1.500,50",
        inscricao: "https://exemplo.com/inscricao",
        instagram: "@copa.cabeca",
        descricao: "Torneio de fim de ano",
        listado: false,
      },
    });
  });

  it("devolve o primeiro erro na ordem dos campos", () => {
    expect(erroDe({ nome: "  ", data: "x" })).toBe("NOME_INVALIDO");
    expect(erroDe({ nome: "A".repeat(121), data: "2026-12-05" })).toBe("NOME_INVALIDO");
    expect(erroDe({ nome: "A", data: "" })).toBe("DATA_INVALIDA");
    expect(erroDe({ nome: "A", data: "2026-02-30" })).toBe("DATA_INVALIDA");
    expect(erroDe({ nome: "A", data: "05/12/2026" })).toBe("DATA_INVALIDA");
    expect(erroDe({ ...base, dataFim: "2026-12-04" })).toBe("DATA_FIM_INVALIDA");
    expect(erroDe({ ...base, dataFim: "2026-13-01" })).toBe("DATA_FIM_INVALIDA");
    expect(erroDe({ ...base, cidade: "C".repeat(81) })).toBe("CIDADE_INVALIDA");
    expect(erroDe({ ...base, uf: "XX" })).toBe("UF_INVALIDA");
    expect(erroDe({ ...base, endereco: "E".repeat(201) })).toBe("ENDERECO_INVALIDO");
    expect(erroDe({ ...base, preco: "abc" })).toBe("PRECO_INVALIDO");
    expect(erroDe({ ...base, precoTexto: "P".repeat(61) })).toBe("PRECO_TEXTO_INVALIDO");
    expect(erroDe({ ...base, inscricao: "movisport" })).toBe("INSCRICAO_INVALIDA");
    expect(erroDe({ ...base, instagram: "https://exemplo.com/x" })).toBe("INSTAGRAM_INVALIDO");
    expect(erroDe({ ...base, descricao: "D".repeat(2001) })).toBe("DESCRICAO_INVALIDA");
  });

  it("data final igual ao início é aceita", () => {
    expect(erroDe({ ...base, dataFim: "2026-12-05" })).toBeNull();
  });

  it("não muta a entrada", () => {
    const entrada = { ...base, nome: "  Copa ", uf: "sp" };
    const copia = { ...entrada };
    validarCampeonato(entrada);
    expect(entrada).toEqual(copia);
  });
});

describe("interpretarPreco", () => {
  it("aceita formatos brasileiros e simples", () => {
    expect(interpretarPreco("160")).toBe(160);
    expect(interpretarPreco("160,5")).toBe(160.5);
    expect(interpretarPreco("160.50")).toBe(160.5);
    expect(interpretarPreco("R$ 160,00")).toBe(160);
    expect(interpretarPreco("1.500")).toBe(1500);
    expect(interpretarPreco("1.234,56")).toBe(1234.56);
    expect(interpretarPreco("0")).toBe(0);
    expect(interpretarPreco("")).toBeNull();
    expect(interpretarPreco(undefined)).toBeNull();
  });

  it("rejeita negativo, texto, vários separadores e valor acima do campo", () => {
    for (const ruim of ["-1", "abc", "1,2,3", "12,345", "1e3", "100000000"]) {
      expect(interpretarPreco(ruim), ruim).toBeUndefined();
    }
  });

  it("propriedade: centavos inteiros viram o mesmo número em ',' e '.'", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 9_999_999 }), fc.integer({ min: 0, max: 99 }), (reais, cent) => {
        const c = String(cent).padStart(2, "0");
        const esperado = Number(`${reais}.${c}`);
        // Sem milhar, a vírgula e o ponto representam o mesmo decimal.
        if (reais < 1000) {
          expect(interpretarPreco(`${reais},${c}`)).toBe(esperado);
          expect(interpretarPreco(`${reais}.${c}`)).toBe(esperado);
        } else {
          expect(interpretarPreco(`${reais},${c}`)).toBe(esperado);
        }
      })
    );
  });
});

describe("datas e URLs", () => {
  it("dataIsoValida confere o calendário", () => {
    expect(dataIsoValida("2028-02-29")).toBe(true);
    expect(dataIsoValida("2027-02-29")).toBe(false);
    expect(dataIsoValida("2026-04-31")).toBe(false);
    expect(dataIsoValida("2026-4-1")).toBe(false);
  });

  it("propriedade: toda data real é aceita; mês 13+ nunca", () => {
    fc.assert(
      fc.property(fc.date({ min: new Date("1950-01-01"), max: new Date("2100-12-31"), noInvalidDate: true }), (d) => {
        expect(dataIsoValida(d.toISOString().slice(0, 10))).toBe(true);
      })
    );
    fc.assert(
      fc.property(fc.integer({ min: 13, max: 99 }), (mes) => {
        expect(dataIsoValida(`2026-${String(mes).padStart(2, "0")}-01`)).toBe(false);
      })
    );
  });

  it("urlHttpValida exige esquema http/https e host", () => {
    expect(urlHttpValida("https://movisport.pro/")).toBe(true);
    expect(urlHttpValida("http://x.com/a?b=1")).toBe(true);
    expect(urlHttpValida("movisport.pro")).toBe(false);
    expect(urlHttpValida("ftp://x.com")).toBe(false);
    expect(urlHttpValida("javascript:alert(1)")).toBe(false);
    expect(urlHttpValida("https://x.com/a b")).toBe(false);
    expect(urlHttpValida("https://localhost")).toBe(false);
  });

  it("instagram: @usuario normaliza; URL do instagram.com é mantida; outros hosts não", () => {
    expect(normalizarInstagramEvento("  ")).toEqual({ ok: true, valor: null });
    expect(normalizarInstagramEvento("MSS_Cup")).toEqual({ ok: true, valor: "@mss_cup" });
    expect(normalizarInstagramEvento("@mss_cup")).toEqual({ ok: true, valor: "@mss_cup" });
    const post = "https://www.instagram.com/p/AbC123/?img_index=2";
    expect(normalizarInstagramEvento(post)).toEqual({ ok: true, valor: post });
    expect(normalizarInstagramEvento("https://evil.com/instagram.com")).toEqual({
      ok: false,
      erro: { code: "INSTAGRAM_INVALIDO" },
    });
    expect(normalizarInstagramEvento("a b")).toEqual({ ok: false, erro: { code: "INSTAGRAM_INVALIDO" } });
  });
});

describe("validarCampeonato: propriedades", () => {
  const textoLivre = fc.string({ maxLength: 40 });

  it("é idempotente: validar a saída (convertida em entrada) dá o mesmo resultado", () => {
    fc.assert(
      fc.property(textoLivre, textoLivre, textoLivre, fc.boolean(), (nome, cidade, desc, listado) => {
        const r1 = validarCampeonato({ nome, data: "2026-12-05", cidade, descricao: desc, listado });
        if (!r1.ok) return;
        const v = r1.valor;
        const r2 = validarCampeonato({
          nome: v.nome,
          data: v.data,
          cidade: v.cidade ?? "",
          descricao: v.descricao ?? "",
          listado: v.listado,
        });
        expect(r2).toEqual(r1);
      })
    );
  });

  it("nome só com espaços nunca é válido; nome com texto (até 120) é", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[ \t]{0,10}$/), (espacos) => {
        expect(erroDe({ nome: espacos, data: "2026-12-05" })).toBe("NOME_INVALIDO");
      })
    );
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Za-z]{1,120}$/), (nome) => {
        expect(erroDe({ nome, data: "2026-12-05" })).toBeNull();
      })
    );
  });

  it("dataFim anterior ao início sempre falha; igual ou posterior passa", () => {
    const dia = fc.integer({ min: 0, max: 3650 }).map((n) => new Date(Date.UTC(2024, 0, 1 + n)).toISOString().slice(0, 10));
    fc.assert(
      fc.property(dia, dia, (a, b) => {
        const e = erroDe({ nome: "X", data: a, dataFim: b });
        expect(e).toBe(b < a ? "DATA_FIM_INVALIDA" : null);
      })
    );
  });

  it("todo erro tem mensagem e, quando de campo, aponta para um campo do formulário", () => {
    const codigos: CampeonatoErro["code"][] = [
      "NOME_INVALIDO", "DATA_INVALIDA", "DATA_FIM_INVALIDA", "CIDADE_INVALIDA", "UF_INVALIDA",
      "ENDERECO_INVALIDO", "PRECO_INVALIDO", "PRECO_TEXTO_INVALIDO", "INSCRICAO_INVALIDA",
      "INSTAGRAM_INVALIDO", "DESCRICAO_INVALIDA", "CAMPEONATO_NAO_ENCONTRADO", "SEM_PERMISSAO",
      "EMAIL_INVALIDO", "NAO_ORGANIZADOR", "ULTIMO_DONO", "FALHA_PERSISTENCIA", "FALHA_LEITURA",
    ];
    for (const code of codigos) {
      const erro = { code } as CampeonatoErro;
      expect(mensagemDoErro(erro).length).toBeGreaterThan(5);
      const campo = campoDoErro(erro);
      const geral = [
        "CAMPEONATO_NAO_ENCONTRADO", "SEM_PERMISSAO", "EMAIL_INVALIDO", "NAO_ORGANIZADOR", "ULTIMO_DONO",
        "FALHA_PERSISTENCIA", "FALHA_LEITURA",
      ].includes(code);
      expect(campo === null).toBe(geral);
    }
  });
});

describe("id (slug)", () => {
  it("slugDoNome tira acentos, símbolos e espaços; vazio vira 'evento'", () => {
    expect(slugDoNome("Copa da Cabeça — 2ª Edição!")).toBe("copa-da-cabeca-2-edicao");
    expect(slugDoNome("  ***  ")).toBe("evento");
    expect(slugDoNome("")).toBe("evento");
  });

  it("propriedade: o slug só tem [a-z0-9-], sem '-' nas pontas e até 60 caracteres", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (nome) => {
        const s = slugDoNome(nome);
        expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        expect(s.length).toBeLessThanOrEqual(60);
      })
    );
  });

  it("gerarIdCampeonato usa slug + ano e resolve colisões com sufixo numérico", () => {
    expect(gerarIdCampeonato("Copa Cabeça", "2026-12-05", [])).toBe("copa-cabeca-2026");
    expect(gerarIdCampeonato("Copa Cabeça", "2026-12-05", ["copa-cabeca-2026"])).toBe("copa-cabeca-2026-2");
    expect(
      gerarIdCampeonato("Copa Cabeça", "2026-12-05", ["copa-cabeca-2026", "copa-cabeca-2026-2"])
    ).toBe("copa-cabeca-2026-3");
  });

  it("propriedade: o id gerado nunca está entre os existentes e não muta a entrada", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 30 }), fc.array(fc.string({ maxLength: 30 }), { maxLength: 8 }), (nome, ex) => {
        const lista = [...ex];
        const id = gerarIdCampeonato(nome, "2026-12-05", lista);
        expect(lista).not.toContain(id);
        expect(lista).toEqual(ex);
        expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      })
    );
  });
});

describe("busca e ordenação", () => {
  const todos = [
    registro({ id: "a-2026", nome: "Açaí Open", data: "2026-10-01", cidade: "Santos", uf: "SP" }),
    registro({ id: "b-2026", nome: "Beach Cup", data: "2026-12-01", cidade: "Guarujá", uf: "SP" }),
    registro({ id: "c-2026", nome: "Copa Rio", data: "2026-12-01", cidade: "Niterói", uf: "RJ", endereco: "Praia de Icaraí" }),
  ];

  it("filtra por nome, cidade, UF, endereço e id, sem acento nem caixa; vazio devolve todos", () => {
    const nomes = (t: string) => filtrarCampeonatos(todos, t).map((c) => c.id);
    expect(nomes("acai")).toEqual(["a-2026"]);
    expect(nomes("GUARUJA")).toEqual(["b-2026"]);
    expect(nomes("rj")).toEqual(["c-2026"]);
    expect(nomes("icarai")).toEqual(["c-2026"]);
    expect(nomes("b-2026")).toEqual(["b-2026"]);
    expect(nomes("   ")).toEqual(["a-2026", "b-2026", "c-2026"]);
    expect(nomes("zzz")).toEqual([]);
  });

  it("ordena por data mais recente, depois nome e id; não muta a entrada", () => {
    const copia = [...todos];
    expect(ordenarCampeonatos(todos).map((c) => c.id)).toEqual(["b-2026", "c-2026", "a-2026"]);
    expect(todos).toEqual(copia);
  });

  it("propriedade: a ordenação é total e idempotente", () => {
    const arb = fc.record({
      id: fc.string({ minLength: 1, maxLength: 5 }),
      nome: fc.string({ maxLength: 8 }),
      data: fc.constantFrom("2026-01-01", "2026-06-01", "2026-12-01"),
    });
    fc.assert(
      fc.property(fc.array(arb, { maxLength: 12 }), (itens) => {
        const lista = itens.map((i) => registro(i));
        const o1 = ordenarCampeonatos(lista);
        expect(ordenarCampeonatos(o1)).toEqual(o1);
        expect(o1).toHaveLength(lista.length);
        for (let i = 1; i < o1.length; i++) expect(compararCampeonatos(o1[i - 1], o1[i])).toBeLessThanOrEqual(0);
      })
    );
  });
});

describe("link de inscrição sem esquema ganha https://", () => {
  it("completarEsquemaHttps só completa o que parece um endereço", () => {
    expect(completarEsquemaHttps("movisport.pro")).toBe("https://movisport.pro");
    expect(completarEsquemaHttps("  movisport.pro/inscricao?x=1 ")).toBe("https://movisport.pro/inscricao?x=1");
    expect(completarEsquemaHttps("https://x.com")).toBe("https://x.com");
    expect(completarEsquemaHttps("http://x.com")).toBe("http://x.com");
    // Não é endereço: sem ponto, com espaço ou com outro esquema.
    for (const nao of ["movisport", "meu site.com", "ftp://x.com", "javascript:alert(1)", "mailto:a@b.com", ""]) {
      expect(completarEsquemaHttps(nao), nao).toBe(nao.trim());
    }
  });

  it("o valor gravado já traz o https://; esquemas perigosos continuam recusados", () => {
    const r = validarCampeonato({ ...base, inscricao: "movisport.pro/copa" });
    expect(r.ok && r.valor.inscricao).toBe("https://movisport.pro/copa");
    for (const ruim of ["javascript:alert(1)", "ftp://x.com", "data:text/html,x", "movisport"]) {
      expect(erroDe({ ...base, inscricao: ruim }), ruim).toBe("INSCRICAO_INVALIDA");
    }
  });

  it("propriedade: o resultado, quando válido, sempre começa com http(s) e é idempotente", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (texto) => {
        const r = validarCampeonato({ ...base, inscricao: texto });
        if (!r.ok || r.valor.inscricao === null) return;
        expect(r.valor.inscricao).toMatch(/^https?:\/\//i);
        const de_novo = validarCampeonato({ ...base, inscricao: r.valor.inscricao });
        expect(de_novo.ok && de_novo.valor.inscricao).toBe(r.valor.inscricao);
      })
    );
  });
});

describe("validarCampeonatoTodos", () => {
  it("devolve todos os erros de uma vez, na ordem dos campos", () => {
    const erros = validarCampeonatoTodos({
      nome: "  ",
      data: "",
      uf: "XX",
      preco: "abc",
      inscricao: "movisport",
      instagram: "a b",
    });
    expect(erros.map((e) => e.code)).toEqual([
      "NOME_INVALIDO",
      "DATA_INVALIDA",
      "UF_INVALIDA",
      "PRECO_INVALIDO",
      "INSCRICAO_INVALIDA",
      "INSTAGRAM_INVALIDO",
    ]);
  });

  it("vazia quando válido; o primeiro erro é o mesmo de validarCampeonato", () => {
    expect(validarCampeonatoTodos(base)).toEqual([]);
    const ruim = { nome: "", data: "x", cidade: "C".repeat(90) };
    const todos = validarCampeonatoTodos(ruim);
    const primeiro = validarCampeonato(ruim);
    expect(primeiro.ok).toBe(false);
    expect(!primeiro.ok && primeiro.erro).toEqual(todos[0]);
  });

  it("data final só é comparada com um início válido (sem erro extra por causa do início)", () => {
    expect(validarCampeonatoTodos({ nome: "A", data: "x", dataFim: "2026-12-05" }).map((e) => e.code)).toEqual(["DATA_INVALIDA"]);
    expect(validarCampeonatoTodos({ nome: "A", data: "2026-12-05", dataFim: "2026-12-01" }).map((e) => e.code)).toEqual([
      "DATA_FIM_INVALIDA",
    ]);
  });

  it("propriedade: validarCampeonato é ok exatamente quando não há erros, e não muta a entrada", () => {
    const campo = fc.string({ maxLength: 12 });
    fc.assert(
      fc.property(campo, campo, campo, campo, (nome, cidade, uf, preco) => {
        const entrada = { nome, data: "2026-12-05", cidade, uf, preco };
        const copia = { ...entrada };
        const todos = validarCampeonatoTodos(entrada);
        expect(validarCampeonato(entrada).ok).toBe(todos.length === 0);
        expect(entrada).toEqual(copia);
      })
    );
  });
});

describe("precoParaTexto", () => {
  it("formata em reais, sem espaço não separável", () => {
    expect(precoParaTexto(160)).toBe("R$ 160,00");
    expect(precoParaTexto(1500.5)).toBe("R$ 1.500,50");
    expect(precoParaTexto(0)).toBe("R$ 0,00");
    expect(precoParaTexto(160)).not.toMatch(/\u00a0/);
    expect(PRECO_A_CONFIRMAR).toBe("Valor a confirmar");
  });

  it("propriedade: o texto gerado volta ao mesmo número ao ser interpretado", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 9_999_999 }), fc.integer({ min: 0, max: 99 }), (reais, cent) => {
        const n = Number(`${reais}.${String(cent).padStart(2, "0")}`);
        expect(interpretarPreco(precoParaTexto(n))).toBe(n);
      })
    );
  });
});
