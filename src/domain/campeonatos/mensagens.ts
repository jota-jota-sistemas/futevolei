// src/domain/campeonatos/mensagens.ts
//
// Mensagens pt-BR para os erros de campeonato. Pura; usada pelas telas.

import type { CampeonatoErro } from "./types";

/** Campo do formulário ao qual o erro pertence (null = erro geral). */
export type CampoCampeonato =
  | "nome"
  | "data"
  | "dataFim"
  | "cidade"
  | "uf"
  | "endereco"
  | "preco"
  | "precoTexto"
  | "inscricao"
  | "instagram"
  | "descricao";

export function campoDoErro(erro: CampeonatoErro): CampoCampeonato | null {
  switch (erro.code) {
    case "NOME_INVALIDO":
      return "nome";
    case "DATA_INVALIDA":
      return "data";
    case "DATA_FIM_INVALIDA":
      return "dataFim";
    case "CIDADE_INVALIDA":
      return "cidade";
    case "UF_INVALIDA":
      return "uf";
    case "ENDERECO_INVALIDO":
      return "endereco";
    case "PRECO_INVALIDO":
      return "preco";
    case "PRECO_TEXTO_INVALIDO":
      return "precoTexto";
    case "INSCRICAO_INVALIDA":
      return "inscricao";
    case "INSTAGRAM_INVALIDO":
      return "instagram";
    case "DESCRICAO_INVALIDA":
      return "descricao";
    default:
      return null;
  }
}

export function mensagemDoErro(erro: CampeonatoErro): string {
  switch (erro.code) {
    case "NOME_INVALIDO":
      return "Informe o nome do campeonato (1 a 120 caracteres).";
    case "DATA_INVALIDA":
      return "Informe uma data de início válida.";
    case "DATA_FIM_INVALIDA":
      return "A data final deve ser válida e não pode ser anterior ao início.";
    case "CIDADE_INVALIDA":
      return "A cidade deve ter de 1 a 80 caracteres.";
    case "UF_INVALIDA":
      return "Escolha uma UF válida ou deixe em branco.";
    case "ENDERECO_INVALIDO":
      return "O endereço deve ter de 1 a 200 caracteres.";
    case "PRECO_INVALIDO":
      return "Informe um valor numérico válido, como 160 ou 160,50.";
    case "PRECO_TEXTO_INVALIDO":
      return "O texto do preço deve ter de 1 a 60 caracteres.";
    case "INSCRICAO_INVALIDA":
      return "Use o link completo da inscrição, começando com http:// ou https://.";
    case "INSTAGRAM_INVALIDO":
      return "Use o @usuario ou um link do instagram.com.";
    case "DESCRICAO_INVALIDA":
      return "A descrição pode ter até 2000 caracteres.";
    case "CAMPEONATO_NAO_ENCONTRADO":
      return "Campeonato não encontrado.";
    case "SEM_PERMISSAO":
      return "Você não gerencia este campeonato.";
    case "EMAIL_INVALIDO":
      return "Informe um e-mail válido.";
    case "NAO_ORGANIZADOR":
      return "Essa pessoa precisa ser organizadora primeiro: em Minha conta, ela usa “Quero ser organizador”.";
    case "ULTIMO_DONO":
      return "O campeonato precisa de ao menos um organizador.";
    case "FALHA_PERSISTENCIA":
      return "Falha ao salvar. Tente novamente em instantes.";
    case "FALHA_LEITURA":
      return "Não foi possível carregar os dados. Tente novamente em instantes.";
  }
}
