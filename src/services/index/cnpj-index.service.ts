import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import AdmZip from "adm-zip";
import { config } from "../../config/env.js";
import type { FonteDados } from "../../types/politico.js";
import type { PagadorPolitico } from "../../types/empresa.js";
import { csvToObjects, parseValorBr } from "../../utils/csv.js";
import { normalizeCnpj, isCnpj, parseCnpjCeap, cnpjMatchesQuery } from "../../utils/cnpj.js";
import { fetchText } from "../../utils/http.js";
import { logger } from "../../utils/logger.js";
import { normalizarNomePolitico } from "../shared/despesas-processor.js";

interface PagadorEntry {
  nome: string;
  fonte: FonteDados;
  partido?: string;
  uf?: string;
  totalGasto: number;
  quantidadeNotas: number;
  tiposDespesa: Set<string>;
  ultimaDespesa?: string;
}

interface CnpjIndexData {
  geradoEm: string;
  versao: number;
  totalCnpjs: number;
  index: Record<string, PagadorEntry[]>;
}

const INDEX_VERSION = 2;

const ANOS_CEAPS = Array.from({ length: 18 }, (_, i) => 2009 + i);
const ANOS_CEAP = Array.from({ length: 18 }, (_, i) => 2008 + i);
const ANOS_CEAP_DOWNLOAD = Array.from({ length: 6 }, (_, i) => 2020 + i);

export class CnpjIndexService {
  private index: Map<string, PagadorEntry[]> | null = null;

  async ensureLoaded(): Promise<void> {
    await this.carregar();
  }

  async buscarPagadores(cnpj: string): Promise<PagadorPolitico[]> {
    const idx = await this.carregar();
    const key = normalizeCnpj(cnpj);
    const merged = new Map<string, PagadorEntry>();

    for (const [indexedCnpj, entries] of idx) {
      if (!cnpjMatchesQuery(key, indexedCnpj)) continue;
      for (const e of entries) {
        const mergeKey = `${e.fonte}:${normalizarNomePolitico(e.nome)}`;
        const existing = merged.get(mergeKey);
        if (existing) {
          existing.totalGasto += e.totalGasto;
          existing.quantidadeNotas += e.quantidadeNotas;
          for (const t of e.tiposDespesa) existing.tiposDespesa.add(t);
          if (e.ultimaDespesa && (!existing.ultimaDespesa || e.ultimaDespesa > existing.ultimaDespesa)) {
            existing.ultimaDespesa = e.ultimaDespesa;
          }
        } else {
          merged.set(mergeKey, {
            ...e,
            tiposDespesa: new Set(e.tiposDespesa),
          });
        }
      }
    }

    return [...merged.values()]
      .map((e) => ({
        nome: e.nome,
        fonte: e.fonte,
        partido: e.partido,
        uf: e.uf,
        totalGasto: e.totalGasto,
        quantidadeNotas: e.quantidadeNotas,
        tiposDespesa: [...e.tiposDespesa],
        ultimaDespesa: e.ultimaDespesa,
      }))
      .sort((a, b) => b.totalGasto - a.totalGasto);
  }

  async buscarPorEndereco(cep?: string, logradouro?: string): Promise<string[]> {
    // Endereço compartilhado será enriquecido via snapshots CNPJ futuros
    void cep;
    void logradouro;
    return [];
  }

  async totalPoliticos(cnpj: string): Promise<number> {
    return (await this.buscarPagadores(cnpj)).length;
  }

  private async carregar(): Promise<Map<string, PagadorEntry[]>> {
    if (this.index) return this.index;

    const cachePath = join(config.dataDir, "raw", "cnpj-index.json");

    try {
      const raw = await readFile(cachePath, "utf-8");
      const data = JSON.parse(raw) as CnpjIndexData;
      if ((data.versao ?? 1) < INDEX_VERSION) {
        throw new Error("Índice desatualizado");
      }
      this.index = this.deserialize(data.index);
      logger.info(`Índice CNPJ: ${this.index.size} CNPJs (cache)`);
      return this.index;
    } catch {
      logger.info("Construindo índice CNPJ (CEAPS + CEAP)...");
      this.index = new Map();
      await this.indexarCeaps(this.index);
      await this.indexarCeap(this.index);
      await this.persistir(this.index, cachePath);
      logger.info(`Índice CNPJ: ${this.index.size} CNPJs indexados`);
      return this.index;
    }
  }

