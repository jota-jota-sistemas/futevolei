// src/domain/jogadores/validation.ts
//
// Validação, normalização, busca e ordenação de jogadores — funções puras,
// sem I/O (mesmo estilo de `domain/pairs/validation.ts`).
//
// Regras:
//   - nome: 1..80 caracteres após trim                      -> NOME_JOGADOR_INVALIDO
//   - apelido (opcional): 1..40 após trim                   -> APELIDO_INVALIDO
//   - gênero (opcional): "masculino" | "feminino"            -> GENERO_INVALIDO
//   - categoria (opcional): um nível de CATEGORIAS_JOGADOR      -> CATEGORIA_INVALIDA
//   - cidade (opcional): 1..80 após trim                    -> CIDADE_INVALIDA
//   - UF (opcional): sigla brasileira, aceita minúscula      -> UF_INVALIDA
//   - instagram (opcional): @usuario, usuario ou URL de perfil -> INSTAGRAM_INVALIDO
//   - campo opcional vazio (ou só espaços) vira null
//   - homônimos NÃO são erro: `encontrarHomonimos` só informa, e a tela pede
//     confirmação (pessoas diferentes podem ter o mesmo nome).
// O primeiro erro encontrado é devolvido, na ordem dos campos acima.

import {
  CATEGORIAS_JOGADOR,
  GENEROS_JOGADOR,
  type CategoriaJogador,
  type GeneroJogador,
  type Jogador,
  type JogadorDados,
  type JogadorInput,
  type ParticipacaoDupla,
  type ResultadoJogador,
} from "./types";
import { chaveTexto } from "../../utils/texto";

const NOME_MAX = 80;
const APELIDO_MAX = 40;
const CIDADE_MAX = 80;

/** Siglas de UF brasileiras. */
export const UFS_BRASIL = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

/** Texto com trim, ou "" quando ausente. */
function aparar(texto: string | undefined): string {
  return (texto ?? "").trim();
}

function tamanhoValido(texto: string, max: number): boolean {
  return texto.length >= 1 && texto.length <= max;
}

/** Rótulos pt-BR dos gêneros, para exibição. */
export function rotuloGenero(genero: GeneroJogador): string {
  return genero === "masculino" ? "Masculino" : "Feminino";
}

/**
 * Normaliza o campo Instagram para o @usuario puro (sem "@", minúsculo).
 * Aceita "@usuario", "usuario" ou uma URL de PERFIL do instagram.com
 * (https://www.instagram.com/usuario/). Links de post/reel/etc. são rejeitados.
 * Vazio -> null (campo opcional). Sintaxe do usuário: letras, números, "." e
 * "_" (1..30), como no próprio Instagram.
 */
export function normalizarInstagram(
  valor: string | undefined
): ResultadoJogador<string | null> {
  const bruto = aparar(valor);
  if (bruto === "") return { ok: true, valor: null };

  let usuario = bruto;
  if (/^https?:\/\//i.test(bruto)) {
    let url: URL;
    try {
      url = new URL(bruto);
    } catch {
      return { ok: false, erro: { code: "INSTAGRAM_INVALIDO" } };
    }
    const host = url.hostname.toLowerCase();
    if (host !== "instagram.com" && host !== "www.instagram.com") {
      return { ok: false, erro: { code: "INSTAGRAM_INVALIDO" } };
    }
    const primeiro = url.pathname.split("/").filter(Boolean)[0] ?? "";
    // Rotas que não são perfil (post, reel, stories…) não identificam o jogador.
    if (["p", "reel", "reels", "tv", "stories", "explore"].includes(primeiro.toLowerCase())) {
      return { ok: false, erro: { code: "INSTAGRAM_INVALIDO" } };
    }
    usuario = primeiro;
  }

  usuario = usuario.replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(usuario)) {
    return { ok: false, erro: { code: "INSTAGRAM_INVALIDO" } };
  }
  return { ok: true, valor: usuario };
}

/**
 * Valida e normaliza os dados de um jogador (entrada crua de formulário).
 * Não muta a entrada. Devolve o primeiro erro encontrado.
 */
