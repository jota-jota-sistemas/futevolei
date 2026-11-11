// src/components/bracket/renderBracketClient.ts
//
// Renderização CLIENT-SIDE do chaveamento de UMA categoria.
//
// ## Por que este módulo existe
//
// O site é Astro `output: "static"` (ver astro.config.mjs). A página pública
// `campeonatos/[id].astro` é pré-renderada em build a partir de
// `src/data/campeonatos.json`. Os dados do chaveamento, porém, vivem no
// Supabase e NÃO estão disponíveis em build — eles precisam ser lidos no
// NAVEGADOR, em tempo de execução, via `Bracket_Store` (leitura, RLS).
//
// Os componentes `BracketView.astro`/`GroupTable.astro`/`EliminationTree.astro`/
// `MatchCard.astro` são renderizados em BUILD (Astro) e não dá para instanciá-
// los dinamicamente no browser. Então, seguindo a opção (a) da tarefa 17.1,
// este módulo é um helper TS PURO que recebe um `Bracket` + `duplasPorId` e
// monta o DOM EQUIVALENTE, reaproveitando as MESMAS regras e semântica
// (estados de slot, pendente/bye/a definir, grupos, upper/lower/grande final,
// destaque da campeã) e as MESMAS classes CSS daqueles componentes — o CSS
// correspondente é injetado uma vez na página pública (`[id].astro`).
//
// A classificação de grupo usa `classificarGrupo` de
// `../../domain/bracket/standings` — funções puras e determinísticas, idênticas
// às usadas por `GroupTable.astro`, garantindo a mesma saída em build e no
// cliente.
//
// Este módulo é PURO em relação a I/O: não busca nada da rede nem lê o relógio.
// Apenas transforma um `Bracket` já carregado em nós do DOM.

import type {
  Bracket,
  BracketSide,
  Match,
  Pair,
  Participant,
} from "../../domain/bracket/types";
import { classificarGrupo } from "../../domain/bracket/standings";
import {
  chaveSlot,
  origemDosSlots,
  rotuloOrigem,
  type OrigemSlot,
} from "../../domain/bracket/origem";

/** Mapa pairId -> Pair. */
type DuplasPorId = Record<string, Pair>;

/**
 * Opções de interação da renderização. São OPCIONAIS: a página pública chama
 * `renderBracketClient` sem elas (visualização inerte, somente leitura — R9.2),
 * enquanto a página de organização passa `aoSalvarPlacar` para habilitar os
 * campos de placar em cada jogo.
 *
 * IMPORTANTE (fronteira R9.1/R9.2): este módulo permanece PURO em relação a I/O.
 * Ele apenas chama o callback recebido ao confirmar o placar; não conhece store,
 * Supabase nem qualquer operação de escrita. Quem valida e persiste é a página
 * de organização, dona do callback.
 */
export interface RenderOpcoes {
  /**
   * Quando fornecido, cada jogo PRONTO (ambas as duplas definidas, sem bye)
   * ganha dois campos de placar e um botão de salvar. Ao salvar, chama este
   * callback com o id do jogo e os placares digitados (`NaN` se o campo estiver
   * vazio). A validação (inteiro ≥ 0, sem empate) é do domínio.
   */
  aoSalvarPlacar?: (matchId: string, placarA: number, placarB: number) => void;
}

/**
 * Comparador de jogos pela ORDEM DE DISPUTA (número do jogo). Jogos numerados
 * vêm primeiro, em ordem crescente do número; jogos ainda sem número (null)
 * vão ao fim, mantendo uma ordem estável por (rodada, ordem, id).
 */
function compararPorOrdemDisputa(a: Match, b: Match): number {
  const na = a.ordemDisputa;
  const nb = b.ordemDisputa;
  if (na !== null && nb !== null) return na - nb;
  if (na !== null) return -1; // numerado antes de não-numerado
  if (nb !== null) return 1;
  if (a.rodada !== b.rodada) return a.rodada - b.rodada;
  if (a.ordem !== b.ordem) return a.ordem - b.ordem;
  return a.id.localeCompare(b.id);
}

// ---------------------------------------------------------------------------
// Utilitários de DOM
// ---------------------------------------------------------------------------

/**
 * Cria um elemento com classes, atributos e filhos. Espelha o uso declarativo
 * dos templates `.astro`, mas em DOM nativo. Textos são inseridos via
 * `textContent`/`createTextNode`, de modo que nomes de duplas vindos do banco
 * NUNCA são interpretados como HTML (sem risco de injeção).
 */
