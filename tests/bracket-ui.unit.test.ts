// @vitest-environment jsdom
//
// Feature: criar-chaveamento-campeonato — Requirement 8 (Visualizar o chaveamento)
//
// Tarefas 16.4 e 17.2: testes de UI da visualização pública do chaveamento.
//
// Os componentes de visualização (BracketView/GroupTable/EliminationTree/
// MatchCard) são `.astro`, renderizados em BUILD, e não dá para instanciá-los
// dinamicamente num unit test. O alvo destes testes é
// `src/components/bracket/renderBracketClient.ts` — módulo TS PURO que monta o
// MESMO DOM daqueles componentes (mesmas classes CSS, mesma semântica) a partir
// de um `Bracket`. Assinatura exercitada:
//
//     renderBracketClient(bracket: Bracket): HTMLElement
//
// Como `renderBracketClient` usa `document.createElement`, roda sob o ambiente
// jsdom (declarado no comentário de ambiente no topo deste arquivo; `jsdom` foi
// adicionado como devDependency). Os asserts inspecionam o DOM resultante via
// querySelector/textContent.
//
// Cobertura:
//   16.4 — fase de grupos (R8.1, R8.2): seções .group-table e, com mata-mata,
//          as seções de chave .elim-tree.
//   16.4 — dupla eliminação (R8.3): seções .elim-tree e .match-card.
//   16.4 — jogo pendente (R8.5): confronto sem vencedor com ambas as duplas
//          definidas mostra o marcador .match-card__estado--pendente.
//   16.4 — campeã (R8.6): banner .bracket-view__campea com nome e rótulo.
//   17.2 — formatos distintos lado a lado: cada categoria produz o layout do
//          seu próprio formato, de forma independente.
//   17.2 — estado sem chaveamento (R8.4) e isolamento de falha (R8.7): o
//          placeholder textual e o try/catch por categoria vivem no SCRIPT da
//          página pública (`campeonatos/[id]/acompanhar.astro`), NÃO em renderBracketClient
//          (que só é chamado quando há bracket). Aqui verificamos, de forma
//          pragmática, que renderBracketClient renderiza um bracket válido e
//          que cada formato é independente do outro. Ver nota no describe 17.2.

import { describe, it, expect } from "vitest";
import { renderBracketClient } from "../src/components/bracket/renderBracketClient";
import { gerarChaveamento } from "../src/domain/bracket/generator";
import { registrarVencedor } from "../src/domain/bracket/progression";
import type {
  Bracket,
  BracketConfig,
  Pair,
} from "../src/domain/bracket/types";

// ---------------------------------------------------------------------------
// Helpers de construção de dados (puros e determinísticos)
// ---------------------------------------------------------------------------

/** Dupla válida derivada de um seed consecutivo (ids/nomes únicos, seed=posição). */
function duplaComSeed(seed: number): Pair {
  return {
    id: `dupla-${seed}`,
    nomeDupla: `Dupla ${seed}`,
    atletaA: `Atleta A${seed}`,
    atletaB: `Atleta B${seed}`,
    seed,
    criadoEm: `2026-01-01T00:00:${String(seed % 60).padStart(2, "0")}.000Z`,
  };
}

/** Lista de N duplas com seeds consecutivos 1..N. */
function duplas(n: number): Pair[] {
  return Array.from({ length: n }, (_, i) => duplaComSeed(i + 1));
}

/** Gera um bracket, falhando o teste se a geração não suceder. */
function gerar(ds: Pair[], config: BracketConfig): Bracket {
  const r = gerarChaveamento({ duplas: ds, config });
  if (!r.ok) {
    throw new Error(`Falha inesperada ao gerar chaveamento: ${r.erro.code}`);
  }
  return r.bracket;
}

const CONFIG_DUPLA_ELIMINACAO: BracketConfig = { formato: "dupla eliminação" };

/** Config de fase de grupos com 2 grupos de 3 e 1 classificado por grupo. */
const CONFIG_FASE_DE_GRUPOS: BracketConfig = {
  formato: "fase de grupos",
  numeroDeGrupos: 2,
  classificadosPorGrupo: 1,
};

// ---------------------------------------------------------------------------
// 16.4 — Renderização de "fase de grupos" (R8.1, R8.2)
// ---------------------------------------------------------------------------

