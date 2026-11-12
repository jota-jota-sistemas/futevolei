import type { Campeonato, Torneio } from "../types";
import { chaveTexto } from "./texto";
import { tituloPtBr } from "./torneios";

/**
 * Casamento entre os eventos do formato antigo (`campeonatos.json`) e os do
 * `torneios.json`. Serve para carregar os eventos no banco mantendo o id antigo
 * nos eventos que existem nas duas fontes (as categorias e os chaveamentos já
 * criados apontam para esse id).
 *
 * Tudo aqui é puro. O resultado vai para `scripts/mapa-ids-eventos.json`, que é
 * revisado por uma pessoa antes de gerar o SQL.
 */

/** Palavras que não ajudam a distinguir um evento de outro. */
const PALAVRAS_VAZIAS = new Set([
  "de", "da", "do", "das", "dos", "e", "a", "o", "no", "na", "em",
  "futevolei", "futvolei", "torneio", "campeonato", "edicao", "etapa",
  "ftv", "copa", "open", "cup",
]);

/** Distância máxima, em dias, entre as datas de um par (datas erradas por 1 dia existem). */
const TOLERANCIA_DIAS = 1;
/** Similaridade mínima de nome para aceitar um par que não tem id idêntico. */
const SIMILARIDADE_MINIMA = 0.5;

/** Cidade de um `local` antigo: "Arena, Cidade, SP" -> "Cidade". */
export function cidadeDoLocalAntigo(local: string): string {
  const partes = (local ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (partes.length > 0 && /^[A-Za-z]{2}$/.test(partes[partes.length - 1])) partes.pop();
  return partes[partes.length - 1] ?? "";
}

/** Palavras significativas de um nome (sem acento, sem números de edição). */
export function palavrasDoNome(nome: string): Set<string> {
  const palavras = chaveTexto(nome)
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(" ")
    .filter(Boolean)
    // "3a", "10o", "1", "2026": números de edição/ano não identificam o evento.
    .filter((p) => !/^\d+[ao]?$/.test(p))
    .filter((p) => !PALAVRAS_VAZIAS.has(p));
  return new Set(palavras);
}

/** Interseção sobre o menor conjunto (0 a 1). Sem palavras de um lado, 0. */
export function similaridadeDeNome(a: string, b: string): number {
  const A = palavrasDoNome(a);
  const B = palavrasDoNome(b);
  const menor = Math.min(A.size, B.size);
  if (menor === 0) return 0;
  let comuns = 0;
  for (const p of A) if (B.has(p)) comuns += 1;
  return comuns / menor;
}

/** Duas cidades são a mesma? ("São Bernardo" e "São Bernardo do Campo" também). */
export function mesmaCidade(a: string, b: string): boolean {
  const x = chaveTexto(a);
  const y = chaveTexto(b);
  if (!x || !y) return false;
  return x === y || x.startsWith(y + " ") || y.startsWith(x + " ");
}

function diasEntre(a: string, b: string): number {
  const ms = Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`));
  return Math.round(ms / 86_400_000);
}

export interface ParEvento {
  /** id no `campeonatos.json` (será o id no banco) */
  idAntigo: string;
  /** id gerado pelo coletor, no `torneios.json` (vai para `id_origem`) */
  idColetor: string;
  nomeAntigo: string;
  nomeColetor: string;
  dataAntiga: string;
  dataColetor: string;
  /** "id": ids idênticos; "nome": cidade, data e nome parecidos */
  motivo: "id" | "nome";
  similaridade: number;
}

export interface ResultadoCasamento {
  pares: ParEvento[];
  /** só no `torneios.json` */
  soTorneios: Torneio[];
  /** só no `campeonatos.json` */
  soCampeonatos: Campeonato[];
}

interface Candidato {
  antigo: Campeonato;
  torneio: Torneio;
  motivo: "id" | "nome";
  dias: number;
  similaridade: number;
}

/**
 * Casa os eventos um para um. Primeiro os de id idêntico; depois, por cidade,
 * data (até 1 dia de diferença) e similaridade de nome, do melhor para o pior.
 * Determinístico: empates se resolvem pelo id.
 */
export function casarEventos(antigos: Campeonato[], torneios: Torneio[]): ResultadoCasamento {
  const candidatos: Candidato[] = [];
  for (const antigo of antigos) {
    for (const torneio of torneios) {
      if (antigo.id === torneio.id) {
        candidatos.push({ antigo, torneio, motivo: "id", dias: 0, similaridade: 1 });
        continue;
      }
      const dias = diasEntre(antigo.data, torneio.data);
      if (dias > TOLERANCIA_DIAS) continue;
      if (!mesmaCidade(cidadeDoLocalAntigo(antigo.local), tituloPtBr(torneio.cidade))) continue;
      const similaridade = similaridadeDeNome(antigo.nome, torneio.nome);
      if (similaridade < SIMILARIDADE_MINIMA) continue;
      candidatos.push({ antigo, torneio, motivo: "nome", dias, similaridade });
    }
  }

  candidatos.sort(
    (x, y) =>
      Number(y.motivo === "id") - Number(x.motivo === "id") ||
      x.dias - y.dias ||
      y.similaridade - x.similaridade ||
      x.antigo.id.localeCompare(y.antigo.id) ||
      x.torneio.id.localeCompare(y.torneio.id)
  );

  const antigosUsados = new Set<string>();
  const torneiosUsados = new Set<string>();
  const pares: ParEvento[] = [];
  for (const c of candidatos) {
    if (antigosUsados.has(c.antigo.id) || torneiosUsados.has(c.torneio.id)) continue;
    antigosUsados.add(c.antigo.id);
    torneiosUsados.add(c.torneio.id);
    pares.push({
      idAntigo: c.antigo.id,
      idColetor: c.torneio.id,
      nomeAntigo: c.antigo.nome,
      nomeColetor: c.torneio.nome,
      dataAntiga: c.antigo.data,
      dataColetor: c.torneio.data,
      motivo: c.motivo,
      similaridade: Number(c.similaridade.toFixed(2)),
    });
  }
  pares.sort((a, b) => a.idAntigo.localeCompare(b.idAntigo));

  return {
    pares,
    soTorneios: torneios.filter((t) => !torneiosUsados.has(t.id)),
    soCampeonatos: antigos.filter((a) => !antigosUsados.has(a.id)),
  };
}
