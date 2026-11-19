// Guarda de texto sobre o bloco ORGANIZADORES de supabase/schema.sql e a
// migração supabase/migracao-organizadores.sql: papel de organizador, donos de
// evento e escrita limitada aos eventos que a pessoa gerencia.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ler = (nome: string) => readFileSync(join(__dirname, "..", "supabase", nome), "utf8");
const schema = ler("schema.sql");
const migracao = ler("migracao-organizadores.sql");

const marca = "-- ORGANIZADORES (papel, donos e escrita por organizador)";
const bloco = (texto: string) => texto.slice(texto.indexOf(marca)).trim();
const semComentarios = (texto: string) =>
  texto
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");

const sql = semComentarios(bloco(schema));
const policies = sql.match(/create policy[\s\S]*?;/g) ?? [];
const funcoes = sql.match(/create or replace function[\s\S]*?\$\$;/g) ?? [];
const policy = (nome: string) => policies.find((p) => p.includes(`create policy ${nome} `));
const funcao = (nome: string) => funcoes.find((f) => f.includes(`function public.${nome}(`));

describe("bloco ORGANIZADORES do schema.sql", () => {
  it("existe uma vez, no fim do arquivo, depois dos blocos de eventos e de gerenciar", () => {
    expect(schema.split(marca)).toHaveLength(2);
    expect(schema.indexOf(marca)).toBeGreaterThan(schema.indexOf("-- GERENCIAR CAMPEONATOS"));
  });

  it("as tabelas do papel e dos donos têm RLS e nenhum acesso para anon", () => {
    for (const t of ["organizadores", "campeonato_organizadores"]) {
      expect(sql, t).toMatch(new RegExp(`alter table ${t} enable row level security`));
      expect(sql, t).toMatch(new RegExp(`revoke all on ${t} from anon`));
    }
    expect(policies.filter((p) => /\bto anon\b|using \(true\)/.test(p))).toEqual([]);
  });

  it("toda policy do bloco é para authenticated", () => {
    expect(policies.length).toBeGreaterThan(10);
    for (const p of policies) expect(p).toMatch(/to authenticated/);
  });

  it("o e-mail do organizador é minúsculo e vem do JWT (cada conta só cria e lê o próprio)", () => {
    expect(sql).toMatch(/check \(email = lower\(btrim\(email\)\)/);
    expect(policy("organizadores_insert_proprio")).toMatch(/with check \(email = public\.email_logado\(\)\)/);
    expect(policy("organizadores_select_proprio")).toMatch(/using \(email = public\.email_logado\(\)\)/);
    expect(funcao("email_logado")).toMatch(/auth\.jwt\(\) ->> 'email'/);
  });

  it("só o administrador lê todos os organizadores e remove alguém do papel", () => {
    expect(policy("organizadores_select_admin")).toMatch(/using \(public\.eh_admin\(\)\)/);
    expect(policy("organizadores_delete_admin")).toMatch(/for delete[\s\S]*using \(public\.eh_admin\(\)\)/);
    expect(policies.some((p) => /on organizadores\s+for (update|all)/.test(p))).toBe(false);
  });

  it("o dono do evento só é dono se for organizador (FK) e some junto com o evento ou o papel", () => {
    expect(sql).toMatch(/campeonato_id text not null references campeonatos\(id\) on delete cascade/);
    expect(sql).toMatch(/email\s+text not null references organizadores\(email\) on delete cascade/);
    expect(sql).toMatch(/primary key \(campeonato_id, email\)/);
  });

  it("dono e administrador (pode_gerenciar_campeonato) veem, adicionam e removem donos", () => {
    for (const nome of ["campeonato_organizadores_select", "campeonato_organizadores_insert", "campeonato_organizadores_delete"]) {
      expect(policy(nome), nome).toMatch(/public\.pode_gerenciar_campeonato\(campeonato_id\)/);
    }
    expect(policies.some((p) => /on campeonato_organizadores\s+for (update|all)/.test(p))).toBe(false);
  });

  it("as funções de posse são security definer, com search_path fixo e execute só para authenticated", () => {
    for (const nome of [
      "eh_organizador",
      "pode_gerenciar_campeonato",
      "pode_gerenciar_categoria",
      "pode_gerenciar_dupla",
      "pode_gerenciar_chaveamento",
    ]) {
      const f = funcao(nome);
      expect(f, nome).toBeTruthy();
      expect(f, nome).toMatch(/security definer/);
      expect(f, nome).toMatch(/set search_path = public/);
      expect(sql, nome).toMatch(new RegExp(`revoke all on function public\\.${nome}\\([a-z]*\\) from public`));
      expect(sql, nome).toMatch(new RegExp(`grant execute on function public\\.${nome}\\([a-z]*\\) to authenticated`));
    }
  });

  it("pode_gerenciar_campeonato = administrador OU dono (e-mail do JWT)", () => {
    const f = funcao("pode_gerenciar_campeonato")!;
    expect(f).toMatch(/public\.eh_admin\(\) or exists/);
    expect(f).toMatch(/co\.campeonato_id = p_id/);
    expect(f).toMatch(/auth\.jwt\(\) ->> 'email'/);
  });

  it("a cadeia de posse: categoria -> evento; dupla e chaveamento -> categoria", () => {
    expect(funcao("pode_gerenciar_categoria")).toMatch(/pode_gerenciar_campeonato\(c\.campeonato_id\)/);
    expect(funcao("pode_gerenciar_dupla")).toMatch(/pode_gerenciar_categoria\(d\.categoria_id\)/);
    expect(funcao("pode_gerenciar_chaveamento")).toMatch(/pode_gerenciar_categoria\(ch\.categoria_id\)/);
  });
});

describe("escrita do organizador", () => {
  it("campeonatos: ver, alterar e apagar só os dele; criar exige papel, fonte manual e sem id_origem", () => {
    expect(policy("campeonatos_select_organizador")).toMatch(/for select[\s\S]*pode_gerenciar_campeonato\(id\)/);
    const upd = policy("campeonatos_update_organizador")!;
    expect(upd).toMatch(/using \(public\.pode_gerenciar_campeonato\(id\)\)/);
    expect(upd).toMatch(/with check \(public\.pode_gerenciar_campeonato\(id\)\)/);
    expect(policy("campeonatos_delete_organizador")).toMatch(/for delete[\s\S]*pode_gerenciar_campeonato\(id\)/);
    const ins = policy("campeonatos_insert_organizador")!;
    expect(ins).toMatch(/for insert/);
    expect(ins).toMatch(/public\.eh_organizador\(\)/);
    expect(ins).toMatch(/fonte = 'manual'/);
    expect(ins).toMatch(/id_origem is null/);
  });

  it("as tabelas de organização têm policy de organizador seguindo a posse do evento", () => {
    const esperado: Record<string, RegExp> = {
      categorias: /pode_gerenciar_campeonato\(campeonato_id\)/,
      duplas: /pode_gerenciar_categoria\(categoria_id\)/,
      chaveamentos: /pode_gerenciar_categoria\(categoria_id\)/,
      grupos: /pode_gerenciar_chaveamento\(chaveamento_id\)/,
      grupo_duplas: /pode_gerenciar_chaveamento\(g\.chaveamento_id\)/,
      jogos: /pode_gerenciar_chaveamento\(chaveamento_id\)/,
    };
    for (const [tabela, re] of Object.entries(esperado)) {
      const p = policy(`${tabela}_escrita_organizador`);
      expect(p, tabela).toBeTruthy();
      expect(p, tabela).toMatch(/for all to authenticated/);
      expect(p, tabela).toMatch(/using/);
      expect(p, tabela).toMatch(/with check/);
      expect(p, tabela).toMatch(re);
    }
  });

  it("referências a duplas (campea, grupo, jogos) também precisam ser de eventos dele", () => {
    expect(policy("chaveamentos_escrita_organizador")).toMatch(/pode_gerenciar_dupla\(campea_id\)/);
    expect(policy("grupo_duplas_escrita_organizador")).toMatch(/pode_gerenciar_dupla\(dupla_id\)/);
    const jogos = policy("jogos_escrita_organizador")!;
    for (const col of ["dupla_a", "dupla_b", "vencedor_id"]) {
      expect(jogos).toMatch(new RegExp(`pode_gerenciar_dupla\\(${col}\\)`));
    }
  });

  it("as policies de administrador continuam: nenhuma é removida pelo bloco", () => {
    expect(sql).not.toMatch(/drop policy if exists \w+_escrita_admin/);
    expect(sql).not.toMatch(/drop policy if exists campeonatos_select_admin/);
  });
});

describe("triggers de proteção", () => {
  it("(a) quem cria um evento sendo organizador vira dono (security definer)", () => {
    const f = funcao("vincular_criador_ao_campeonato")!;
    expect(f).toMatch(/security definer/);
    expect(f).toMatch(/public\.eh_organizador\(\) and not public\.eh_admin\(\)/);
    expect(f).toMatch(/insert into public\.campeonato_organizadores/);
    expect(sql).toMatch(/after insert on campeonatos[\s\S]*vincular_criador_ao_campeonato/);
  });

  it("(b) organizador não altera id, fonte nem id_origem", () => {
    const f = funcao("proteger_campos_do_campeonato")!;
    for (const campo of ["id", "fonte", "id_origem"]) {
      expect(f).toMatch(new RegExp(`new\\.${campo} is distinct from old\\.${campo}`));
    }
    expect(f).toMatch(/public\.eh_organizador\(\) and not public\.eh_admin\(\)/);
    expect(sql).toMatch(/before update on campeonatos[\s\S]*proteger_campos_do_campeonato/);
  });

  it("(c) organizador não apaga evento com categorias (23503: o site arquiva)", () => {
    const f = funcao("proteger_campeonato_com_categorias")!;
    expect(f).toMatch(/public\.eh_organizador\(\) and not public\.eh_admin\(\)/);
    expect(f).toMatch(/from public\.categorias c where c\.campeonato_id = old\.id/);
    expect(f).toMatch(/errcode = '23503'/);
    expect(sql).toMatch(/before delete on campeonatos[\s\S]*proteger_campeonato_com_categorias/);
  });

  it("(d) organizador não remove o último dono, mas a cascata do evento apagado é permitida", () => {
    const f = funcao("proteger_ultimo_dono")!;
    expect(f).toMatch(/ULTIMO_DONO/);
    expect(f).toMatch(/co\.email <> old\.email/);
    expect(f).toMatch(/from public\.campeonatos c where c\.id = old\.campeonato_id/);
    expect(sql).toMatch(/before delete on campeonato_organizadores[\s\S]*proteger_ultimo_dono/);
  });

  it("os triggers só agem sobre organizadores: scripts de carga e o SQL Editor seguem livres", () => {
    for (const nome of ["proteger_campos_do_campeonato", "proteger_campeonato_com_categorias", "proteger_ultimo_dono"]) {
      expect(funcao(nome), nome).toMatch(/if public\.eh_organizador\(\) and not public\.eh_admin\(\)/);
    }
  });
});

describe("migracao-organizadores.sql", () => {
  it("repete exatamente o bloco do schema.sql", () => {
    expect(bloco(migracao)).toBe(bloco(schema));
  });

  it("é idempotente (create/drop com if [not] exists ou or replace)", () => {
    const codigo = semComentarios(migracao);
    expect(codigo).not.toMatch(/create table (?!if not exists)/);
    expect(codigo).not.toMatch(/create (unique )?index (?!if not exists)/);
    expect(codigo).not.toMatch(/create function/);
    const criadas = codigo.match(/create policy (\w+) on (\w+)/g) ?? [];
    const removidas = codigo.match(/drop policy if exists (\w+) on (\w+)/g) ?? [];
    expect(criadas.length).toBe(removidas.length);
    const triggers = codigo.match(/create trigger (\w+)/g) ?? [];
    expect(codigo.match(/drop trigger if exists/g) ?? []).toHaveLength(triggers.length);
  });
});