  private async indexarCeaps(map: Map<string, PagadorEntry[]>): Promise<void> {
    for (const ano of ANOS_CEAPS) {
      try {
        const cachePath = join(config.dataDir, "raw", `ceaps-${ano}.csv`);
        let csvText: string;
        try {
          csvText = await readFile(cachePath, "utf-8");
        } catch {
          const url = `${config.senadoCeapsUrl}/despesa_ceaps_${ano}.csv`;
          csvText = await fetchText(url, `CEAPS ${ano}`);
          await mkdir(join(config.dataDir, "raw"), { recursive: true });
          await writeFile(cachePath, csvText, "utf-8");
        }

        for (const row of csvToObjects(csvText)) {
          const cnpj = normalizeCnpj(row.CNPJ_CPF ?? "");
          if (!isCnpj(cnpj)) continue;
          this.addEntry(map, cnpj, {
            nome: row.SENADOR ?? "",
            fonte: "senado",
            totalGasto: parseValorBr(row.VALOR_REEMBOLSADO ?? "0"),
            tipoDespesa: row.TIPO_DESPESA ?? "",
          });
        }
        logger.info(`CEAPS ${ano} indexado`);
      } catch {
        // ano indisponível
      }
    }
  }

  private async indexarCeap(map: Map<string, PagadorEntry[]>): Promise<void> {
    for (const ano of ANOS_CEAP) {
      try {
        const csvText = await this.carregarCeapAno(ano);
        if (!csvText) continue;

        let count = 0;
        for (const row of csvToObjects(csvText)) {
          const cnpj = parseCnpjCeap(row.txtCNPJCPF ?? "");
          if (!cnpj || !isCnpj(cnpj)) continue;
          const nome = row.txNomeParlamentar ?? "";
          if (!nome || nome.startsWith("LID.")) continue;
          const dataEmissao = (row.datEmissao ?? "").slice(0, 10) || undefined;

          this.addEntry(map, cnpj, {
            nome,
            fonte: "camara",
            partido: row.sgPartido,
            uf: row.sgUF,
            totalGasto: parseValorBr(String(row.vlrLiquido ?? row.vlrDocumento ?? "0")),
            tipoDespesa: row.txtDescricao ?? "",
            dataEmissao,
          });
          count++;
        }
        logger.info(`CEAP ${ano} indexado (${count} linhas)`);
      } catch (error) {
        logger.debug(`CEAP ${ano} falhou: ${String(error)}`);
      }
    }
  }

  private async carregarCeapAno(ano: number): Promise<string | null> {
    const extractDir = join(config.dataDir, "raw", "ceap-extract");
    const csvPath = join(extractDir, `Ano-${ano}.csv`);
    const cacheCsv = join(config.dataDir, "raw", `ceap-${ano}.csv`);

    try {
      return await readFile(cacheCsv, "utf-8");
    } catch {
      // continue
    }

    try {
      return await readFile(csvPath, "utf-8");
    } catch {
      // download
    }

    if (!ANOS_CEAP_DOWNLOAD.includes(ano)) {
      return null;
    }

    const zipPath = join(config.dataDir, "raw", `ceap-${ano}.zip`);
    const url = `${config.camaraCeapUrl}/Ano-${ano}.csv.zip`;

    try {
      await mkdir(join(config.dataDir, "raw"), { recursive: true });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
      let zipBuffer: Buffer;
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) return null;
        zipBuffer = Buffer.from(await response.arrayBuffer());
      } finally {
        clearTimeout(timeout);
      }
      await writeFile(zipPath, zipBuffer);

