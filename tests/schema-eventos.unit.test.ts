// Guarda de texto sobre o formato de eventos em supabase/schema.sql e a
// migração supabase/migracao-eventos.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ler = (nome: string) => readFileSync(join(__dirname, "..", "supabase", nome), "utf8");
const schema = ler("schema.sql");
const migracao = ler("migracao-eventos.sql");

const marca = "-- EVENTOS (formato do torneios.json)";
const bloco = (texto: string) => texto.slice(texto.indexOf(marca)).trim();
const semComentarios = (texto: string) =>
  texto
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");

describe("formato de eventos", () => {
  const sql = semComentarios(bloco(schema));

  it("acrescenta as colunas do torneios.json", () => {
    for (const coluna of [
      "data_fim",
      "cidade",
      "uf",
      "endereco",
      "preco",
      "preco_texto",
      "inscricao",
      "fonte",
      "id_origem",
      "ativo",
      "listado",
      "atualizado_em",
    ]) {
      expect(sql, coluna).toMatch(new RegExp(`add column if not exists ${coluna}\\b`));
    }
  });

  it("local, foto e descricao deixam de ser obrigatórios", () => {
    for (const c of ["local", "foto", "descricao"]) {
      expect(sql, c).toMatch(new RegExp(`alter column ${c}\\s+drop not null`));
    }
  });

  it("id_origem é único e há checks de UF e de data_fim", () => {
    expect(sql).toMatch(/create unique index if not exists campeonatos_id_origem_unico\s+on campeonatos \(id_origem\)/);
    expect(sql).toMatch(/campeonatos_uf_valida/);
    expect(sql).toMatch(/uf ~ '\^\[A-Z\]\{2\}\$'/);
    expect(sql).toMatch(/data_fim >= data/);
  });

  it("leitura pública só de eventos ativos", () => {
    expect(sql).toMatch(/drop policy if exists campeonatos_select_publico on campeonatos/);
    expect(sql).toMatch(/create policy campeonatos_select_publico on campeonatos\s+for select using \(ativo\)/);
  });

  it("não cria policy de escrita para campeonatos", () => {
    expect(sql).not.toMatch(/create policy \w+ on campeonatos\s+for (all|insert|update|delete)/);
  });
});

describe("migracao-eventos.sql", () => {
  it("repete exatamente o bloco de eventos do schema.sql", () => {
    expect(bloco(migracao)).toBe(bloco(schema));
  });

  it("é idempotente (sem add column nem create sem if not exists)", () => {
    const sql = semComentarios(migracao);
    expect(sql).not.toMatch(/add column (?!if not exists)/);
    expect(sql).not.toMatch(/create (unique )?index (?!if not exists)/);
  });
});
