// src/domain/categorias/validation.ts
//
// Validação, geração e mescla de categorias. Funções puras, sem I/O.
//
// Regras:
//   - nome: espaços nas pontas e repetidos são removidos; 1..60 caracteres;
//   - duas categorias são "a mesma" quando têm o mesmo SLUG (a rota de
//     organização usa o slug: dois nomes com o mesmo slug disputariam a rota) ou
//     o mesmo texto sem caixa nem acento;
//   - o gerador Gênero × Nível usa os mesmos vocabulários do filtro público
//     (utils/categorias.ts), sem "Outros", para o filtro continuar casando.

import { GENEROS, NIVEIS, type Genero, type Nivel } from "../../utils/categorias";
import { chaveTexto } from "../../utils/texto";
import { slugCategoria } from "../../utils/url";
import type { MesclaCategorias, ResultadoCategoria } from "./types";

export const NOME_CATEGORIA_MAX = 60;

/** Níveis que podem virar categoria (todos menos "Outros"). */
export const NIVEIS_DE_CATEGORIA: readonly Exclude<Nivel, "Outros">[] = NIVEIS.filter(
  (n): n is Exclude<Nivel, "Outros"> => n !== "Outros"
);

/** Tira espaços das pontas e colapsa os repetidos. */
export function normalizarNomeCategoria(nome: string): string {
  return (nome ?? "").replace(/\s+/g, " ").trim();
}

/** Nome normalizado se tiver 1..60 caracteres e gerar um slug; senão NOME_INVALIDO. */
export function validarNomeCategoria(nome: string): ResultadoCategoria<string> {
  const limpo = normalizarNomeCategoria(nome);
  // Sem slug (só símbolos) a rota de organização não existiria.
  if (limpo.length < 1 || limpo.length > NOME_CATEGORIA_MAX || slugCategoria(limpo) === "") {
    return { ok: false, erro: { code: "NOME_INVALIDO" } };
  }
  return { ok: true, valor: limpo };
}

/**
 * Chaves que identificam "a mesma categoria": o slug da rota e o texto sem
 * caixa/acento. Um nome só é novo se NENHUMA das duas chaves já existe.
 */
function chavesDe(nome: string): string[] {
  const chaves = [slugCategoria(nome), chaveTexto(nome)];
  return chaves.filter((c) => c !== "");
}

/**
 * Produto Gênero × Nível, nesta ordem (gênero na ordem recebida, nível na
 * ordem recebida), ex.: ["Masculino","Feminino"] × ["Iniciante","Open"] ->
 * "Masculino Iniciante", "Masculino Open", "Feminino Iniciante", "Feminino Open".
 * Valores fora dos vocabulários e repetidos são ignorados. Não muta a entrada.
 */
export function gerarNomesPorGeneroNivel(
  generos: readonly string[],
  niveis: readonly string[]
): string[] {
  const generosOk = Array.from(new Set(generos)).filter((g): g is Genero =>
    (GENEROS as readonly string[]).includes(g)
  );
  const niveisOk = Array.from(new Set(niveis)).filter((n) =>
    (NIVEIS_DE_CATEGORIA as readonly string[]).includes(n)
  );
  const nomes: string[] = [];
  for (const g of generosOk) for (const n of niveisOk) nomes.push(`${g} ${n}`);
  return nomes;
}

/**
 * Decide o que fazer com `novos` diante das categorias `existentes`: quais
 * criar, quais já existem (ou repetem outro da própria lista) e quais são
 * inválidas. Preserva a ordem de entrada. Não muta as entradas.
 */
export function mesclarCategorias(
  existentes: readonly string[],
  novos: readonly string[]
): MesclaCategorias {
  const vistas = new Set<string>();
  for (const e of existentes) for (const c of chavesDe(normalizarNomeCategoria(e))) vistas.add(c);

  const resultado: MesclaCategorias = { adicionar: [], repetidas: [], invalidas: [] };
  for (const bruto of novos) {
    const valido = validarNomeCategoria(bruto);
    if (!valido.ok) {
      resultado.invalidas.push(bruto);
      continue;
    }
    const nome = valido.valor;
    const chaves = chavesDe(nome);
    if (chaves.some((c) => vistas.has(c))) {
      resultado.repetidas.push(nome);
      continue;
    }
    for (const c of chaves) vistas.add(c);
    resultado.adicionar.push(nome);
  }
  return resultado;
}
