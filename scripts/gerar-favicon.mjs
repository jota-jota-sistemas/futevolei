// Gera public/icone.png (favicon) a partir do símbolo oficial
// public/simbolo-pingo.png, redimensionando para um quadrado 256x256 com
// leve padding e fundo transparente.
// Uso: node scripts/gerar-favicon.mjs
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(raiz, "public", "simbolo-pingo.png");
const destino = join(raiz, "public", "icone.png");

const LADO = 256;
const PAD = 12; // respiro ao redor do símbolo

// Ajusta o símbolo (516x574) dentro de um quadrado, preservando proporção,
// sobre um canvas transparente.
const simbolo = await sharp(src)
  .resize(LADO - PAD * 2, LADO - PAD * 2, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .toBuffer();

await sharp({
  create: {
    width: LADO,
    height: LADO,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: simbolo, gravity: "center" }])
  .png()
  .toFile(destino);

console.log(`Favicon gerado em public/icone.png (${LADO}x${LADO}).`);
