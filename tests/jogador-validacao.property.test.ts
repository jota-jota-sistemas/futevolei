import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { CATEGORIAS_JOGADOR, type Jogador, type JogadorErro, type ParticipacaoDupla } from "../src/domain/jogadores/types";
import {
  chaveTexto,
  encontrarHomonimos,
  filtrarJogadores,
  iniciaisDoNome,
  normalizarInstagram,
  ordenarJogadores,
  ordenarParticipacoes,
  validarJogador,
} from "../src/domain/jogadores/validation";
import { campoDoErro, mensagemDoErro } from "../src/domain/jogadores/mensagens";

/**
 * Feature: perfil de jogador (CRUD) — domínio puro.
 *
 * Regras: nome 1..80 (trim); apelido 1..40; gênero masculino|feminino; cidade
 * 1..80; UF brasileira; Instagram como @usuario ou link de PERFIL; campos
 * opcionais vazios viram null; homônimos são só um aviso (não erro).
 */

const j = (p: Partial<Jogador> & { id: string; nome: string }): Jogador => ({
  apelido: null, genero: null, categoria: null, cidade: null, uf: null, instagram: null,
  ativo: true, criadoEm: "2026-01-01T00:00:00.000Z", atualizadoEm: "2026-01-01T00:00:00.000Z",
  ...p,
});

function codigo(r: ReturnType<typeof validarJogador>): string {
  return r.ok ? "ok" : r.erro.code;
}

describe("validarJogador: nome", () => {
  it("vazio, só espaços e acima de 80 são inválidos; 1 e 80 são válidos", () => {
    expect(codigo(validarJogador({ nome: "" }))).toBe("NOME_JOGADOR_INVALIDO");
    expect(codigo(validarJogador({ nome: "   " }))).toBe("NOME_JOGADOR_INVALIDO");
    expect(codigo(validarJogador({ nome: "a".repeat(81) }))).toBe("NOME_JOGADOR_INVALIDO");
    expect(codigo(validarJogador({ nome: "a" }))).toBe("ok");
    expect(codigo(validarJogador({ nome: "a".repeat(80) }))).toBe("ok");
  });

  it("Property: válido sse o comprimento após trim está em [1, 80]", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (nome) => {
        const n = nome.trim().length;
        expect(validarJogador({ nome }).ok).toBe(n >= 1 && n <= 80);
      }),
      { numRuns: 100 }
    );
  });

  it("devolve o nome sem espaços nas pontas e sem mutar a entrada", () => {
    const entrada = { nome: "  Maria Souza  " };
    const r = validarJogador(entrada);
    expect(r.ok && r.valor.nome).toBe("Maria Souza");
    expect(entrada.nome).toBe("  Maria Souza  ");
  });
});

