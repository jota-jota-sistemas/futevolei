// src/domain/pairs/nome.ts
//
// Nome de dupla. As duplas não têm nome próprio no dia a dia; o sistema ainda
// precisa de um `nomeDupla` único por categoria, então ele é GERADO a partir dos
// atletas + horário de cadastro. Para exibir, usa-se "Atleta A & Atleta B".
// Funções puras.

/** Rótulo exibido nas telas: "Atleta A & Atleta B". */
export function rotuloDupla(dupla: { atletaA: string; atletaB: string }): string {
  return `${dupla.atletaA.trim()} & ${dupla.atletaB.trim()}`;
}

/** Limite de caracteres de cada atleta dentro do nome gerado (cabe nos 80 do banco). */
const MAX_ATLETA_NO_NOME = 24;

/**
 * Nome interno (único) da dupla: "A & B <timestamp ISO do cadastro>".
 * Os atletas são truncados só aqui, para respeitar o limite de 80 caracteres;
 * o rótulo exibido (`rotuloDupla`) usa os nomes completos.
 */
export function gerarNomeDupla(
  atletaA: string,
  atletaB: string,
  cadastradoEmISO: string,
): string {
  const corta = (s: string): string => s.trim().slice(0, MAX_ATLETA_NO_NOME);
  return `${corta(atletaA)} & ${corta(atletaB)} ${cadastradoEmISO}`;
}
