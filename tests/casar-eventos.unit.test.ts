import { describe, it, expect } from "vitest";
import type { Campeonato, Torneio } from "../src/types";
import {
  casarEventos,
  cidadeDoLocalAntigo,
  mesmaCidade,
  palavrasDoNome,
  similaridadeDeNome,
} from "../src/utils/casar-eventos";

const antigo = (id: string, nome: string, data: string, local: string): Campeonato => ({
  id,
  nome,
  data,
  local,
  foto: "",
  descricao: "",
});

const torneio = (id: string, nome: string, data: string, cidade: string): Torneio => ({
  id,
  nome,
  data,
  dataFim: data,
  cidade,
  uf: "SP",
  endereco: "",
  preco: null,
  precoTexto: "",
  categorias: [],
  instagram: "",
  fonte: "x",
});

describe("peças do casamento", () => {
  it("cidade do local antigo", () => {
    expect(cidadeDoLocalAntigo("Riplay Granja Vianna, Cotia")).toBe("Cotia");
    expect(cidadeDoLocalAntigo("Arena Shark, Limeira, SP")).toBe("Limeira");
    expect(cidadeDoLocalAntigo("São Bernardo do Campo, SP")).toBe("São Bernardo do Campo");
    expect(cidadeDoLocalAntigo("Riplay Ma Kai, Pirituba, São Paulo")).toBe("São Paulo");
    expect(cidadeDoLocalAntigo("")).toBe("");
  });

  it("mesma cidade ignora acento, caixa e sufixo", () => {
    expect(mesmaCidade("São Bernardo do Campo", "SAO BERNARDO")).toBe(true);
    expect(mesmaCidade("São Caetano do Sul", "São Caetano")).toBe(true);
    expect(mesmaCidade("Santos", "Santo André")).toBe(false);
    expect(mesmaCidade("", "Santos")).toBe(false);
  });

  it("palavras do nome ignoram números de edição e palavras vazias", () => {
    expect([...palavrasDoNome("3ª Edição Copa 2M")]).toEqual(["2m"]);
    expect(palavrasDoNome("Torneio de Futevôlei Posto 016").has("posto")).toBe(true);
    expect(palavrasDoNome("Torneio de Futevôlei Posto 016").has("torneio")).toBe(false);
  });

  it("similaridade", () => {
    expect(similaridadeDeNome("Open LP", "Open LP Futevôlei")).toBe(1);
    expect(similaridadeDeNome("Copa Sanchez Futevôlei", "Copa Bezerra de Futevôlei")).toBe(0);
  });
});

describe("casarEventos", () => {
  it("id idêntico casa primeiro", () => {
    const r = casarEventos(
      [antigo("a", "Quebrada Cup", "2026-11-13", "São Paulo, SP")],
      [torneio("a", "Quebrada Cup", "2026-11-13", "São Paulo")]
    );
    expect(r.pares).toHaveLength(1);
    expect(r.pares[0]).toMatchObject({ idAntigo: "a", idColetor: "a", motivo: "id" });
  });

  it("casa cidade escrita diferente (São Bernardo)", () => {
    const r = casarEventos(
      [antigo("261205_sao_bernardo_campeonato_paulista", "Campeonato Paulista de Futevôlei", "2026-12-05", "São Bernardo do Campo, SP")],
      [torneio("261205_sao_bernardo_do_campo_campeonato_paulista_de_futevolei", "Campeonato Paulista de Futevôlei", "2026-12-05", "SÃO BERNARDO DO CAMPO")]
    );
    expect(r.pares[0].idColetor).toBe("261205_sao_bernardo_do_campo_campeonato_paulista_de_futevolei");
  });

  it("tolera 1 dia de diferença, mas não 2", () => {
    const base = antigo("x", "1ª Copa Reis da Areia", "2026-11-14", "Ribeirão Preto, SP");
    expect(casarEventos([base], [torneio("y", "1ª Copa Reis da Areia", "2026-11-13", "Ribeirão Preto")]).pares).toHaveLength(1);
    expect(casarEventos([base], [torneio("y", "1ª Copa Reis da Areia", "2026-11-12", "Ribeirão Preto")]).pares).toHaveLength(0);
  });

  it("id com mês errado casa pela data real", () => {
    const r = casarEventos(
      [antigo("261111_mogi_das_cruzes_ct_piter_yuri", "9ª Etapa CT Piter Yuri", "2026-12-11", "CT Piter Yuri, Mogi das Cruzes, SP")],
      [torneio("261211_mogi_das_cruzes_9_etapa_torneio_ct_piter_yuri_de_futevolei", "9ª Etapa Torneio CT Piter Yuri de Futevôlei", "2026-12-11", "Mogi das Cruzes")]
    );
    expect(r.pares).toHaveLength(1);
  });

  it("um para um: dois antigos parecidos disputam o mesmo torneio", () => {
    const r = casarEventos(
      [
        antigo("261212_pirituba_mss_cup", "MSS Cup", "2026-12-12", "Riplay Ma Kai, Pirituba, São Paulo"),
        antigo("261212_sao_paulo_mss_cup", "MSS Cup", "2026-12-12", "São Paulo, SP"),
      ],
      [torneio("261212_sao_paulo_mss_cup", "MSS Cup", "2026-12-12", "São Paulo")]
    );
    expect(r.pares).toHaveLength(1);
    expect(r.pares[0].idAntigo).toBe("261212_sao_paulo_mss_cup");
    expect(r.soCampeonatos.map((c) => c.id)).toEqual(["261212_pirituba_mss_cup"]);
  });

  it("cidade ou nome diferentes não casam", () => {
    const a = antigo("a", "Copa Sanchez", "2026-11-21", "São Caetano do Sul, SP");
    expect(casarEventos([a], [torneio("b", "Copa Sanchez", "2026-11-21", "Santos")]).pares).toHaveLength(0);
    expect(casarEventos([a], [torneio("b", "Open Bezerra", "2026-11-21", "São Caetano do Sul")]).pares).toHaveLength(0);
  });

  it("separa os três grupos e é determinístico", () => {
    const antigos = [antigo("a", "Torres Cup", "2026-12-04", "Taubaté, SP"), antigo("z", "Elite Cup", "2026-12-05", "Santos, SP")];
    const torneios = [torneio("t2", "Open Salto", "2026-11-28", "Salto"), torneio("a", "Torres Cup", "2026-12-04", "Taubaté")];
    const r1 = casarEventos(antigos, torneios);
    const r2 = casarEventos([...antigos].reverse(), [...torneios].reverse());
    expect(r1.pares.map((p) => p.idAntigo)).toEqual(["a"]);
    expect(r1.soTorneios.map((t) => t.id)).toEqual(["t2"]);
    expect(r1.soCampeonatos.map((c) => c.id)).toEqual(["z"]);
    expect(r2.pares).toEqual(r1.pares);
  });
});
