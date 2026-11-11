// Coletor de torneios do calendário público https://torneios-ftv.com
//
// Abre o calendário semanal já filtrado por Estado = SP e Período = "Hoje em
// diante", clica em cada torneio para abrir o painel de detalhes e grava o
// resultado em src/data/torneios.json.
//
// Uso:  npm run coletar:torneios
//
// Notas de conduta:
//  - Só lê páginas públicas, sem login. O botão "Inscreva-se" exige conta
//    (contato do organizador), então o link de inscrição NÃO é coletado.
//  - Uma única sessão de navegador, com pausa entre os cliques, para não
//    sobrecarregar o site. Rode sob demanda, não em loop.
//  - O link do Instagram vem de um redirecionamento do próprio site
//    (/r/instagram/<id>); resolvemos o destino sem abrir o Instagram.

import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FONTE = "https://torneios-ftv.com";
const PAGINA = `${FONTE}/?view=calendar&calendar=week&state=SP`;
const SAIDA = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/data/torneios.json"
);
const PAUSA_MS = 350; // intervalo entre cliques

const MESES = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const limpar = (s) => (s ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
const dois = (n) => String(n).padStart(2, "0");

/** "13 de nov. de 2026" -> { d, m, a? } (ano opcional). */
function parteData(texto) {
  const m = limpar(texto).match(/(\d{1,2}) de ([a-zç]{3})[a-z]*\.?(?: de (\d{4}))?/i);
  if (!m) return null;
  const mes = MESES[m[2].toLowerCase()];
  if (!mes) return null;
  return { d: Number(m[1]), m: mes, a: m[3] ? Number(m[3]) : null };
}

/**
 * "13 de nov. - 15 de nov. de 2026" -> { data, dataFim } em ISO.
 * "13 de nov. de 2026" (um dia) -> data === dataFim.
 * Se o início não traz ano, herda o do fim (ou o ano anterior quando o mês do
 * início é maior que o do fim, ex.: dez -> jan).
 */
export function parsePeriodo(texto) {
  const [ini, fim] = limpar(texto).split(/\s+-\s+/);
  const pi = parteData(ini);
  const pf = parteData(fim ?? ini);
  if (!pi || !pf) return null;
  const anoFim = pf.a ?? pi.a;
  if (!anoFim) return null;
  const anoIni = pi.a ?? (pi.m > pf.m ? anoFim - 1 : anoFim);
  return {
    data: `${anoIni}-${dois(pi.m)}-${dois(pi.d)}`,
    dataFim: `${anoFim}-${dois(pf.m)}-${dois(pf.d)}`,
  };
}

function slug(texto) {
  return limpar(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

/** "R$ 160,00" -> 160 ; "R$ 1.250,50" -> 1250.5 ; sem número -> null. */
function parsePreco(texto) {
  const m = limpar(texto).match(/(\d[\d.]*)(?:,(\d{1,2}))?/);
  if (!m) return null;
  return Number(`${m[1].replace(/\./g, "")}.${m[2] ?? "0"}`);
}

/**
 * Mantém origem + caminho e preserva `img_index`, descartando o resto da query
 * (rastreio). O site liga vários torneios ao mesmo post de Instagram (carrossel
 * em que cada slide é um torneio); `img_index` indica o slide do torneio.
 */
function urlLimpa(url) {
  try {
    const u = new URL(url);
    const slide = u.searchParams.get("img_index");
    return u.origin + u.pathname + (slide ? `?img_index=${slide}` : "");
  } catch {
    return url;
  }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: "pt-BR" });
const page = await ctx.newPage();
const avisos = [];

try {
  await page.goto(PAGINA, { waitUntil: "networkidle" });
  await page.waitForSelector("main section button[aria-pressed]", { timeout: 20000 });

  // Garante que os filtros aplicados pela URL são os esperados.
  const filtros = await page.$$eval("select", (els) =>
    els.map((e) => ({ valor: e.value, rotulo: e.selectedOptions[0]?.textContent?.trim() }))
  );
  const estado = filtros.find((f) => f.valor === "SP");
  const periodo = filtros.find((f) => f.valor === "upcoming");
  if (!estado) throw new Error("Filtro de Estado não está em SP.");
  if (!periodo) throw new Error('Filtro de Período não está em "Hoje em diante".');

  // Rola até o fim para garantir que tudo foi carregado (contagem estável).
  let anterior = -1;
  for (let i = 0; i < 10; i++) {
    const n = await page.locator("main section button[aria-pressed]").count();
    if (n === anterior) break;
    anterior = n;
    await page.mouse.wheel(0, 100000);
    await pausa(500);
  }

  const botoes = page.locator("main section button[aria-pressed]");
  const total = await botoes.count();
  console.log(`Encontrados ${total} itens no calendário (SP, hoje em diante).`);

  const vistos = new Map();
  const ids = new Set();
  const torneios = [];

  for (let i = 0; i < total; i++) {
    const botao = botoes.nth(i);
    const lista = await botao.evaluate((el) => ({
      periodo: el.querySelector("p")?.textContent ?? "",
      nome: el.querySelector("h4")?.textContent ?? "",
      cidade: el.querySelectorAll("p")[1]?.textContent ?? "",
    }));
    const nomeLista = limpar(lista.nome);

    try {
      // click() via DOM: o painel lateral pode sobrepor parte da lista.
      await botao.evaluate((el) => el.click());
      await page.waitForFunction(
        (nome) => {
          const h = [...document.querySelectorAll("h3")].find((x) =>
            x.closest("div.overflow-y-auto")?.textContent?.includes("Detalhes do torneio")
          );
          return h && h.textContent.trim() === nome;
        },
        nomeLista,
        { timeout: 8000 }
      );

      const painel = page.locator("div.overflow-y-auto", { hasText: "Detalhes do torneio" }).first();
      const det = await painel.evaluate((p) => {
        const campos = {};
        for (const s of p.querySelectorAll("span.flex.items-center")) {
          const [icone, valor] = s.querySelectorAll(":scope > span");
          // Remove o seletor de variação de emoji (U+FE0F), ex.: "🏟️" -> "🏟".
          if (icone && valor)
            campos[icone.textContent.replace(/\uFE0F/g, "").trim()] = valor.textContent;
        }
        const categorias = [
          ...p.querySelectorAll("div.flex-wrap > span.rounded-full"),
        ].map((c) => c.textContent);
        const ig = p.querySelector('a[href*="/r/instagram/"]')?.getAttribute("href") ?? null;
        return { campos, categorias, ig };
      });

      const per = parsePeriodo(det.campos["📅"] ?? lista.periodo);
      if (!per) {
        avisos.push(`Período não reconhecido: "${lista.periodo}" (${nomeLista})`);
        continue;
      }
      if (per.dataFim < per.data) {
        avisos.push(`Datas inconsistentes (fim antes do início), ignorado: ${nomeLista}`);
        continue;
      }

      const [cidade, uf] = (() => {
        const t = limpar(det.campos["📍"] ?? lista.cidade);
        const k = t.lastIndexOf(",");
        return k === -1 ? [t, "SP"] : [t.slice(0, k).trim(), t.slice(k + 1).trim()];
      })();

      // Resolve o redirecionamento do Instagram sem seguir até o Instagram.
      let instagram = "";
      if (det.ig) {
        const r = await ctx.request.get(new URL(det.ig, FONTE).href, { maxRedirects: 0 });
        const destino = r.headers()["location"];
        if (destino && /instagram\.com/i.test(destino)) instagram = urlLimpa(destino);
        else avisos.push(`Instagram sem destino válido: ${nomeLista}`);
      }

      const chave = `${slug(nomeLista)}|${per.data}|${per.dataFim}|${slug(cidade)}`;
      if (vistos.has(chave)) continue; // mesmo torneio listado em mais de uma semana
      vistos.set(chave, true);

      let id = `${per.data.slice(2).replace(/-/g, "")}_${slug(cidade)}_${slug(nomeLista)}`;
      for (let n = 2; ids.has(id); n++) id = `${id.replace(/_\d+$/, "")}_${n}`;
      ids.add(id);

      const precoTexto = limpar(det.campos["💰"] ?? "");
      torneios.push({
        id,
        nome: nomeLista,
        data: per.data,
        dataFim: per.dataFim,
        cidade,
        uf,
        endereco: limpar(det.campos["🏟"] ?? ""),
        preco: precoTexto ? parsePreco(precoTexto) : null,
        precoTexto,
        categorias: det.categorias.map(limpar).filter(Boolean),
        instagram,
        fonte: PAGINA,
      });
    } catch (e) {
      const motivo = /waitForFunction/.test(e.message)
        ? "painel não corresponde ao item da lista (anúncio possivelmente inconsistente)"
        : e.message.split("\n")[0];
      avisos.push(`Ignorado "${nomeLista}": ${motivo}`);
    }
    await pausa(PAUSA_MS);
    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${total}`);
  }

  // Preserva os eventos cadastrados à mão (fonte === "manual"): o arquivo é
  // regravado por inteiro, e sem isto cada coleta apagaria esses registros.
  // Se um id manual colidir com um coletado, o manual prevalece.
  let manuais = [];
  const fotosAtuais = new Map(); // id -> foto colocada à mão em registros coletados
  try {
    const atual = JSON.parse(await readFile(SAIDA, "utf8"));
    manuais = atual.filter((t) => t.fonte === "manual");
    for (const t of atual) {
      if (t.fonte !== "manual" && t.foto) fotosAtuais.set(t.id, t.foto);
    }
  } catch {
    // arquivo ainda não existe ou ilegível: nada a preservar
  }
  const idsManuais = new Set(manuais.map((t) => t.id));
  const coletados = torneios.filter((t) => !idsManuais.has(t.id));

  // O site de origem não fornece foto. Se um registro coletado ganhou uma foto
  // à mão, mantém-na na regravação (o `id` coletado é estável entre execuções).
  // A chave `foto` fica antes de `fonte`, como nos registros manuais.
  for (let i = 0; i < coletados.length; i++) {
    const foto = fotosAtuais.get(coletados[i].id);
    if (!foto) continue;
    const { fonte, ...resto } = coletados[i];
    coletados[i] = { ...resto, foto, fonte };
  }
  torneios.length = 0;
  torneios.push(...coletados, ...manuais);
  if (manuais.length) console.log(`Preservados ${manuais.length} evento(s) manual(is).`);

  torneios.sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
  await mkdir(dirname(SAIDA), { recursive: true });
  await writeFile(SAIDA, JSON.stringify(torneios, null, 2) + "\n", "utf8");

  console.log(`\nSalvos ${torneios.length} torneios em ${SAIDA}`);
  if (avisos.length) {
    console.warn(`\n${avisos.length} aviso(s):`);
    for (const a of avisos) console.warn(` - ${a}`);
  }
} finally {
  await browser.close();
}