function el(
  tag: string,
  opcoes: {
    classes?: Array<string | false | null | undefined>;
    attrs?: Record<string, string>;
    texto?: string;
    filhos?: Node[];
  } = {},
): HTMLElement {
  const node = document.createElement(tag);
  const classes = (opcoes.classes ?? []).filter(
    (c): c is string => typeof c === "string" && c.length > 0,
  );
  if (classes.length > 0) node.className = classes.join(" ");
  if (opcoes.attrs) {
    for (const [k, v] of Object.entries(opcoes.attrs)) node.setAttribute(k, v);
  }
  if (opcoes.texto !== undefined) node.textContent = opcoes.texto;
  if (opcoes.filhos) {
    for (const filho of opcoes.filhos) node.appendChild(filho);
  }
  return node;
}

// ---------------------------------------------------------------------------
// MatchCard (equivalente a MatchCard.astro)
// ---------------------------------------------------------------------------

type SlotEstado = "bye" | "indefinido" | "definido";

interface SlotInfo {
  estado: SlotEstado;
  rotulo: string;
  pairId: string | null;
  vencedora: boolean;
}

function resolverSlot(
  p: Participant,
  match: Match,
  duplasPorId: DuplasPorId,
  origem?: OrigemSlot,
): SlotInfo {
  if (p.bye) {
    return { estado: "bye", rotulo: "BYE", pairId: null, vencedora: false };
  }
  if (p.pairId === null) {
    return {
      estado: "indefinido",
      // Vaga alimentada por outro jogo: diz de qual ("Vencedor do jogo 4").
      rotulo: origem ? rotuloOrigem(origem) : "A definir",
      pairId: null,
      vencedora: false,
    };
  }
  const dupla = duplasPorId[p.pairId];
  return {
    estado: "definido",
    // Fallback defensivo: se a dupla não estiver no mapa, mostra o id em vez de
    // quebrar a renderização. Não inventa dados.
    rotulo: dupla ? dupla.nomeDupla : p.pairId,
    pairId: p.pairId,
    vencedora: match.vencedorId !== null && match.vencedorId === p.pairId,
  };
}

function renderMatchCard(
  match: Match,
  duplasPorId: DuplasPorId,
  opcoes?: RenderOpcoes,
  origens?: Map<string, OrigemSlot>,
): HTMLElement {
  const slotA = resolverSlot(match.a, match, duplasPorId, origens?.get(chaveSlot(match.id, "a")));
  const slotB = resolverSlot(match.b, match, duplasPorId, origens?.get(chaveSlot(match.id, "b")));

  const ambasDefinidas = slotA.pairId !== null && slotB.pairId !== null;
  const temVencedor = match.vencedorId !== null;
  const pendente = !temVencedor && ambasDefinidas;

  // Editável apenas quando há callback E ambas as duplas estão definidas (jogo
  // pronto). Vale também para jogos já decididos: editar o placar corrige o
  // resultado (a cascata é tratada pela progressão).
  const editavel =
    typeof opcoes?.aoSalvarPlacar === "function" && ambasDefinidas;

  const ariaConfronto = (() => {
    const base = `Confronto: ${slotA.rotulo} contra ${slotB.rotulo}`;
    if (temVencedor) {
      const vencedora = slotA.vencedora ? slotA.rotulo : slotB.rotulo;
      const placar =
        match.placarA !== null && match.placarB !== null
          ? ` (${match.placarA} a ${match.placarB})`
          : "";
      return `${base}. Vencedora: ${vencedora}${placar}`;
    }
    if (pendente) return `${base}. Resultado pendente`;
    return base;
  })();

  const inputs: { a?: HTMLInputElement; b?: HTMLInputElement } = {};

  const salvar = (): void => {
    const ler = (input?: HTMLInputElement): number => {
      const bruto = (input?.value ?? "").trim();
      return bruto === "" ? Number.NaN : Number(bruto);
    };
    opcoes!.aoSalvarPlacar!(match.id, ler(inputs.a), ler(inputs.b));
  };

  const slotLi = (slot: SlotInfo, lado: "a" | "b"): HTMLElement => {
    const filhos: Node[] = [
      el("span", { classes: ["match-card__dupla"], texto: slot.rotulo }),
    ];
    if (slot.vencedora) {
      filhos.push(
        el("span", {
          classes: ["match-card__marca"],
          attrs: { "aria-label": "vencedora", title: "vencedora" },
          texto: "✓",
        }),
      );
    }

    const placar = lado === "a" ? match.placarA : match.placarB;
    if (editavel && slot.estado === "definido") {
      // Campo de placar (só na organização).
      const input = el("input", {
        classes: ["match-card__placar-input"],
        attrs: {
          type: "number",
          min: "0",
          step: "1",
          inputmode: "numeric",
          "aria-label": `Placar de ${slot.rotulo}`,
          ...(placar !== null ? { value: String(placar) } : {}),
        },
      }) as HTMLInputElement;
      input.addEventListener("keydown", (e) => {
        if ((e as KeyboardEvent).key === "Enter") salvar();
      });
      inputs[lado] = input;
      filhos.push(input);
    } else if (placar !== null) {
      // Placar somente leitura (visualização pública).
      filhos.push(
        el("span", {
          classes: ["match-card__placar"],
          attrs: { "aria-label": `Placar: ${placar}` },
          texto: String(placar),
        }),
      );
    }

    return el("li", {
      classes: [
        "match-card__slot",
        `match-card__slot--${slot.estado}`,
        slot.vencedora && "match-card__slot--vencedora",
      ],
      filhos,
    });
  };

  const filhos: Node[] = [];

  // Número do jogo (ordem de disputa), quando já atribuído. Fica no topo do
  // card, como "Jogo N", para facilitar a chamada dos participantes.
  if (match.ordemDisputa !== null) {
    filhos.push(
      el("p", {
        classes: ["match-card__numero"],
        texto: `Jogo ${match.ordemDisputa}`,
      }),
    );
  }

  filhos.push(
    el("ul", {
      classes: ["match-card__slots"],
      filhos: [slotLi(slotA, "a"), slotLi(slotB, "b")],
    }),
  );

  if (editavel) {
    const botao = el("button", {
      classes: ["match-card__salvar"],
      attrs: { type: "button" },
      texto: temVencedor ? "Atualizar placar" : "Salvar placar",
    });
    botao.addEventListener("click", salvar);
    filhos.push(botao);
  }

  if (pendente) {
    filhos.push(
      el("p", {
        classes: ["match-card__estado", "match-card__estado--pendente"],
        texto: "Pendente",
      }),
    );
  }

  const ariaCompleta =
    match.ordemDisputa !== null
      ? `Jogo ${match.ordemDisputa}. ${ariaConfronto}`
      : ariaConfronto;

  return el("div", {
    classes: ["match-card"],
    attrs: { role: "group", "aria-label": ariaCompleta },
    filhos,
  });
}

