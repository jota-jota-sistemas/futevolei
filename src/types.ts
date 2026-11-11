export interface Campeonato {
  /** identificador único, usado em URLs futuras (ex.: página de detalhe) */
  id: string;
  /** nome do campeonato exibido no card */
  nome: string;
  /** data no formato ISO (YYYY-MM-DD) */
  data: string;
  /** local: praia, cidade */
  local: string;
  /** caminho da foto, relativo à pasta public/ */
  foto: string;
  /** descrição curta exibida no card */
  descricao: string;
  /**
   * Instagram do evento (opcional). Aceita o @usuario, o usuario sem @,
   * ou a URL completa (https://instagram.com/usuario). Se ausente, o
   * botão do Instagram não é exibido no card.
   */
  instagram?: string;
  /**
   * Categorias do evento (opcional), ex.: "Open", "Amador B+C", "Feminino".
   * Puramente visuais no card (chips estáticos). Quando ausente, o bloco de
   * tags não é renderizado — nenhum dado é inventado a partir da descrição.
   */
  categorias?: string[];
  /**
   * Link de inscrição do evento (opcional). URL completa (http/https) da
   * página onde a pessoa se inscreve. Quando presente e válida, a página de
   * detalhe exibe um botão "Inscreva-se"; quando ausente ou inválida, o botão
   * não aparece. Campo estruturado — não extrair de dentro da descrição.
   */
  inscricao?: string;
  /**
   * Data final (ISO YYYY-MM-DD) de eventos de mais de um dia (opcional).
   * Quando ausente ou igual a `data`, o evento é de um dia só. A filtragem por
   * período continua usando apenas `data` (início).
   */
  dataFim?: string;
  /**
   * Preço como texto exibível (opcional), ex.: "R$ 160,00" ou "Valor a
   * confirmar". Exibido no detalhe quando presente.
   */
  precoTexto?: string;
}

/**
 * Registro bruto de `src/data/torneios.json`, gerado por
 * `npm run coletar:torneios` (scripts/coletar-torneios.mjs) a partir do
 * calendário público torneios-ftv.com. É convertido em `Campeonato` por
 * `src/utils/torneios.ts` — o restante do site só conhece `Campeonato`.
 */
export interface Torneio {
  id: string;
  nome: string;
  /** data inicial ISO (YYYY-MM-DD) */
  data: string;
  /** data final ISO (YYYY-MM-DD); igual a `data` em eventos de um dia */
  dataFim: string;
  cidade: string;
  uf: string;
  /** arena/endereço; pode ser vazio */
  endereco: string;
  /** valor numérico quando o site informa; null caso contrário */
  preco: number | null;
  precoTexto: string;
  /** texto livre, como veio do site (sem padronização de caixa) */
  categorias: string[];
  /** link do post de origem no Instagram (pode vir com ?img_index=N) ou "" */
  instagram: string;
  /**
   * Caminho da foto, relativo a public/ (opcional). O coletor não preenche;
   * existe para eventos cadastrados manualmente (`fonte: "manual"`).
   */
  foto?: string;
  /** Descrição textual (opcional). Também só em eventos manuais. */
  descricao?: string;
  /**
   * De onde veio o registro: a URL do calendário coletado, ou "manual" para
   * eventos cadastrados à mão (preservados pelo coletor ao regravar o arquivo).
   */
  fonte: string;
}
