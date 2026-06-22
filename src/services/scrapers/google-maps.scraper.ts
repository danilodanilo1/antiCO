import { readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { config } from "../../config/env.js";
import type { AvaliacaoMaps, MapsResult } from "../../types/empresa.js";
import { ensureDir } from "../../utils/files.js";
import { logger } from "../../utils/logger.js";

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    browserInstance = await chromium.launch({ headless: true });
  }
  return browserInstance;
}

async function dismissConsent(page: Page): Promise<void> {
  const selectors = [
    'button:has-text("Aceitar tudo")',
    'button:has-text("Accept all")',
    'button:has-text("Rejeitar tudo")',
    'button[aria-label*="Aceitar"]',
  ];
  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1500 })) {
        await btn.click();
        await page.waitForTimeout(500);
        return;
      }
    } catch {
      // continue
    }
  }
}

function extrairNota(texto: string): { nota?: number; total?: number } {
  const patterns = [
    /(\d[,.]\d)\s*\(\s*([\d.]+)\s*\)/,
    /(\d[,.]\d)\s*·\s*([\d.]+)\s*avalia/i,
    /(\d[,.]\d)\s+estrelas?\s*·\s*([\d.]+)/i,
    /aria-label="([\d,.]+)\s*estrelas?[^"]*([\d.]+)\s*avalia/i,
  ];
  for (const p of patterns) {
    const m = texto.match(p);
    if (m) {
      return {
        nota: parseFloat(m[1].replace(",", ".")),
        total: parseInt(m[2].replace(/\./g, ""), 10),
      };
    }
  }
  return {};
}

function resultadoUtil(result: MapsResult): boolean {
  return Boolean(
    result.notaMedia ||
    (result.totalAvaliacoes && result.totalAvaliacoes > 0) ||
    result.avaliacoes.length > 0,
  );
}

export class GoogleMapsScraper {
  async buscar(
    nomeEmpresa: string,
    municipio?: string,
    uf?: string,
    cnpj?: string,
  ): Promise<MapsResult> {
    const cache = cnpj ? await this.lerCache(cnpj) : null;
    if (cache && resultadoUtil(cache)) return cache;

    const query = [nomeEmpresa, municipio, uf].filter(Boolean).join(", ");
    logger.info(`Google Maps: buscando "${query}"`);

    try {
      const browser = await getBrowser();
      const page = await browser.newPage();
      await page.setExtraHTTPHeaders({ "Accept-Language": "pt-BR,pt;q=0.9" });

      const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await dismissConsent(page);
      await page.waitForTimeout(4000);

      // Se lista de resultados, clicar no primeiro item relevante
      try {
        const firstResult = page.locator('a[href*="/maps/place/"]').first();
        if (await firstResult.isVisible({ timeout: 3000 })) {
          await firstResult.click();
          await page.waitForTimeout(3000);
        }
      } catch {
        // já na ficha ou sem lista
      }

      const url = page.url();
      const bodyText = await page.locator("body").innerText().catch(() => "");
      const html = await page.content().catch(() => "");

      const { nota, total } = extrairNota(bodyText + html);

      const avaliacoes: AvaliacaoMaps[] = [];
      try {
        const reviewTab = page.locator('button[role="tab"]:has-text("Avalia"), button:has-text("Reviews")').first();
        if (await reviewTab.isVisible({ timeout: 2000 })) {
          await reviewTab.click();
          await page.waitForTimeout(2000);
        }

        const reviewBlocks = page.locator('[data-review-id], div.jftiEf, div.MyEned');
        const count = await reviewBlocks.count();
        for (let i = 0; i < Math.min(count, 8); i++) {
          const block = reviewBlocks.nth(i);
          const texto = (await block.innerText().catch(() => "")).trim();
          if (!texto || texto.length < 5) continue;
          const starLabel =
            (await block.locator('[role="img"][aria-label*="estrela"]').first().getAttribute("aria-label").catch(() => null)) ??
            (await block.locator('[aria-label*="star"]').first().getAttribute("aria-label").catch(() => null)) ??
            "";
          const estrelasMatch = starLabel.match(/(\d)/);
          const autorMatch = texto.split("\n")[0]?.trim() ?? "Anônimo";
          avaliacoes.push({
            autorNome: autorMatch,
            estrelas: estrelasMatch ? parseInt(estrelasMatch[1], 10) : 5,
            texto: texto.slice(0, 300),
          });
        }
      } catch {
        // reviews indisponíveis
      }

      await page.close();

      const nomeLower = nomeEmpresa.toLowerCase().slice(0, 10);
      const encontrado =
        url.includes("/maps/place/") ||
        Boolean(nota) ||
        bodyText.toLowerCase().includes(nomeLower) ||
        avaliacoes.length > 0;

      const result: MapsResult = {
        encontrado,
        nomeEmpresa,
        notaMedia: nota,
        totalAvaliacoes: total,
        url: url.startsWith("http") ? url : searchUrl,
        avaliacoes,
      };

      if (cnpj && resultadoUtil(result)) {
        await this.salvarCache(cnpj, result);
      } else if (cnpj && cache) {
        return cache;
      }

      if (!resultadoUtil(result)) {
        result.erro = "Google Maps não retornou nota ou avaliações (bloqueio ou empresa não listada)";
      }

      return result;
    } catch (error) {
      logger.debug(`Google Maps falhou: ${String(error)}`);
      return {
        encontrado: false,
        avaliacoes: [],
        erro: String(error),
      };
    }
  }

