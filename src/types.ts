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
}