describe("validarJogador: campos opcionais", () => {
  it("vazios ou só com espaços viram null", () => {
    const r = validarJogador({ nome: "Ana", apelido: " ", genero: "", categoria: " ", cidade: "  ", uf: "", instagram: "" });
    expect(r).toEqual({
      ok: true,
      valor: { nome: "Ana", apelido: null, genero: null, categoria: null, cidade: null, uf: null, instagram: null },
    });
  });

  it("apelido: 40 ok, 41 inválido", () => {
    expect(codigo(validarJogador({ nome: "Ana", apelido: "x".repeat(40) }))).toBe("ok");
    expect(codigo(validarJogador({ nome: "Ana", apelido: "x".repeat(41) }))).toBe("APELIDO_INVALIDO");
  });

  it("gênero aceita masculino/feminino (sem diferenciar caixa) e rejeita o resto", () => {
    const g = (genero: string) => validarJogador({ nome: "Ana", genero });
    expect(g("FEMININO")).toMatchObject({ ok: true, valor: { genero: "feminino" } });
    expect(g("masculino")).toMatchObject({ ok: true, valor: { genero: "masculino" } });
    expect(codigo(g("misto"))).toBe("GENERO_INVALIDO");
    expect(codigo(g("outro"))).toBe("GENERO_INVALIDO");
  });

  it("cidade: 80 ok, 81 inválida", () => {
    expect(codigo(validarJogador({ nome: "Ana", cidade: "c".repeat(80) }))).toBe("ok");
    expect(codigo(validarJogador({ nome: "Ana", cidade: "c".repeat(81) }))).toBe("CIDADE_INVALIDA");
  });

  it("UF: normaliza para maiúsculas e rejeita siglas inexistentes", () => {
    expect(validarJogador({ nome: "Ana", uf: "sp" })).toMatchObject({ ok: true, valor: { uf: "SP" } });
    expect(codigo(validarJogador({ nome: "Ana", uf: "XX" }))).toBe("UF_INVALIDA");
    expect(codigo(validarJogador({ nome: "Ana", uf: "SPP" }))).toBe("UF_INVALIDA");
  });

  it("devolve o PRIMEIRO erro, na ordem nome, apelido, gênero, cidade, UF, Instagram", () => {
    const tudoRuim = { nome: "", apelido: "x".repeat(41), genero: "z", categoria: "Gold", cidade: "c".repeat(81), uf: "XX", instagram: "a b" };
    expect(codigo(validarJogador(tudoRuim))).toBe("NOME_JOGADOR_INVALIDO");
    expect(codigo(validarJogador({ ...tudoRuim, nome: "Ana" }))).toBe("APELIDO_INVALIDO");
    expect(codigo(validarJogador({ ...tudoRuim, nome: "Ana", apelido: "" }))).toBe("GENERO_INVALIDO");
    expect(codigo(validarJogador({ ...tudoRuim, nome: "Ana", apelido: "", genero: "" }))).toBe("CATEGORIA_INVALIDA");
    expect(codigo(validarJogador({ ...tudoRuim, nome: "Ana", apelido: "", genero: "", categoria: "" }))).toBe("CIDADE_INVALIDA");
  });

  it("Property: reaplicar a validação ao resultado dá o mesmo resultado (idempotente)", () => {
    const entrada = fc.record({
      nome: fc.string({ minLength: 1, maxLength: 80 }).filter((s) => s.trim().length > 0),
      apelido: fc.constantFrom("", " ", "Pingo", "  Dedé  "),
      genero: fc.constantFrom("", "masculino", "FEMININO"),
      categoria: fc.constantFrom("", "Iniciante", "MASTER", " amador "),
      cidade: fc.constantFrom("", "Santos", "  São Paulo "),
      uf: fc.constantFrom("", "sp", "RJ"),
      instagram: fc.constantFrom("", "@Pingo.ftv", "pingo_ftv", "https://www.instagram.com/pingo.ftv/"),
    });
    fc.assert(
      fc.property(entrada, (e) => {
        const a = validarJogador(e);
        expect(a.ok).toBe(true);
        if (!a.ok) return;
        const b = validarJogador({ ...a.valor, instagram: a.valor.instagram ? `@${a.valor.instagram}` : "" } as never);
        expect(b).toEqual(a);
      }),
      { numRuns: 100 }
    );
  });
});

describe("validarJogador: categoria", () => {
  it("aceita cada nível do vocabulário, sem diferenciar caixa, e devolve a grafia canônica", () => {
    for (const c of CATEGORIAS_JOGADOR) {
      expect(validarJogador({ nome: "Ana", categoria: c.toUpperCase() })).toMatchObject({ ok: true, valor: { categoria: c } });
      expect(validarJogador({ nome: "Ana", categoria: `  ${c.toLowerCase()} ` })).toMatchObject({ ok: true, valor: { categoria: c } });
    }
  });

  it("'Outros' NÃO é categoria de jogador, nem texto fora da lista", () => {
    expect(CATEGORIAS_JOGADOR).not.toContain("Outros");
    expect(codigo(validarJogador({ nome: "Ana", categoria: "Outros" }))).toBe("CATEGORIA_INVALIDA");
    expect(codigo(validarJogador({ nome: "Ana", categoria: "Gold" }))).toBe("CATEGORIA_INVALIDA");
    expect(codigo(validarJogador({ nome: "Ana", categoria: "Inici" }))).toBe("CATEGORIA_INVALIDA");
  });

  it("vazio ou ausente vira null", () => {
    expect(validarJogador({ nome: "Ana" })).toMatchObject({ ok: true, valor: { categoria: null } });
    expect(validarJogador({ nome: "Ana", categoria: "" })).toMatchObject({ ok: true, valor: { categoria: null } });
  });

  it("Property: válida sse (sem caixa/espaços) é um nível do vocabulário", () => {
    const lista = CATEGORIAS_JOGADOR.map((c) => c.toLowerCase());
    fc.assert(
      fc.property(fc.string({ maxLength: 20 }), (texto) => {
        const t = texto.trim();
        const esperado = t === "" || lista.includes(t.toLowerCase());
        expect(validarJogador({ nome: "Ana", categoria: texto }).ok).toBe(esperado);
      }),
      { numRuns: 100 }
    );
  });
});

