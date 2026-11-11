// Guarda de texto sobre supabase/schema.sql: a escrita anônima não pode voltar
// e as tabelas privadas precisam de RLS sem leitura pública.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(__dirname, "..", "supabase", "schema.sql"), "utf8");
// Ignora comentários de linha: só o SQL executável conta.
const codigo = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

/** Cria policies (create policy ... ;) como blocos de texto. */
const policies = codigo.match(/create policy[\s\S]*?;/g) ?? [];

describe("schema.sql: RLS com autenticação", () => {
  it("nenhuma policy de escrita é para anon", () => {
    const escritaAnon = policies.filter(
      (p) => /\bto anon\b/.test(p) && /for (all|insert|update|delete)/.test(p)
    );
    expect(escritaAnon).toEqual([]);
  });

  it("as policies antigas *_escrita_anon só aparecem em drop", () => {
    expect(codigo).not.toMatch(/create policy \w*_escrita_anon/);
    expect(codigo).toMatch(/drop policy if exists jogadores_escrita_anon/);
  });

  it("toda policy de escrita exige authenticated", () => {
    const escrita = policies.filter((p) => /for (all|insert|update|delete)/.test(p));
    expect(escrita.length).toBeGreaterThan(0);
    for (const p of escrita) expect(p).toMatch(/to authenticated/);
  });

  it("escrita das tabelas de organização usa eh_admin()", () => {
    for (const t of ["categorias", "duplas", "chaveamentos", "grupos", "grupo_duplas", "jogos", "jogadores"]) {
      const p = policies.find((x) => x.includes(`create policy ${t}_escrita_admin`));
      expect(p, t).toBeTruthy();
      expect(p).toMatch(/using \(public\.eh_admin\(\)\)/);
      expect(p).toMatch(/with check \(public\.eh_admin\(\)\)/);
    }
  });

  it("perfis e administradores têm RLS habilitado", () => {
    expect(codigo).toMatch(/alter table perfis enable row level security/);
    expect(codigo).toMatch(/alter table administradores enable row level security/);
  });

  it("administradores e perfis não têm leitura pública", () => {
    const publicas = policies.filter((p) => /on (administradores|perfis)\b/.test(p));
    expect(publicas.filter((p) => /\bto anon\b|using \(true\)/.test(p))).toEqual([]);
    expect(policies.some((p) => /on administradores\b/.test(p))).toBe(false);
  });

  it("eh_admin() é security definer, compara e-mail em minúsculas e só authenticated executa", () => {
    expect(codigo).toMatch(/function public\.eh_admin\(\)[\s\S]*security definer/);
    expect(codigo).toMatch(/lower\(btrim\(coalesce\(auth\.jwt\(\) ->> 'email'/);
    expect(codigo).toMatch(/grant execute on function public\.eh_admin\(\) to authenticated/);
  });

  it("perfis.jogador_id é único e o perfil nasce por trigger", () => {
    expect(codigo).toMatch(/jogador_id\s+uuid unique references jogadores/);
    expect(codigo).toMatch(/after insert on auth\.users/);
  });
});