describe("Feature: criar-chaveamento-campeonato, R8.1/R8.2: renderização de fase de grupos", () => {
  it("renderiza as seções de grupo (.group-table) para cada grupo (R8.1)", () => {
    // 6 duplas, 2 grupos de 3 → duas tabelas de grupo.
    const bracket = gerar(duplas(6), CONFIG_FASE_DE_GRUPOS);
    const raiz = renderBracketClient(bracket);

    // A raiz é o container do BracketView.
    expect(raiz.classList.contains("bracket-view")).toBe(true);

    const tabelas = raiz.querySelectorAll(".group-table");
    expect(tabelas.length).toBe(bracket.grupos.length);
    expect(tabelas.length).toBe(2);

    // A fase de grupos tem um título textual visível.
    const titulos = Array.from(
      raiz.querySelectorAll(".bracket-view__fase-titulo"),
    ).map((n) => n.textContent);
    expect(titulos).toContain("Fase de grupos");

    // Cada tabela de grupo lista suas duplas (há linhas de corpo).
    const linhas = raiz.querySelectorAll(".group-table__linha");
    expect(linhas.length).toBe(6); // 3 + 3 duplas
  });

  it("quando há mata-mata pós-grupos, também renderiza as seções de chave (.elim-tree) (R8.2)", () => {
    // Nota de domínio: `gerarChaveamento` para "fase de grupos" produz APENAS os
    // jogos de grupo (round-robin). O mata-mata pós-grupos é montado só depois,
    // quando as classificações dos grupos são resolvidas (Group_Standings +
    // posicionarClassificadosNoMataMata) — fora do gerador. Para exercitar o
    // layout MISTO de `renderBracketClient` (grupos + mata-mata, R8.2), compomos
    // um bracket "fase de grupos" que JÁ carrega jogos de mata-mata: reusamos os
    // jogos de eliminação de um bracket de dupla eliminação sobre as MESMAS
    // duplas. Isso reproduz fielmente o estado que a página renderiza quando a
    // categoria de grupos já avançou ao mata-mata.
    const grupos = gerar(duplas(6), CONFIG_FASE_DE_GRUPOS);
    const elim = gerar(duplas(6), CONFIG_DUPLA_ELIMINACAO);

    const bracket: Bracket = {
      ...grupos,
      matches: [
        ...grupos.matches,
        ...elim.matches.filter((m) => m.side !== "grupo"),
      ],
    };

    // Precondição do caso: o bracket tem jogos de grupo E de mata-mata.
    expect(bracket.matches.some((m) => m.side === "grupo")).toBe(true);
    expect(bracket.matches.some((m) => m.side !== "grupo")).toBe(true);

    const raiz = renderBracketClient(bracket);

    // Layout de grupos presente E árvore de eliminação presente.
    expect(raiz.querySelectorAll(".group-table").length).toBeGreaterThan(0);
    expect(raiz.querySelector(".elim-tree")).not.toBeNull();

    // O título "Mata-mata" aparece ao lado de "Fase de grupos".
    const titulos = Array.from(
      raiz.querySelectorAll(".bracket-view__fase-titulo"),
    ).map((n) => n.textContent);
    expect(titulos).toContain("Fase de grupos");
    expect(titulos).toContain("Mata-mata");
  });
});

// ---------------------------------------------------------------------------
// 16.4 — Renderização de "dupla eliminação" (R8.3)
// ---------------------------------------------------------------------------

describe("Feature: criar-chaveamento-campeonato, R8.3: renderização de dupla eliminação", () => {
  it("renderiza as seções de chave (.elim-tree) e os MatchCards (.match-card), sem tabelas de grupo (R8.3)", () => {
    const bracket = gerar(duplas(8), CONFIG_DUPLA_ELIMINACAO);
    const raiz = renderBracketClient(bracket);

    expect(raiz.classList.contains("bracket-view")).toBe(true);

    // Dupla eliminação NÃO tem fase de grupos.
    expect(raiz.querySelectorAll(".group-table").length).toBe(0);

    // Tem a árvore de eliminação e seus confrontos.
    expect(raiz.querySelector(".elim-tree")).not.toBeNull();
    expect(raiz.querySelectorAll(".match-card").length).toBeGreaterThan(0);

    // As três chaves aparecem como seções rotuladas.
    const rotulos = Array.from(raiz.querySelectorAll(".elim-tree__secao")).map(
      (s) => s.getAttribute("aria-label"),
    );
    expect(rotulos).toContain("Chave de vencedores");
    expect(rotulos).toContain("Chave de perdedores");
    expect(rotulos).toContain("Grande final");
  });
});

// ---------------------------------------------------------------------------
// 16.4 — Jogo pendente (R8.5)
// ---------------------------------------------------------------------------

