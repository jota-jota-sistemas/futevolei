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
}
