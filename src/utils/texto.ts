/**
 * Chave de comparação de textos para busca e homônimos: sem acentos, minúsculas
 * e com espaços colapsados ("  João   SILVA " -> "joao silva").
 */
export function chaveTexto(texto: string): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