describe("Feature: criar-chaveamento-campeonato, R8.5: jogo pendente", () => {
  it("um confronto sem vencedor com ambas as duplas definidas mostra o marcador 'Pendente'", () => {
    // Num bracket de fase de grupos recém-gerado, os jogos de grupo (round-robin)
    // têm ambas as duplas definidas e nenhum vencedor registrado → pendentes.
    const bracket = gerar(duplas(6), CONFIG_FASE_DE_GRUPOS);

    // Confere a precondição no domínio: existe ao menos um jogo de grupo com
    // ambas as duplas definidas e sem vencedor.
    const pendenteNoDominio = bracket.matches.some(
      (m) =>
        m.side === "grupo" &&
        m.vencedorId === null &&
        m.a.pairId !== null &&
        m.b.pairId !== null,
    );
    expect(pendenteNoDominio).toBe(true);

    const raiz = renderBracketClient(bracket);

    const pendentes = raiz.querySelectorAll(
      ".match-card__estado--pendente",
    );
    expect(pendentes.length).toBeGreaterThan(0);

    // O marcador é textual e diz "Pendente".
    expect(pendentes[0].textContent).toBe("Pendente");

    // O confronto pendente mantém as duplas participantes visíveis e não marca
    // nenhuma vencedora.
    const cardPendente = pendentes[0].closest(".match-card");
    expect(cardPendente).not.toBeNull();
    expect(
      cardPendente!.querySelectorAll(".match-card__slot--definido").length,
    ).toBe(2);
    expect(
      cardPendente!.querySelector(".match-card__slot--vencedora"),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 16.4 — Campeã (R8.6)
// ---------------------------------------------------------------------------

describe("Feature: criar-chaveamento-campeonato, R8.6: destaque da campeã", () => {
  it("com bracket.campeaId definido, renderiza o banner .bracket-view__campea com nome e rótulo 'Campeã'", () => {
    const base = gerar(duplas(8), CONFIG_DUPLA_ELIMINACAO);
    // Define a campeã diretamente (como a tarefa pede). Usa uma dupla real do
    // snapshot para que o nome seja resolvido.
    const campea = base.duplas[2];
    const bracket: Bracket = { ...base, campeaId: campea.id };

    const raiz = renderBracketClient(bracket);

    const banner = raiz.querySelector(".bracket-view__campea");
    expect(banner).not.toBeNull();

    const rotulo = banner!.querySelector(".bracket-view__campea-rotulo");
    const nome = banner!.querySelector(".bracket-view__campea-nome");
    expect(rotulo?.textContent).toBe("Campeã");
    expect(nome?.textContent).toBe(`${campea.atletaA} & ${campea.atletaB}`);
  });

  it("sem campeã definida, o banner não é renderizado", () => {
    const bracket = gerar(duplas(8), CONFIG_DUPLA_ELIMINACAO);
    expect(bracket.campeaId).toBeNull();

    const raiz = renderBracketClient(bracket);
    expect(raiz.querySelector(".bracket-view__campea")).toBeNull();
  });

  it("a campeã derivada de registrarVencedor na grande final também aparece no banner (R8.6)", () => {
    // Caso-âncora pequeno (M=2): upper R1 → grande final. Jogar os dois jogos
    // decisivos define a campeã via domínio, sem setar campeaId à mão.
    let bracket = gerar(duplas(2), CONFIG_DUPLA_ELIMINACAO);
    const agora = "2026-02-01T10:00:00.000Z";

    // Resolve, em cada passo, um jogo cujos dois slots estão definidos e sem
    // vencedor, até a grande final definir a campeã.
    let seguranca = 0;
    while (bracket.campeaId === null && seguranca < 20) {
      seguranca++;
      const jogo = bracket.matches.find(
        (m) =>
          m.side !== "grupo" &&
          m.vencedorId === null &&
          m.a.pairId !== null &&
          m.b.pairId !== null,
      );
      if (!jogo) break;
      const vencedor = jogo.a.pairId as string;
      const r = registrarVencedor(bracket, jogo.id, vencedor, agora);
      expect(r.ok).toBe(true);
      if (!r.ok) break;
      bracket = r.bracket;
    }

    expect(bracket.campeaId).not.toBeNull();

    const raiz = renderBracketClient(bracket);
    const banner = raiz.querySelector(".bracket-view__campea");
    expect(banner).not.toBeNull();
    const campeaDupla = bracket.duplas.find((d) => d.id === bracket.campeaId);
    const nomeEsperado = `${campeaDupla?.atletaA} & ${campeaDupla?.atletaB}`;
    expect(
      banner!.querySelector(".bracket-view__campea-nome")?.textContent,
    ).toBe(nomeEsperado);
  });
});

// ---------------------------------------------------------------------------
// 17.2 — Formatos distintos lado a lado; estado sem chaveamento e isolamento
//        de falha (notas abaixo)
// ---------------------------------------------------------------------------

describe("Feature: criar-chaveamento-campeonato, R8.2/R8.3/R8.4/R8.7: formatos distintos e isolamento", () => {
  it("duas categorias (grupos e dupla eliminação) produzem, cada uma, o layout do seu próprio formato, de forma independente", () => {
    const bracketGrupos = gerar(duplas(6), CONFIG_FASE_DE_GRUPOS);
    const bracketElim = gerar(duplas(8), CONFIG_DUPLA_ELIMINACAO);

    // Renderizações independentes (uma por categoria), como a página faz.
    const viewGrupos = renderBracketClient(bracketGrupos);
    const viewElim = renderBracketClient(bracketElim);

    // (grupos) tem tabelas de grupo; a árvore só aparece se houver mata-mata.
    expect(viewGrupos.querySelectorAll(".group-table").length).toBeGreaterThan(
      0,
    );

    // (dupla eliminação) NÃO tem tabela de grupo; tem a árvore de eliminação.
    expect(viewElim.querySelectorAll(".group-table").length).toBe(0);
    expect(viewElim.querySelector(".elim-tree")).not.toBeNull();

    // Independência: montá-las "lado a lado" num mesmo container não faz uma
    // vazar sobre a outra — cada subárvore mantém o seu próprio layout.
    const container = document.createElement("div");
    container.appendChild(viewGrupos);
    container.appendChild(viewElim);

    const views = container.querySelectorAll(".bracket-view");
    expect(views.length).toBe(2);
    // A primeira view (grupos) contém tabela de grupo; a segunda (elim) não.
    expect(views[0].querySelectorAll(".group-table").length).toBeGreaterThan(0);
    expect(views[1].querySelectorAll(".group-table").length).toBe(0);
  });

  // NOTA (R8.4 estado sem chaveamento, R8.7 isolamento de falha):
  //
  // A indicação textual de indisponibilidade (quando a categoria não tem
  // chaveamento, R8.4) e o try/catch por categoria que isola uma falha de
  // leitura sem derrubar as demais (R8.7) vivem no SCRIPT da página pública
  // (`src/pages/campeonatos/[id]/acompanhar.astro`): o placeholder é HTML estático e
  // `renderBracketClient` só é chamado quando há um bracket carregado.
  //
  // Portanto, modelamos aqui de forma pragmática a fronteira dessa função:
  // (a) com bracket válido → produz o DOM do chaveamento; (b) a ausência de
  // bracket é representada por NÃO chamar renderBracketClient (placeholder
  // estático). O teste abaixo exercita o contrato observável desta função.
  it("renderBracketClient produz um chaveamento quando há bracket (contraparte do placeholder estático de R8.4)", () => {
    const bracket = gerar(duplas(4), CONFIG_DUPLA_ELIMINACAO);
    const raiz = renderBracketClient(bracket);

    // Há conteúdo de chaveamento (confrontos), que é exatamente o que substitui
    // o placeholder textual quando o bracket existe.
    expect(raiz.querySelector(".bracket-view__conteudo")).not.toBeNull();
    expect(raiz.querySelectorAll(".match-card").length).toBeGreaterThan(0);
  });

  it("isolamento de falha (R8.7): uma categoria sem bracket (placeholder) ao lado de uma renderizada não impede a renderização bem-sucedida da outra", () => {
    // Modela o DOM da página: uma categoria falhou/está indisponível (placeholder
    // estático, sem chamar renderBracketClient) e outra foi renderizada com
    // sucesso. A presença do placeholder não interfere na view bem-sucedida.
    const container = document.createElement("div");

    // Categoria A: indisponível (equivalente ao try/catch da página capturando
    // falha de leitura — HTML estático, sem render do bracket).
    const placeholder = document.createElement("p");
    placeholder.className = "bracket-indisponivel";
    placeholder.textContent = "Chaveamento ainda não disponível.";
    container.appendChild(placeholder);

    // Categoria B: renderizada com sucesso.
    const bracketOk = gerar(duplas(4), CONFIG_DUPLA_ELIMINACAO);
    container.appendChild(renderBracketClient(bracketOk));

    // Ambas coexistem: o placeholder textual permanece visível E a outra
    // categoria tem o seu chaveamento renderizado.
    expect(container.querySelector(".bracket-indisponivel")?.textContent).toBe(
      "Chaveamento ainda não disponível.",
    );
    expect(container.querySelector(".bracket-view")).not.toBeNull();
    expect(container.querySelectorAll(".match-card").length).toBeGreaterThan(0);
  });
});
