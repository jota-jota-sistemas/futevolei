// src/scripts/organizar/mensagens.ts
//
// Tradução de DomainError para mensagens amigáveis em português, usada pela
// página de organização e pelos módulos de duplas, formato e nivelador.
import type { DomainError } from "../../domain/bracket/types";


export function mensagemErro(erro: DomainError): string {
  switch (erro.code) {
    case "NOME_DUPLA_INVALIDO":
      return "Informe um nome de dupla válido (1 a 80 caracteres).";
    case "NOME_ATLETA_INVALIDO":
      return `Informe um nome válido para o atleta ${erro.qual} (1 a 80 caracteres).`;
    case "NOME_DUPLICADO":
      return "Já existe uma dupla com esse nome nesta categoria.";
    case "REMOCAO_BLOQUEADA":
      return "Não é possível remover duplas depois que o chaveamento foi gerado.";
    case "EDICAO_BLOQUEADA":
      return "Não é possível editar duplas depois que o chaveamento foi gerado.";
    case "FORMATO_AUSENTE":
      return "Escolha um formato antes de gerar o chaveamento.";
    case "FORMATO_INVALIDO":
      return "Formato inválido. Escolha 'fase de grupos' ou 'dupla eliminação'.";
    case "GRUPOS_INVALIDO":
      return "Número de grupos inválido (inteiro de 1 até a metade do número de duplas).";
    case "CLASSIFICADOS_INVALIDO":
      return "Número de classificados por grupo inválido (inteiro, de 1 até o tamanho do menor grupo menos 1).";
    case "SEED_DUPLICADO":
      return `A posição do nivelador ${erro.posicao} está repetida.`;
    case "SEED_FORA_INTERVALO":
      return `A posição do nivelador ${erro.posicao} está fora do intervalo permitido.`;
    case "SEED_LACUNA":
      return `Há uma lacuna no nivelador: falta a posição ${erro.posicao}.`;
    case "DUPLAS_INSUFICIENTES":
      return "São necessárias pelo menos 2 duplas para gerar o chaveamento.";
    case "DUPLAS_EXCEDEM_LIMITE":
      return "O número de duplas excede o limite suportado (máximo de 128).";
    case "VENCEDOR_INVALIDO":
      return "A dupla informada não participa deste jogo.";
    case "JOGO_NAO_PRONTO":
      return "Este jogo ainda não está pronto para registro (falta definir uma das duplas).";
    case "PLACAR_INVALIDO":
      return "Informe placares inteiros, 0 ou maior.";
    case "PLACAR_EMPATE":
      return "Não há empate: um dos placares deve ser maior.";
    case "JOGO_ENCERRADO":
      return "Este jogo já foi encerrado.";
    case "FALHA_PERSISTENCIA":
      return "Falha ao salvar. Tente novamente em instantes.";
    case "FALHA_LEITURA":
      return "Falha ao carregar os dados. Tente novamente em instantes.";
    default:
      // Exaustividade: qualquer código novo cai aqui com mensagem genérica.
      return "Ocorreu um erro inesperado.";
  }
}