// ---------------------------------------------------------------------------
// GroupTable (equivalente a GroupTable.astro)
// ---------------------------------------------------------------------------

function renderGroupTable(
  grupo: Bracket["grupos"][number],
  matches: Match[],
  duplasPorId: DuplasPorId,
  opcoes?: RenderOpcoes,
): HTMLElement {
  const nomeDupla = (pairId: string): string =>
    duplasPorId[pairId]?.nomeDupla ?? pairId;

  const porId = new Map<string, Match>();
  for (const m of matches) porId.set(m.id, m);
  const jogosDoGrupo: Match[] = [];
  for (const matchId of grupo.jogos) {
    const jogo = porId.get(matchId);
    if (jogo) jogosDoGrupo.push(jogo);
  }

  // Classificação PARCIAL: calculada com as partidas já decididas (R5.3).
  const classificacao = classificarGrupo(grupo, jogosDoGrupo);
  const grupoCompleto = jogosDoGrupo.every((j) => j.vencedorId !== null);
  const algumJogo = classificacao.some((s) => s.jogos > 0);

  interface Linha {
    pairId: string;
    nome: string;
    posicao: number | null;
    jogos: number;
    vitorias: number;
    pontos: number;
    saldo: number;
  }

  const porPair = new Map(classificacao.map((s) => [s.pairId, s]));
  // Antes do 1º jogo ninguém tem posição: mantém a ordem original do grupo e
  // mostra "—" no lugar do ranking.
  const ordemExibicao = algumJogo
    ? classificacao.map((s) => s.pairId)
    : [...grupo.duplas];

  const linhas: Linha[] = ordemExibicao.map((pairId) => {
    const st = porPair.get(pairId)!;
    return {
      pairId,
      nome: nomeDupla(pairId),
      posicao: algumJogo ? st.posicao : null,
      jogos: st.jogos,
      vitorias: st.vitorias,
      pontos: st.pontos,
      saldo: st.saldo,
    };
  });

  const formatarSaldo = (n: number): string => (n > 0 ? `+${n}` : String(n));

  const tituloGrupo = `Grupo ${grupo.indice + 1}`;

  // <caption>
  const caption = el("caption", { classes: ["group-table__caption"] });
  caption.appendChild(document.createTextNode(`Classificação do ${tituloGrupo}`));
  if (!grupoCompleto) {
    caption.appendChild(
      el("span", {
        classes: ["group-table__pendente"],
        texto: " — parcial",
      }),
    );
  }

  const cabecalho = (classe: string, texto: string, titulo?: string) =>
    el("th", {
      classes: [classe],
      attrs: { scope: "col", ...(titulo ? { title: titulo } : {}) },
      texto,
    });

  // <thead>
  const thead = el("thead", {
    filhos: [
      el("tr", {
        filhos: [
          cabecalho("group-table__col-pos", "#"),
          cabecalho("group-table__col-dupla", "Dupla"),
          cabecalho("group-table__col-num", "Pts", "Pontos (3 por vitória)"),
          cabecalho("group-table__col-num", "V", "Vitórias"),
          cabecalho("group-table__col-num", "Saldo", "Saldo de pontos"),
        ],
      }),
    ],
  });

  // <tbody>
  const tbody = el("tbody", {
    filhos: linhas.map((linha) =>
      el("tr", {
        classes: [
          "group-table__linha",
          linha.posicao === 1 && linha.jogos > 0 && "group-table__linha--lider",
        ],
        filhos: [
          el("td", {
            classes: ["group-table__col-pos"],
            texto: linha.posicao !== null ? String(linha.posicao) : "—",
          }),
          el("td", { classes: ["group-table__col-dupla"], texto: linha.nome }),
          el("td", { classes: ["group-table__col-num"], texto: String(linha.pontos) }),
          el("td", { classes: ["group-table__col-num"], texto: String(linha.vitorias) }),
          el("td", { classes: ["group-table__col-num"], texto: formatarSaldo(linha.saldo) }),
        ],
      }),
    ),
  });

  const tabela = el("table", {
    classes: ["group-table__tabela"],
    filhos: [caption, thead, tbody],
  });

  const filhos: Node[] = [
    el("h4", { classes: ["group-table__titulo"], texto: tituloGrupo }),
    tabela,
  ];

  if (jogosDoGrupo.length > 0) {
    filhos.push(
      el("div", {
        classes: ["group-table__jogos"],
        filhos: [
          el("h5", { classes: ["group-table__subtitulo"], texto: "Jogos" }),
          el("ul", {
            classes: ["group-table__lista"],
            filhos: [...jogosDoGrupo]
              .sort(compararPorOrdemDisputa)
              .map((match) =>
              el("li", {
                classes: ["group-table__item"],
                filhos: [renderMatchCard(match, duplasPorId, opcoes)],
              }),
            ),
          }),
        ],
      }),
    );
  }

  return el("section", {
    classes: ["group-table"],
    attrs: { "aria-label": `Classificação e jogos do ${tituloGrupo}` },
    filhos,
  });
}

