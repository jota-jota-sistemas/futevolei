import { describe, it, expect } from "vitest";
import fc from "fast-check";

/**
 * Property 1: Contraste WCAG AA em toda combinação da paleta.
 *
 * Validates: Requirements 1.9, 6.1
 *
 * Para qualquer par (cor de texto/elemento, cor de fundo) efetivamente usado
 * na interface — incluindo o wordmark do logo em ambas as variantes e o
 * outline de foco — a razão de contraste calculada pela fórmula WCAG 2.1
 * (relative luminance de sRGB + (L1 + 0.05) / (L2 + 0.05)) SHALL ser:
 *   - >= 4.5:1 para texto normal, e
 *   - >= 3:1 para texto grande (>= 18pt ou >= 14pt em negrito), ícones e
 *     componentes de interface (incluindo o wordmark do logo).
 *
 * A fórmula WCAG é reimplementada aqui (helpers puros) para manter o teste
 * autocontido. O domínio real da UI é um conjunto FINITO de pares enumerados
 * abaixo; usamos fast-check para amostrar aleatoriamente desse conjunto por
 * >= 100 iterações (cobrindo todos os pares) e também um loop determinístico
 * que verifica cada par ao menos uma vez.
 */

// --- Paleta: exatamente como em src/layouts/Layout.astro ---
const PALETA = {
  turquesa: "#00B8A9", // --cor-destaque
  destaqueForte: "#009B8E", // --cor-destaque-forte
  destaqueSuave: "#E3F5F2", // --cor-destaque-suave
  destaqueTexto: "#00695F", // --cor-destaque-texto
  destaqueContraste: "#102A43", // --cor-destaque-contraste (azul-marinho)
  areia: "#F2E8D8", // --cor-fundo
  superficie: "#FFFFFF", // --cor-superficie (branco)
  borda: "#E0D4BF", // --cor-borda
  escuro: "#102A43", // --cor-escuro (azul-marinho)
  escuro2: "#1C3D5A", // --cor-escuro-2
  texto: "#102A43", // --cor-texto (azul-marinho)
  textoSuave: "#4A5B6B", // --cor-texto-suave
  textoClaro: "#FFFFFF", // --cor-texto-claro (branco)
  textoClaroSuave: "#9FB3C8", // --cor-texto-claro-suave
} as const;