      const zip = new AdmZip(zipBuffer);
      await mkdir(extractDir, { recursive: true });
      zip.extractAllTo(extractDir, true);

      const content = await readFile(csvPath, "utf-8");
      await writeFile(cacheCsv, content, "utf-8");
      return content;
    } catch (error) {
      logger.debug(`Download CEAP ${ano} falhou: ${String(error)}`);
      return null;
    }
  }

  private addEntry(
    map: Map<string, PagadorEntry[]>,
    cnpj: string,
    data: {
      nome: string;
      fonte: FonteDados;
      partido?: string;
      uf?: string;
      totalGasto: number;
      tipoDespesa: string;
      dataEmissao?: string;
    },
  ): void {
    const key = normalizeCnpj(cnpj);
    const nomeNorm = data.nome.trim();
    if (!nomeNorm) return;

    let entries = map.get(key);
    if (!entries) {
      entries = [];
      map.set(key, entries);
    }

    const existing = entries.find(
      (e) => e.fonte === data.fonte && normalizarNomePolitico(e.nome) === normalizarNomePolitico(nomeNorm),
    );

    if (existing) {
      existing.totalGasto += data.totalGasto;
      existing.quantidadeNotas += 1;
      if (data.tipoDespesa) existing.tiposDespesa.add(data.tipoDespesa);
      if (data.partido && data.partido !== "NA") existing.partido = data.partido;
      if (data.uf && data.uf !== "NA") existing.uf = data.uf;
      if (data.dataEmissao && (!existing.ultimaDespesa || data.dataEmissao > existing.ultimaDespesa)) {
        existing.ultimaDespesa = data.dataEmissao;
      }
    } else {
      entries.push({
        nome: nomeNorm,
        fonte: data.fonte,
        partido: data.partido,
        uf: data.uf,
        totalGasto: data.totalGasto,
        quantidadeNotas: 1,
        tiposDespesa: new Set(data.tipoDespesa ? [data.tipoDespesa] : []),
        ultimaDespesa: data.dataEmissao,
      });
    }
  }

  private serialize(index: Map<string, PagadorEntry[]>): Record<string, PagadorEntry[]> {
    const obj: Record<string, PagadorEntry[]> = {};
    for (const [k, v] of index) {
      obj[k] = v.map((e) => ({ ...e, tiposDespesa: e.tiposDespesa as unknown as Set<string> }));
      obj[k].forEach((e, i) => {
        (obj[k][i] as unknown as { tiposDespesa: string[] }).tiposDespesa = [...v[i].tiposDespesa];
      });
    }
    return obj;
  }

  private deserialize(obj: Record<string, PagadorEntry[]>): Map<string, PagadorEntry[]> {
    const map = new Map<string, PagadorEntry[]>();
    for (const [k, v] of Object.entries(obj)) {
      map.set(
        k,
        v.map((e) => ({
          ...e,
          tiposDespesa: new Set(Array.isArray(e.tiposDespesa) ? e.tiposDespesa : []),
        })),
      );
    }
    return map;
  }

  private async persistir(map: Map<string, PagadorEntry[]>, path: string): Promise<void> {
    const serialized: Record<string, Array<Omit<PagadorEntry, "tiposDespesa"> & { tiposDespesa: string[] }>> = {};
    for (const [k, v] of map) {
      serialized[k] = v.map((e) => ({ ...e, tiposDespesa: [...e.tiposDespesa] }));
    }
    const data: CnpjIndexData = {
      geradoEm: new Date().toISOString(),
      versao: INDEX_VERSION,
      totalCnpjs: map.size,
      index: serialized as unknown as Record<string, PagadorEntry[]>,
    };
    await mkdir(join(config.dataDir, "raw"), { recursive: true });
    await writeFile(path, JSON.stringify(data), "utf-8");
  }
}

export const cnpjIndex = new CnpjIndexService();
