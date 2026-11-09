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
}