// --- Fórmula de contraste WCAG 2.1 ---
function hexToRgb(hex: string): [number, number, number] {
  const limpo = hex.replace(/^#/, "");
  const valor =
    limpo.length === 3
      ? limpo
          .split("")
          .map((c) => c + c)
          .join("")
      : limpo;
  const inteiro = parseInt(valor, 16);
  return [(inteiro >> 16) & 0xff, (inteiro >> 8) & 0xff, inteiro & 0xff];
}

/** Luminância relativa de uma cor sRGB, conforme WCAG 2.1. */
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((canal) => {
    const s = canal / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste WCAG 2.1: (L1 + 0.05) / (L2 + 0.05), L1 >= L2. */
function contrastRatio(corA: string, corB: string): number {
  const la = luminance(corA);
  const lb = luminance(corB);
  const l1 = Math.max(la, lb);
  const l2 = Math.min(la, lb);
  return (l1 + 0.05) / (l2 + 0.05);
}

// --- Conjunto FINITO de pares realmente usados na UI ---
interface Par {
  nome: string;
  frente: string; // texto/elemento
  fundo: string;
  limiar: number; // 4.5 texto normal; 3.0 texto grande/ícones/componentes
}

const PARES: Par[] = [
  // Texto normal (limiar 4.5)
  {
    nome: "branco sobre azul-marinho (header/footer/hero texto claro)",
    frente: PALETA.textoClaro,
    fundo: PALETA.escuro,
    limiar: 4.5,
  },
  {
    nome: "texto-claro-suave sobre azul-marinho (subtítulos sobre escuro)",
    frente: PALETA.textoClaroSuave,
    fundo: PALETA.escuro,
    limiar: 4.5,
  },
  {
    nome: "azul-marinho sobre areia (texto principal)",
    frente: PALETA.texto,
    fundo: PALETA.areia,
    limiar: 4.5,
  },
  {
    nome: "texto-suave sobre areia",
    frente: PALETA.textoSuave,
    fundo: PALETA.areia,
    limiar: 4.5,
  },
  {
    nome: "azul-marinho sobre branco (cards)",
    frente: PALETA.texto,
    fundo: PALETA.superficie,
    limiar: 4.5,
  },
  {
    nome: "texto-suave sobre branco",
    frente: PALETA.textoSuave,
    fundo: PALETA.superficie,
    limiar: 4.5,
  },
  {
    nome: 'destaque-texto sobre areia ("ver todos", voltar:hover)',
    frente: PALETA.destaqueTexto,
    fundo: PALETA.areia,
    limiar: 4.5,
  },
  {
    nome: "destaque-texto sobre destaque-suave (chips de tag)",
    frente: PALETA.destaqueTexto,
    fundo: PALETA.destaqueSuave,
    limiar: 4.5,
  },

  // Texto grande / ícones / componentes de interface (limiar 3.0)
  {
    nome: "azul-marinho sobre fill turquesa (badge e botão destaque)",
    frente: PALETA.destaqueContraste,
    fundo: PALETA.turquesa,
    limiar: 3.0,
  },

  // Wordmark do logo — variante escuro
  {
    nome: "logo escuro: wordmark PINGO branco sobre azul-marinho",
    frente: PALETA.textoClaro,
    fundo: PALETA.escuro,
    limiar: 3.0,
  },
  {
    nome: "logo escuro: bloco FTV azul-marinho sobre turquesa",
    frente: PALETA.destaqueContraste,
    fundo: PALETA.turquesa,
    limiar: 3.0,
  },

  // Wordmark do logo — variante claro (sobre areia)
  {
    nome: "logo claro: wordmark PINGO azul-marinho sobre areia",
    frente: PALETA.texto,
    fundo: PALETA.areia,
    limiar: 3.0,
  },
  {
    nome: "logo claro: bloco FTV destaque-texto sobre areia",
    frente: PALETA.destaqueTexto,
    fundo: PALETA.areia,
    limiar: 3.0,
  },

  // Indicador de foco (:focus-visible) com DUPLO CONTORNO.
  //
  // O foco NÃO depende de uma única cor passar contra todos os fundos.
  // Usa-se outline turquesa (--cor-destaque) + anel interno azul-marinho
  // (--cor-destaque-contraste, box-shadow). Em fundos CLAROS (areia/branco)
  // o contraste é garantido pelo anel escuro azul-marinho; em fundos ESCUROS
  // (azul-marinho) é garantido pelo turquesa. Por isso modelamos os pares que
  // de fato sustentam o indicador, e não o turquesa isolado sobre claros
  // (que rende apenas ~2.05:1 sobre areia e ~2.49:1 sobre branco).
  {
    nome: "foco: anel azul-marinho sobre areia (duplo contorno em fundo claro)",
    frente: PALETA.destaqueContraste,
    fundo: PALETA.areia,
    limiar: 3.0,
  },
  {
    nome: "foco: anel azul-marinho sobre branco (duplo contorno em fundo claro)",
    frente: PALETA.destaqueContraste,
    fundo: PALETA.superficie,
    limiar: 3.0,
  },
  {
    nome: "foco: outline turquesa sobre azul-marinho (fundo escuro)",
    frente: PALETA.turquesa,
    fundo: PALETA.escuro,
    limiar: 3.0,
  },
];

describe("Feature: pingo-rebrand-visual, Property 1: Contraste WCAG AA em toda combinação da paleta", () => {
  it("toda combinação amostrada da paleta atinge o limiar WCAG do seu uso", () => {
    fc.assert(
      fc.property(fc.constantFrom(...PARES), (par) => {
        const ratio = contrastRatio(par.frente, par.fundo);
        expect(
          ratio,
          `Par "${par.nome}" (${par.frente} sobre ${par.fundo}) obteve razão ${ratio.toFixed(
            2
          )}:1, abaixo do limiar ${par.limiar}:1`
        ).toBeGreaterThanOrEqual(par.limiar);
      }),
      { numRuns: 100 }
    );
  });

  it("verifica deterministicamente TODOS os pares reais da UI ao menos uma vez", () => {
    for (const par of PARES) {
      const ratio = contrastRatio(par.frente, par.fundo);
      expect(
        ratio,
        `Par "${par.nome}" (${par.frente} sobre ${par.fundo}) obteve razão ${ratio.toFixed(
          2
        )}:1, abaixo do limiar ${par.limiar}:1`
      ).toBeGreaterThanOrEqual(par.limiar);
    }
  });

  it("a fórmula WCAG reproduz os valores de referência do design", () => {
    // Branco sobre preto = 21:1 (contraste máximo), sanity check da fórmula.
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 1);
    // Branco sobre turquesa é insuficiente (< 4.5), conforme decisão de design.
    expect(contrastRatio(PALETA.superficie, PALETA.turquesa)).toBeLessThan(4.5);
  });
});
