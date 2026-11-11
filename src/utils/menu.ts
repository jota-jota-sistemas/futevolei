// src/utils/menu.ts
//
// Itens do menu do site (cabeçalho e rodapé) numa única definição, para os dois
// não divergirem. Só entram destinos que existem hoje e que não dependem de um
// evento específico: "Acompanhar partidas" e "Organizar" são por evento e são
// alcançados a partir da página do evento. Funções puras.

export interface ItemMenu {
  rotulo: string;
  /** Caminho a partir da raiz do site (o `base` é aplicado por `comBase`). */
  href: string;
  /** Caminhos (e seus subcaminhos) em que o item aparece como ativo. */
  ativoEm: readonly string[];
}

export const ITENS_MENU: readonly ItemMenu[] = [
  // A lista de eventos fica na home; o âncora leva direto até ela.
  { rotulo: "Eventos", href: "/#eventos", ativoEm: ["/", "/campeonatos"] },
  { rotulo: "Jogadores", href: "/jogadores", ativoEm: ["/jogadores"] },
];

/**
 * Normaliza um pathname: remove o `base` do site, garante a barra inicial e
 * tira a barra final (exceto na raiz). Ex. (base "/x/"): "/x/jogadores/" -> "/jogadores".
 */
export function caminhoNormalizado(pathname: string, base = "/"): string {
  let caminho = pathname || "/";
  const prefixo = base.replace(/\/+$/, "");
  if (prefixo && (caminho === prefixo || caminho.startsWith(prefixo + "/"))) {
    caminho = caminho.slice(prefixo.length) || "/";
  }
  if (!caminho.startsWith("/")) caminho = "/" + caminho;
  if (caminho.length > 1) caminho = caminho.replace(/\/+$/, "");
  return caminho || "/";
}

/**
 * O item está ativo no pathname atual? "/" casa só a raiz; os demais casam o
 * próprio caminho ou qualquer subcaminho (nunca um prefixo parcial de palavra:
 * "/jogadoresx" não ativa "/jogadores").
 */
export function itemAtivo(item: ItemMenu, pathname: string, base = "/"): boolean {
  const atual = caminhoNormalizado(pathname, base);
  return item.ativoEm.some((alvo) =>
    alvo === "/" ? atual === "/" : atual === alvo || atual.startsWith(alvo + "/")
  );
}

// ---------------------------------------------------------------------------
// Itens do menu que dependem da conta (login). O HTML estático traz só
// "Entrar"; um script do cabeçalho troca pelos itens do estado real.
// ---------------------------------------------------------------------------

export type EstadoConta = "visitante" | "logado" | "admin";

export interface ItemConta {
  rotulo: string;
  href: string;
  /** Rótulo para telas estreitas (o cabeçalho só alterna a exibição). */
  rotuloCurto?: string;
  /** Some do cabeçalho em telas estreitas (continua acessível em /conta). */
  secundario?: boolean;
}

/** Destinos já resolvidos (com `base`), vindos de quem chama. */
export interface HrefsConta {
  entrar: string;
  conta: string;
  gerenciar: string;
}

/**
 * Itens de conta para o estado dado: visitante vê "Entrar"; logado vê "Minha
 * conta"; administrador vê também o link de gerenciamento. Os itens públicos
 * (ITENS_MENU) não mudam.
 */
export function itensConta(estado: EstadoConta, hrefs: HrefsConta): ItemConta[] {
  if (estado === "visitante") return [{ rotulo: "Entrar", href: hrefs.entrar }];
  const conta: ItemConta = { rotulo: "Minha conta", href: hrefs.conta, rotuloCurto: "Conta" };
  if (estado === "admin") {
    return [{ rotulo: "Gerenciar", href: hrefs.gerenciar, secundario: true }, conta];
  }
  return [conta];
}

/**
 * Há uma sessão do Supabase guardada no navegador? O cliente guarda a sessão em
 * `sb-<projeto>-auth-token`. Serve para NÃO carregar o SDK de login em visitas
 * de quem nunca entrou. Pura: recebe as chaves do storage.
 */
export function temSessaoSalva(chaves: readonly string[]): boolean {
  return chaves.some((c) => /^sb-.+-auth-token$/.test(c));
}
