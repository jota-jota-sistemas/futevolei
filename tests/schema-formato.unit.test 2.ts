// Guarda de texto: o `check` de categorias.formato aceita os três formatos no
// schema.sql e na migração, e o mapper do chaveamento lê "eliminação simples".
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bracketParaLinhas, linhasParaBracket, pairParaDuplaRow } from "../src/store/mappers";
import { gerarChaveamento } from "../src/domain/bracket/generator";
import { numerarJogos } from "../src/domain/bracket/ordenacao";

const ler = (nome: string) => readFileSync(join(__dirname, "..", "supabase", nome), "utf8");
const TRES = "check (formato in ('fase de grupos','dupla eliminação','eliminação simples'))";

describe("formato 'eliminação simples' no banco", () => {
  it("schema.sql aceita os três formatos na tabela categorias", () => {
    expect(ler("schema.sql")).toContain(TRES.replace("check (", "check ("));
  });
  it("a migração troca o check de forma idempotente", () => {
    const m = ler("migracao-formato-eliminacao-simples.sql");
    expect(m).toMatch(/drop constraint if exists categorias_formato_check/);
    expect(m).toContain(TRES);
  });
  it("o mapper lê de volta um chaveamento de eliminação simples", () => {
    const duplas = Array.from({ length: 4 }, (_, i) => ({
      id: `p${i + 1}`, nomeDupla: `D${i + 1}`, atletaA: `A${i}`, atletaB: `B${i}`,
      seed: i + 1, criadoEm: "2026-01-01T00:00:00.000Z",
    }));
    const r = gerarChaveamento({ duplas, config: { formato: "eliminação simples" } });
    if (!r.ok) throw new Error("falha ao gerar");
    const b = numerarJogos({ ...r.bracket, campeonatoId: "c", categoriaId: "k" });
    const linhas = bracketParaLinhas(b, "ch1");
    const volta = linhasParaBracket({
      ...linhas,
      duplas: b.duplas.map((d) => pairParaDuplaRow(d, "k")),
    });
    expect(volta.formato).toBe("eliminação simples");
    expect(volta.matches).toHaveLength(b.matches.length);
  });
});
