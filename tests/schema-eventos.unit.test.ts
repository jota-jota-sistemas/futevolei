// Guarda de texto sobre o formato de eventos em supabase/schema.sql e a
// migração supabase/migracao-eventos.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ler = (nome: string) => readFileSync(join(__dirname, "..", "supabase", nome), "utf8");
const schema = ler("schema.sql");
const migracao = ler("migracao-eventos.sql");

const marca = "-- EVENTOS (formato do torneios.json)";
const marcaGerenciar = "-- GERENCIAR CAMPEONATOS";
// Do marcador de eventos até o bloco seguinte (gerenciar campeonatos), se houver.
const bloco = (texto: string) => {
  const ini = texto.indexOf(marca);
  const prox = texto.indexOf(marcaGerenciar);
  const fim = prox > ini ? prox : texto.length;
  return texto.slice(ini, fim).replace(/\n-- -+\s*$/, "").trim();
};
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

describe("gerenciar campeonatos (escrita por administradores)", () => {
  // Do marcador até o bloco seguinte (organizadores), se houver.
  const blocoGerenciar = (texto: string) => {
    const ini = texto.indexOf(marcaGerenciar);
    const prox = texto.indexOf("-- ORGANIZADORES (papel");
    const fim = prox > ini ? prox : texto.length;
    return texto.slice(ini, fim).replace(/\n-- -+\s*$/, "").trim();
  };
  const sql = semComentarios(blocoGerenciar(schema));
  const migracaoGerenciar = ler("migracao-gerenciar-campeonatos.sql");

  it("admin lê todos os eventos (inclusive arquivados) e escreve", () => {
    expect(sql).toMatch(
      /create policy campeonatos_select_admin on campeonatos\s+for select to authenticated using \(public\.eh_admin\(\)\)/
    );
    expect(sql).toMatch(
      /create policy campeonatos_escrita_admin on campeonatos\s+for all to authenticated using \(public\.eh_admin\(\)\) with check \(public\.eh_admin\(\)\)/
    );
  });

  it("nenhuma policy de campeonatos dá escrita a anon", () => {
    expect(sql).not.toMatch(/to anon/);
  });

  it("a migração repete exatamente o bloco do schema.sql e é idempotente", () => {
    expect(blocoGerenciar(migracaoGerenciar)).toBe(blocoGerenciar(schema));
    const codigo = semComentarios(migracaoGerenciar);
    // Cada create policy é precedido do respectivo drop policy if exists.
    expect(codigo.match(/drop policy if exists/g)).toHaveLength(2);
    expect(codigo.match(/create policy/g)).toHaveLength(2);
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
