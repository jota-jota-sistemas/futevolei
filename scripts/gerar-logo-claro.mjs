// Gera public/logo-pingo-ftv-claro.png a partir de public/logo-pingo-ftv.png
// para uso sobre o header/footer azul-marinho.
//
// Objetivo: deixar APENAS o wordmark "PINGO" em branco, preservando em
// azul-marinho o xadrez da bola (no símbolo) e o texto "FTV" (dentro do bloco
// turquesa) — exatamente como na arte de referência sobre fundo escuro.
//
// Como xadrez, "FTV" e "PINGO" têm a MESMA cor (azul-marinho), a separação é
// feita por REGIÃO horizontal, não por cor. Faixas medidas na arte 1388x413:
//   - símbolo .......... x <  ~337   (termina o turquesa da bola/cauda)
//   - "PINGO" .......... ~337..~1015 (apenas dark)      -> recolorir p/ branco
//   - bloco "FTV" ...... x > ~1020   (dark + turquesa)  -> preservar
//
// O início da faixa (0.243) fica logo após o símbolo terminar, para não cortar
// a perna esquerda do "P" do PINGO (que começa em ~x=340).
//
// Uso: node scripts/gerar-logo-claro.mjs
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(raiz, "public", "logo-pingo-ftv.png");
const destino = join(raiz, "public", "logo-pingo-ftv-claro.png");

// Limites da região do wordmark "PINGO" (fração da largura, robusto a reescala).
const INICIO = 0.243; // ~337/1388 — logo após o fim do símbolo turquesa
const FIM = 0.732; // ~1015/1388 — antes do bloco "FTV"

const { data, info } = await sharp(src)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
const out = Buffer.from(data);

const xIni = Math.round(width * INICIO);
const xFim = Math.round(width * FIM);

for (let y = 0; y < height; y++) {
  for (let x = xIni; x <= xFim; x++) {
    const i = (y * width + x) * channels;
    const g = out[i + 1],
      b = out[i + 2],
      a = out[i + 3];
    if (a < 20) continue; // transparente: mantém
    // Dentro da região do PINGO, pinta o azul-marinho escuro de branco.
    if (g < 110 && b < 110) {
      out[i] = 255;
      out[i + 1] = 255;
      out[i + 2] = 255; // branco; alpha (anti-aliasing) preservado
    }
  }
}

await sharp(out, { raw: { width, height, channels } })
  .png()
  .toFile(destino);

console.log(
  `Logo claro gerado em public/logo-pingo-ftv-claro.png (${width}x${height}); ` +
    `PINGO em branco, xadrez e FTV preservados em azul-marinho.`
);
