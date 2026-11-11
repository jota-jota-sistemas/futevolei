// src/scripts/seletor-jogador.ts
//
// Seletores OPCIONAIS de "jogador cadastrado" no formulário de dupla da
// organização. Escolher um jogador preenche o nome do atleta e vincula a
// inscrição ao perfil dele (`jogador_a_id`/`jogador_b_id`), o que alimenta o
// histórico de duplas do perfil. Sem escolher, o formulário funciona como
// sempre: só com texto.
//
// Contrato de DOM, dentro do <form data-form-dupla>:
//   #dupla-atleta-a / #dupla-atleta-b      os campos de texto dos atletas
//   [data-jogador-a] / [data-jogador-b]    os <select> de jogador (com a opção vazia)
//   [data-vinculo]                          o bloco de cada seletor (começa oculto)
//
// Só é ligado quando há jogadores para escolher; do contrário o bloco fica
// oculto e nada muda para quem organiza.

import type { Jogador } from "../domain/jogadores/types";
import { ordenarJogadores } from "../domain/jogadores/validation";

export interface VinculosDupla {
  jogadorAId: string | null;
  jogadorBId: string | null;
}

export interface SeletorJogadores {
  /** Ids escolhidos (null = não vinculado). */
  lerVinculos(): VinculosDupla;
  /** A e B apontam para o MESMO jogador (a dupla não pode ter a mesma pessoa duas vezes). */
  mesmoJogador(): boolean;
}

/** Rótulo da opção: ajuda a distinguir homônimos ("Nome “Apelido” · Cidade/UF"). */
export function rotuloDoJogador(j: Pick<Jogador, "nome" | "apelido" | "cidade" | "uf">): string {
  const local = [j.cidade, j.uf].filter(Boolean).join("/");
  return [j.nome, j.apelido ? `“${j.apelido}”` : "", local ? `· ${local}` : ""]
    .filter(Boolean)
    .join(" ");
}

export function ligarSeletoresDeJogador(
  form: HTMLFormElement,
  jogadores: readonly Jogador[]
): SeletorJogadores {
  const ordenados = ordenarJogadores(jogadores);
  const porId = new Map(ordenados.map((j) => [j.id, j]));

  const lugares = [
    {
      select: form.querySelector<HTMLSelectElement>("[data-jogador-a]"),
      input: form.querySelector<HTMLInputElement>("#dupla-atleta-a"),
    },
    {
      select: form.querySelector<HTMLSelectElement>("[data-jogador-b]"),
      input: form.querySelector<HTMLInputElement>("#dupla-atleta-b"),
    },
  ];

  for (const { select, input } of lugares) {
    if (!select || !input) continue;

    for (const j of ordenados) {
      const opcao = document.createElement("option");
      opcao.value = j.id;
      opcao.textContent = rotuloDoJogador(j);
      select.append(opcao);
    }

    // Escolher um jogador preenche o nome do atleta com o do cadastro.
    select.addEventListener("change", () => {
      const j = porId.get(select.value);
      if (j) input.value = j.nome;
    });

    // Se o nome for editado à mão, o vínculo deixa de valer (evita ligar a
    // inscrição a um perfil cujo nome não é mais o que está no campo).
    input.addEventListener("input", () => {
      const j = porId.get(select.value);
      if (j && input.value.trim() !== j.nome) select.value = "";
    });
  }

  if (ordenados.length > 0) {
    for (const bloco of form.querySelectorAll<HTMLElement>("[data-vinculo]")) {
      bloco.hidden = false;
    }
  }

  const ler = (i: 0 | 1): string | null => {
    const valor = lugares[i].select?.value ?? "";
    return porId.has(valor) ? valor : null;
  };

  return {
    lerVinculos: () => ({ jogadorAId: ler(0), jogadorBId: ler(1) }),
    mesmoJogador: () => {
      const a = ler(0);
      return a !== null && a === ler(1);
    },
  };
}
