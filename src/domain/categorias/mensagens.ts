// src/domain/categorias/mensagens.ts
//
// Mensagens pt-BR para os erros de categoria. Pura; usada pelas telas.

import type { CategoriaErro } from "./types";

export function mensagemDoErro(erro: CategoriaErro): string {
  switch (erro.code) {
    case "NOME_INVALIDO":
      return "O nome da categoria deve ter de 1 a 60 caracteres.";
    case "CATEGORIA_NAO_ENCONTRADA":
      return "Categoria não encontrada.";
    case "TEM_DUPLAS":
      return "Esta categoria já tem duplas inscritas e não pode ser removida. Remova as duplas antes.";
    case "SEM_PERMISSAO":
      return "Você não gerencia este campeonato.";
    case "FALHA_PERSISTENCIA":
      return "Falha ao salvar. Tente novamente em instantes.";
    case "FALHA_LEITURA":
      return "Não foi possível carregar as categorias. Tente novamente em instantes.";
  }
}