  private async lerCache(cnpj: string): Promise<MapsResult | null> {
    const dir = join(config.dataDir, "snapshots", "maps");
    const key = cnpj.replace(/\D/g, "");
    const date = new Date().toISOString().slice(0, 10);
    const path = join(dir, `${key}-${date}.json`);
    try {
      const raw = await readFile(path, "utf-8");
      const data = JSON.parse(raw) as MapsResult;
      if (!resultadoUtil(data)) {
        await unlink(path).catch(() => {});
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  private async salvarCache(cnpj: string, result: MapsResult): Promise<void> {
    const dir = join(config.dataDir, "snapshots", "maps");
    await ensureDir(dir);
    const date = new Date().toISOString().slice(0, 10);
    const path = join(dir, `${cnpj.replace(/\D/g, "")}-${date}.json`);
    await writeFile(path, JSON.stringify(result, null, 2), "utf-8");
    await this.indexarAvaliadores(cnpj, result);
  }

  private async indexarAvaliadores(cnpj: string, result: MapsResult): Promise<void> {
    const dir = join(config.dataDir, "snapshots", "maps");
    const indexPath = join(dir, "avaliadores-index.json");
    type IndexEntry = Record<string, Array<{ cnpj: string; nomeEmpresa?: string }>>;

    let index: IndexEntry = {};
    try {
      index = JSON.parse(await readFile(indexPath, "utf-8")) as IndexEntry;
    } catch {
      // novo
    }

    for (const av of result.avaliacoes) {
      const key = av.autorId ?? av.autorNome.toLowerCase().trim();
      if (!key) continue;
      if (!index[key]) index[key] = [];
      if (!index[key].some((e) => e.cnpj === cnpj)) {
        index[key].push({ cnpj, nomeEmpresa: result.nomeEmpresa });
      }
    }

    await writeFile(indexPath, JSON.stringify(index), "utf-8");
  }

  async buscarAvaliadoresCompartilhados(cnpj: string): Promise<{ avaliadores: string[]; empresas: string[] }> {
    const dir = join(config.dataDir, "snapshots", "maps");
    const indexPath = join(dir, "avaliadores-index.json");
    const key = cnpj.replace(/\D/g, "");
    const avaliadores: string[] = [];
    const empresas: string[] = [];

    try {
      const index = JSON.parse(await readFile(indexPath, "utf-8")) as Record<
        string,
        Array<{ cnpj: string; nomeEmpresa?: string }>
      >;

      for (const [avaliador, entries] of Object.entries(index)) {
        const temEste = entries.some((e) => e.cnpj === key);
        if (!temEste) continue;
        const outras = entries.filter((e) => e.cnpj !== key);
        if (outras.length > 0) {
          avaliadores.push(avaliador);
          for (const o of outras) {
            empresas.push(o.nomeEmpresa ?? o.cnpj);
          }
        }
      }
    } catch {
      // sem índice
    }

    return { avaliadores, empresas: [...new Set(empresas)] };
  }
}

export const googleMapsScraper = new GoogleMapsScraper();
