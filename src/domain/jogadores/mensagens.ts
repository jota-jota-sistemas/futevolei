// src/domain/jogadores/mensagens.ts
//
// Mensagens pt-BR para os erros de jogador. Pura; usada pelas telas.

import type { JogadorErro } from "./types";

/** Campo do formulário ao qual o erro pertence (null = erro geral). */
export type CampoJogador =
  | "nome"
  | "apelido"
  | "genero"
  | "categoria"
  | "cidade"
  | "uf"
  | "instagram";

export function campoDoErro(erro: JogadorErro): CampoJogador | null {
  switch (erro.code) {
    case "NOME_JOGADOR_INVALIDO":
      return "nome";
    case "APELIDO_INVALIDO":
      return "apelido";
    case "GENERO_INVALIDO":
      return "genero";
    case "CATEGORIA_INVALIDA":
      return "categoria";
    case "CIDADE_INVALIDA":
      return "cidade";
    case "UF_INVALIDA":
      return "uf";
    case "INSTAGRAM_INVALIDO":
      return "instagram";
    default:
      return null;
  }
}

export function mensagemDoErro(erro: JogadorErro): string {
  switch (erro.code) {
    case "NOME_JOGADOR_INVALIDO":
      return "Informe o nome do jogador (1 a 80 caracteres).";
    case "APELIDO_INVALIDO":
      return "O apelido deve ter de 1 a 40 caracteres.";
    case "GENERO_INVALIDO":
      return "Escolha um gênero válido ou deixe em branco.";
    case "CATEGORIA_INVALIDA":
      return "Escolha uma categoria da lista ou deixe em branco.";
    case "CIDADE_INVALIDA":
      return "A cidade deve ter de 1 a 80 caracteres.";
    case "UF_INVALIDA":
      return "Escolha uma UF válida ou deixe em branco.";
    case "INSTAGRAM_INVALIDO":
      return "Use o @usuario ou o link do perfil (não de uma publicação).";
    case "JOGADOR_NAO_ENCONTRADO":
      return "Jogador não encontrado.";
    case "FALHA_PERSISTENCIA":
      return "Falha ao salvar. Tente novamente em instantes.";
    case "FALHA_LEITURA":
      return "Não foi possível carregar os dados. Tente novamente em instantes.";
  }
}