export function validarJogador(
  entrada: JogadorInput
): ResultadoJogador<JogadorDados> {
  const nome = aparar(entrada.nome);
  if (!tamanhoValido(nome, NOME_MAX)) {
    return { ok: false, erro: { code: "NOME_JOGADOR_INVALIDO" } };
  }

  const apelido = aparar(entrada.apelido);
  if (apelido !== "" && !tamanhoValido(apelido, APELIDO_MAX)) {
    return { ok: false, erro: { code: "APELIDO_INVALIDO" } };
  }

  const generoBruto = aparar(entrada.genero).toLowerCase();
  if (
    generoBruto !== "" &&
    !(GENEROS_JOGADOR as readonly string[]).includes(generoBruto)
  ) {
    return { ok: false, erro: { code: "GENERO_INVALIDO" } };
  }

  // Categoria: aceita sem diferenciar caixa e devolve a grafia canônica.
  const categoriaBruta = aparar(entrada.categoria);
  const categoria =
    categoriaBruta === ""
      ? null
      : CATEGORIAS_JOGADOR.find(
          (c) => c.toLowerCase() === categoriaBruta.toLowerCase()
        );
  if (categoria === undefined) {
    return { ok: false, erro: { code: "CATEGORIA_INVALIDA" } };
  }

  const cidade = aparar(entrada.cidade);
  if (cidade !== "" && !tamanhoValido(cidade, CIDADE_MAX)) {
    return { ok: false, erro: { code: "CIDADE_INVALIDA" } };
  }

  const uf = aparar(entrada.uf).toUpperCase();
  if (uf !== "" && !(UFS_BRASIL as readonly string[]).includes(uf)) {
    return { ok: false, erro: { code: "UF_INVALIDA" } };
  }

  const instagram = normalizarInstagram(entrada.instagram);
  if (!instagram.ok) return instagram;

  return {
    ok: true,
    valor: {
      nome,
      apelido: apelido === "" ? null : apelido,
      genero: generoBruto === "" ? null : (generoBruto as GeneroJogador),
      categoria: categoria as CategoriaJogador | null,
      cidade: cidade === "" ? null : cidade,
      uf: uf === "" ? null : uf,
      instagram: instagram.valor,
    },
  };
}

// Reexportada de utils/texto (compartilhada com a busca de eventos).
export { chaveTexto };

/**
 * Jogadores existentes com o MESMO nome (ignorando caixa, acentos e espaços
 * extras). `ignorarId` exclui o próprio jogador ao editar. Não é erro: serve
 * para a tela avisar e pedir confirmação antes de criar/renomear.
 */
export function encontrarHomonimos(
  nome: string,
  existentes: readonly Pick<Jogador, "id" | "nome">[],
  ignorarId?: string
): Pick<Jogador, "id" | "nome">[] {
  const chave = chaveTexto(nome);
  if (chave === "") return [];
  return existentes.filter(
    (j) => j.id !== ignorarId && chaveTexto(j.nome) === chave
  );
}

/**
 * Filtra por texto livre: casa com nome, apelido, categoria, cidade ou UF, sem diferenciar
 * caixa nem acentos. Texto vazio devolve todos. Preserva a ordem de entrada.
 */
export function filtrarJogadores(
  jogadores: readonly Jogador[],
  texto: string
): Jogador[] {
  const termo = chaveTexto(texto);
  if (termo === "") return [...jogadores];
  return jogadores.filter((j) =>
    [j.nome, j.apelido ?? "", j.categoria ?? "", j.cidade ?? "", j.uf ?? ""].some((campo) =>
      chaveTexto(campo).includes(termo)
    )
  );
}

/**
 * Ordenação determinística por (nome sem acento/caixa, criadoEm, id). Total e
 * estável; não muta a entrada.
 */
export function compararJogadores(a: Jogador, b: Jogador): number {
  const porNome = chaveTexto(a.nome).localeCompare(chaveTexto(b.nome), "pt-BR");
  if (porNome !== 0) return porNome;
  if (a.criadoEm !== b.criadoEm) return a.criadoEm < b.criadoEm ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

export function ordenarJogadores(jogadores: readonly Jogador[]): Jogador[] {
  return [...jogadores].sort(compararJogadores);
}

/**
 * Participações mais recentes primeiro: por data do evento (desc), depois pela
 * inscrição (desc) e por id, para uma ordem total e estável. Sem data do evento
 * (embutido ausente) vai para o fim. Não muta a entrada.
 */
export function ordenarParticipacoes(
  participacoes: readonly ParticipacaoDupla[]
): ParticipacaoDupla[] {
  return [...participacoes].sort((a, b) => {
    const da = a.campeonato?.data ?? "";
    const db = b.campeonato?.data ?? "";
    if (da !== db) return da < db ? 1 : -1;
    if (a.inscritaEm !== b.inscritaEm) return a.inscritaEm < b.inscritaEm ? 1 : -1;
    if (a.duplaId !== b.duplaId) return a.duplaId < b.duplaId ? -1 : 1;
    return 0;
  });
}

/**
 * Iniciais para o avatar: primeira letra do primeiro e do último nome, em
 * maiúsculas ("João da Silva" -> "JS"; "Maria" -> "M"; "" -> "?").
 */
export function iniciaisDoNome(nome: string): string {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = Array.from(partes[0])[0] ?? "";
  const ultima = partes.length > 1 ? Array.from(partes[partes.length - 1])[0] ?? "" : "";
  return (primeira + ultima).toLocaleUpperCase("pt-BR");
}
