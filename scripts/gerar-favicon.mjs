// Gera public/icone.png a partir de public/icone.svg (marca turquesa PINGO FTV).
// Uso: node scripts/gerar-favicon.mjs
// Dependência: sharp (já presente em node_modules via Astro).
// Dimensão de saída 256x256 (>= 32x32, R6.2) para nitidez em telas HiDPI.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(raiz, "public", "icone.svg"));
const destino = join(raiz, "public", "icone.png");

await sharp(svg, { density: 384 })
  .resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(destino);

console.log("Favicon gerado em public/icone.png (256x256).");