// ---------------------------------------------------------------------------
// EliminationTree (equivalente a EliminationTree.astro)
// ---------------------------------------------------------------------------

interface Rodada {
  numero: number;
  jogos: Match[];
}

function rodadasDoSide(matches: Match[], side: BracketSide): Rodada[] {
  const porRodada = new Map<number, Match[]>();
  for (const m of matches) {
    if (m.side !== side) continue;
    const lista = porRodada.get(m.rodada) ?? [];
    lista.push(m);
    porRodada.set(m.rodada, lista);
  }
  return [...porRodada.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([numero, jogos]) => ({
      numero,
      jogos: [...jogos].sort(compararPorOrdemDisputa),
    }));
}

function rotuloRodada(side: BracketSide, numero: number): string {
  return side === "grande-final" ? "Jogo decisivo" : `Rodada ${numero}`;
}

function renderEliminationTree(
  matches: Match[],
  duplasPorId: DuplasPorId,
  opcoes?: RenderOpcoes,
): HTMLElement {
  const origens = origemDosSlots(matches);
  const secoes: Array<{
    side: BracketSide;
    titulo: string;
    rodadas: Rodada[];
  }> = (
    [
      { side: "upper", titulo: "Chave de vencedores" },
      { side: "lower", titulo: "Chave de perdedores" },
      { side: "grande-final", titulo: "Grande final" },
    ] as const
  )
    .map((s) => ({
      side: s.side as BracketSide,
      titulo: s.titulo,
      rodadas: rodadasDoSide(matches, s.side as BracketSide),
    }))
    .filter((s) => s.rodadas.length > 0);

  // Eliminação simples: há apenas jogos de side "upper" (chave única, sem
  // chave de perdedores nem grande final). Nesse caso, rotulamos a seção como
  // "Mata-mata" em vez de "Chave de vencedores", que só faz sentido quando
  // existe a contraparte de perdedores (dupla eliminação).
  const chaveUnica =
    secoes.length === 1 && secoes[0]?.side === "upper";
  if (chaveUnica) {
    secoes[0].titulo = "Mata-mata";
  }

  return el("div", {
    classes: ["elim-tree"],
    filhos: secoes.map((secao) =>
      el("section", {
        classes: ["elim-tree__secao"],
        attrs: { "aria-label": secao.titulo },
        filhos: [
          el("h4", { classes: ["elim-tree__titulo"], texto: secao.titulo }),
          el("div", {
            classes: ["elim-tree__rodadas"],
            filhos: secao.rodadas.map((rodada) =>
              el("div", {
                classes: ["elim-tree__rodada"],
                attrs: { "aria-label": rotuloRodada(secao.side, rodada.numero) },
                filhos: [
                  el("h5", {
                    classes: ["elim-tree__rodada-titulo"],
                    texto: rotuloRodada(secao.side, rodada.numero),
                  }),
                  el("ul", {
                    classes: ["elim-tree__lista"],
                    filhos: rodada.jogos.map((match) =>
                      el("li", {
                        classes: ["elim-tree__item"],
                        filhos: [renderMatchCard(match, duplasPorId, opcoes, origens)],
                      }),
                    ),
                  }),
                ],
              }),
            ),
          }),
        ],
      }),
    ),
  });
}

