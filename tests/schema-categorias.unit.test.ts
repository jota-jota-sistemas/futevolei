// Guarda de texto sobre o bloco "CATEGORIAS: PROTEÇÃO DE REMOÇÃO" do schema.sql
// e a migração supabase/migracao-categorias-organizador.sql.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ler = (nome: string) => readFileSync(join(__dirname, "..", "supabase", nome), "utf8");
const schema = ler("schema.sql");
const migracao = ler("migracao-categorias-organizador.sql");

const marca = "-- CATEGORIAS: PROTEÇÃO DE REMOÇÃO";
const bloco = (texto: string) => texto.slice(texto.indexOf(marca)).trim();
const semComentarios = (texto: string) =>
  texto
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");

const sql = semComentarios(bloco(schema));

describe("bloco de categorias do schema.sql", () => {
  it("existe uma vez, no fim do arquivo, depois do bloco de organizadores", () => {
    expect(schema.split(marca)).toHaveLength(2);
    expect(schema.indexOf(marca)).toBeGreaterThan(schema.indexOf("-- ORGANIZADORES (papel"));
  });

  it("o trigger roda ANTES de apagar, é security definer e com search_path fixo", () => {
    expect(sql).toMatch(/create or replace function public\.proteger_categoria_com_duplas\(\)/);
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/set search_path = public/);
    expect(sql).toMatch(/before delete on categorias\s+for each row execute function public\.proteger_categoria_com_duplas\(\)/);
  });

  it("só age sobre o organizador (não administrador) e só quando há duplas", () => {
    expect(sql).toMatch(/if public\.eh_organizador\(\) and not public\.eh_admin\(\) then/);
    expect(sql).toMatch(/from public\.duplas d where d\.categoria_id = old\.id/);
  });

  it("o erro é violação de chave estrangeira (23503), que o site traduz em TEM_DUPLAS", () => {
    expect(sql).toMatch(/CATEGORIA_COM_DUPLAS/);
    expect(sql).toMatch(/errcode = '23503'/);
  });

  it("não cria policy nem dá acesso a anon (a escrita continua nas policies existentes)", () => {
    expect(sql).not.toMatch(/create policy/);
    expect(sql).not.toMatch(/\bto anon\b/);
  });
});

describe("migracao-categorias-organizador.sql", () => {
  it("repete exatamente o bloco do schema.sql", () => {
    expect(bloco(migracao)).toBe(bloco(schema));
  });

  it("é idempotente (create or replace e drop trigger if exists)", () => {
    const codigo = semComentarios(migracao);
    expect(codigo).not.toMatch(/create function/);
    expect(codigo.match(/drop trigger if exists/g)).toHaveLength(1);
    expect(codigo.match(/create trigger/g)).toHaveLength(1);
  });
});