describe("normalizarInstagram", () => {
  const ok = (v: string) => {
    const r = normalizarInstagram(v);
    return r.ok ? r.valor : "ERRO";
  };

  it("aceita @usuario, usuario e link de perfil; devolve só o usuário em minúsculas", () => {
    expect(ok("@Fulano_1")).toBe("fulano_1");
    expect(ok("fulano.silva")).toBe("fulano.silva");
    expect(ok("https://www.instagram.com/Fulano.Silva/")).toBe("fulano.silva");
    expect(ok("https://instagram.com/fulano?igsh=abc")).toBe("fulano");
    expect(ok("  @fulano  ")).toBe("fulano");
  });

  it("vazio vira null", () => {
    expect(ok("")).toBeNull();
    expect(ok("   ")).toBeNull();
    expect(normalizarInstagram(undefined)).toEqual({ ok: true, valor: null });
  });

  it("rejeita post/reel, outros sites, espaços, caracteres inválidos e mais de 30 caracteres", () => {
    expect(ok("https://www.instagram.com/p/DefdhSYtN4u/")).toBe("ERRO");
    expect(ok("https://www.instagram.com/reel/abc/")).toBe("ERRO");
    expect(ok("https://facebook.com/fulano")).toBe("ERRO");
    expect(ok("https://instagram.com/")).toBe("ERRO");
    expect(ok("a b")).toBe("ERRO");
    expect(ok("fulano!")).toBe("ERRO");
    expect(ok("a".repeat(31))).toBe("ERRO");
    expect(ok("a".repeat(30))).toBe("a".repeat(30));
  });

  it("Property: o resultado sempre casa com ^[a-z0-9._]{1,30}$ (o mesmo check do banco)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (texto) => {
        const r = normalizarInstagram(texto);
        if (r.ok && r.valor !== null) expect(r.valor).toMatch(/^[a-z0-9._]{1,30}$/);
      }),
      { numRuns: 100 }
    );
  });
});

describe("encontrarHomonimos", () => {
  const existentes = [
    j({ id: "1", nome: "João da Silva" }),
    j({ id: "2", nome: "Maria Souza" }),
  ];

  it("ignora caixa, acentos e espaços extras", () => {
    expect(encontrarHomonimos("joao   DA silva ", existentes).map((x) => x.id)).toEqual(["1"]);
    expect(encontrarHomonimos("MARIA SOUZA", existentes).map((x) => x.id)).toEqual(["2"]);
  });

  it("não considera parecidos nem vazio, e ignora o próprio jogador ao editar", () => {
    expect(encontrarHomonimos("João", existentes)).toEqual([]);
    expect(encontrarHomonimos("   ", existentes)).toEqual([]);
    expect(encontrarHomonimos("João da Silva", existentes, "1")).toEqual([]);
  });

  it("Property: um nome sempre é homônimo de si mesmo, qualquer que seja a caixa", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim() !== ""), (nome) => {
        const lista = [j({ id: "x", nome })];
        expect(encontrarHomonimos(nome.toUpperCase(), lista).length).toBe(1);
      }),
      { numRuns: 100 }
    );
  });
});

describe("filtrarJogadores", () => {
  const lista = [
    j({ id: "1", nome: "João Silva", apelido: "Pingo", cidade: "Santos", uf: "SP" }),
    j({ id: "2", nome: "Maria Souza", cidade: "Niterói", uf: "RJ" }),
  ];

  it("casa com nome, apelido, categoria, cidade e UF, sem caixa nem acento", () => {
    expect(filtrarJogadores([j({ id: "9", nome: "Dedé", categoria: "Intermediário" })], "intermediario").map((x) => x.id)).toEqual(["9"]);
    expect(filtrarJogadores(lista, "joao").map((x) => x.id)).toEqual(["1"]);
    expect(filtrarJogadores(lista, "PINGO").map((x) => x.id)).toEqual(["1"]);
    expect(filtrarJogadores(lista, "niteroi").map((x) => x.id)).toEqual(["2"]);
    expect(filtrarJogadores(lista, "rj").map((x) => x.id)).toEqual(["2"]);
    expect(filtrarJogadores(lista, "zzz")).toEqual([]);
  });

  it("texto vazio devolve todos, na mesma ordem, sem mutar a entrada", () => {
    const r = filtrarJogadores(lista, "  ");
    expect(r.map((x) => x.id)).toEqual(["1", "2"]);
    expect(r).not.toBe(lista);
  });
});