// ---------------------------------------------------------------------------
// BracketView (equivalente a BracketView.astro)
// ---------------------------------------------------------------------------

/**
 * Monta o DOM do chaveamento de UMA categoria, escolhendo o layout pelo SEU
 * próprio formato (R8.1, R8.2, R8.3) — grupos + mata-mata para "fase de
 * grupos", ou só o mata-mata para "dupla eliminação". Destaca a campeã quando
 * definida (R8.6).
 *
 * Retorna um único elemento pronto para substituir o placeholder da categoria.
 */
export function renderBracketClient(
  bracket: Bracket,
  opcoes?: RenderOpcoes,
): HTMLElement {
  const duplasPorId: DuplasPorId = Object.fromEntries(
    bracket.duplas.map((d) => [d.id, d]),
  );

  const ehFaseDeGrupos = bracket.formato === "fase de grupos";

  const sidesMataMata = new Set<BracketSide>([
    "upper",
    "lower",
    "grande-final",
  ]);
  const matchesMataMata = bracket.matches.filter((m) =>
    sidesMataMata.has(m.side),
  );
  const temMataMata = matchesMataMata.length > 0;

  const temCampea = bracket.campeaId !== null;
  const nomeCampea = temCampea
    ? duplasPorId[bracket.campeaId!]?.nomeDupla ?? bracket.campeaId!
    : "";

  const filhos: Node[] = [];

  if (temCampea) {
    filhos.push(
      el("div", {
        classes: ["bracket-view__campea"],
        attrs: { role: "status" },
        filhos: [
          el("span", {
            classes: ["bracket-view__campea-rotulo"],
            texto: "Campeã",
          }),
          el("span", {
            classes: ["bracket-view__campea-nome"],
            texto: nomeCampea,
          }),
        ],
      }),
    );
  }

  if (ehFaseDeGrupos) {
    const conteudoFilhos: Node[] = [
      el("section", {
        classes: ["bracket-view__fase"],
        attrs: { "aria-label": "Fase de grupos" },
        filhos: [
          el("h3", {
            classes: ["bracket-view__fase-titulo"],
            texto: "Fase de grupos",
          }),
          el("div", {
            classes: ["bracket-view__grupos"],
            filhos: bracket.grupos.map((grupo) =>
              renderGroupTable(grupo, bracket.matches, duplasPorId, opcoes),
            ),
          }),
        ],
      }),
    ];

    if (temMataMata) {
      conteudoFilhos.push(
        el("section", {
          classes: ["bracket-view__fase"],
          attrs: { "aria-label": "Mata-mata" },
          filhos: [
            el("h3", {
              classes: ["bracket-view__fase-titulo"],
              texto: "Mata-mata",
            }),
            renderEliminationTree(matchesMataMata, duplasPorId, opcoes),
          ],
        }),
      );
    }

    filhos.push(
      el("div", { classes: ["bracket-view__conteudo"], filhos: conteudoFilhos }),
    );
  } else {
    filhos.push(
      el("div", {
        classes: ["bracket-view__conteudo"],
        filhos: [
          el("section", {
            classes: ["bracket-view__fase"],
            attrs: { "aria-label": "Mata-mata" },
            filhos: [renderEliminationTree(matchesMataMata, duplasPorId, opcoes)],
          }),
        ],
      }),
    );
  }

  return el("div", { classes: ["bracket-view"], filhos });
}