describe("ordenarJogadores", () => {
  it("ordena por nome sem acento/caixa; desempata por criadoEm e id", () => {
    const lista = [
      j({ id: "b", nome: "Bruno" }),
      j({ id: "a2", nome: "álvaro", criadoEm: "2026-02-01T00:00:00.000Z" }),
      j({ id: "a1", nome: "Álvaro", criadoEm: "2026-01-01T00:00:00.000Z" }),
    ];
    expect(ordenarJogadores(lista).map((x) => x.id)).toEqual(["a1", "a2", "b"]);
  });

  it("Property: o resultado independe da permutação da entrada e não muta", () => {
    const gerador = fc.array(
      fc.record({
        id: fc.uuid(),
        nome: fc.constantFrom("Ana", "ana", "Álvaro", "Bruno", "Carla"),
        criadoEm: fc.constantFrom("2026-01-01", "2026-02-01"),
      }),
      { minLength: 0, maxLength: 12 }
    );
    fc.assert(
      fc.property(gerador, fc.nat(), (itens, giro) => {
        const lista = itens.map((i) => j(i));
        const copia = [...lista];
        const girada = lista.length ? [...lista.slice(giro % lista.length), ...lista.slice(0, giro % lista.length)] : [];
        expect(ordenarJogadores(lista).map((x) => x.id)).toEqual(ordenarJogadores(girada).map((x) => x.id));
        expect(lista).toEqual(copia);
      }),
      { numRuns: 100 }
    );
  });
});

describe("ordenarParticipacoes", () => {
  const p = (duplaId: string, data: string | null, inscritaEm = "2026-01-01T00:00:00.000Z"): ParticipacaoDupla => ({
    duplaId, atletaA: "A", atletaB: "B", posicao: "A", parceiroJogadorId: null, categoria: "Open",
    campeonato: data ? { id: "c" + duplaId, nome: "Evento " + duplaId, data } : null, inscritaEm,
  });

  it("evento mais recente primeiro; sem data do evento vai para o fim", () => {
    const r = ordenarParticipacoes([p("a", "2026-01-10"), p("b", null), p("c", "2026-03-05"), p("d", "2026-02-01")]);
    expect(r.map((x) => x.duplaId)).toEqual(["c", "d", "a", "b"]);
  });

  it("mesmo evento: inscrição mais recente primeiro; depois por id", () => {
    const r = ordenarParticipacoes([
      p("b", "2026-01-10", "2026-01-01T10:00:00.000Z"),
      p("a", "2026-01-10", "2026-01-01T12:00:00.000Z"),
      p("c", "2026-01-10", "2026-01-01T10:00:00.000Z"),
    ]);
    expect(r.map((x) => x.duplaId)).toEqual(["a", "b", "c"]);
  });

  it("Property: independe da permutação da entrada e não muta", () => {
    const gerador = fc.array(
      fc.record({
        id: fc.uuid(),
        data: fc.constantFrom("2026-01-10", "2026-02-01", "2026-03-05", null),
        em: fc.constantFrom("2026-01-01T10:00:00.000Z", "2026-01-02T10:00:00.000Z"),
      }),
      { maxLength: 12 }
    );
    fc.assert(
      fc.property(gerador, fc.nat(), (itens, giro) => {
        const lista = itens.map((i) => p(i.id, i.data, i.em));
        const copia = [...lista];
        const k = lista.length ? giro % lista.length : 0;
        const girada = [...lista.slice(k), ...lista.slice(0, k)];
        expect(ordenarParticipacoes(lista).map((x) => x.duplaId)).toEqual(ordenarParticipacoes(girada).map((x) => x.duplaId));
        expect(lista).toEqual(copia);
      }),
      { numRuns: 100 }
    );
  });
});

describe("iniciaisDoNome / chaveTexto / mensagens", () => {
  it("iniciais: primeiro e último nome", () => {
    expect(iniciaisDoNome("João da Silva")).toBe("JS");
    expect(iniciaisDoNome("maria")).toBe("M");
    expect(iniciaisDoNome("  ")).toBe("?");
    expect(iniciaisDoNome("")).toBe("?");
  });

  it("chaveTexto remove acentos, caixa e espaços repetidos", () => {
    expect(chaveTexto("  João   SILVA ")).toBe("joao silva");
  });

  it("todo código de erro tem mensagem; erros de campo apontam o campo certo", () => {
    const erros: JogadorErro[] = [
      { code: "NOME_JOGADOR_INVALIDO" }, { code: "APELIDO_INVALIDO" }, { code: "GENERO_INVALIDO" }, { code: "CATEGORIA_INVALIDA" },
      { code: "CIDADE_INVALIDA" }, { code: "UF_INVALIDA" }, { code: "INSTAGRAM_INVALIDO" },
      { code: "JOGADOR_NAO_ENCONTRADO" }, { code: "FALHA_PERSISTENCIA" }, { code: "FALHA_LEITURA" },
    ];
    for (const e of erros) expect(mensagemDoErro(e).length).toBeGreaterThan(5);
    expect(campoDoErro({ code: "NOME_JOGADOR_INVALIDO" })).toBe("nome");
    expect(campoDoErro({ code: "INSTAGRAM_INVALIDO" })).toBe("instagram");
    expect(campoDoErro({ code: "CATEGORIA_INVALIDA" })).toBe("categoria");
    expect(campoDoErro({ code: "FALHA_PERSISTENCIA" })).toBeNull();
  });
});
