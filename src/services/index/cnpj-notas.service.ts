import { readFile } from "node:fs/promises";
import { join } from "node:path";
import AdmZip from "adm-zip";
import { mkdir, writeFile } from "node:fs/promises";
import { config } from "../../config/env.js";
import type { FonteDados } from "../../types/politico.js";
import type { NotaPagador } from "../../types/empresa.js";
import { csvToObjects, parseValorBr, parseDataBr } from "../../utils/csv.js";
import { normalizeCnpj, isCnpj, parseCnpjCeap, cnpjMatchesQuery, csvContemCnpj } from "../../utils/cnpj.js";
import { logger } from "../../utils/logger.js";
import { normalizarNomePolitico } from "../shared/despesas-processor.js";

const ANOS_CEAPS = Array.from({ length: 18 }, (_, i) => 2009 + i);
const ANOS_CEAP = Array.from({ length: 18 }, (_, i) => 2008 + i);
const ANOS_CEAP_DOWNLOAD = Array.from({ length: 6 }, (_, i) => 2020 + i);

function urlSenado(codDocumento: string): string | undefined {
  if (!codDocumento || codDocumento === "0") return undefined;
  return `https://www.senado.gov.br/transparencia/LAI/verba/despesa/${codDocumento}`;
}

function parseDataIso(raw: string): string {
  if (!raw) return "";
  if (raw.includes("T")) return raw.slice(0, 10);
  const br = parseDataBr(raw);
  if (br) return `${br.ano}-${String(br.mes).padStart(2, "0")}-${String(br.dia).padStart(2, "0")}`;
  return raw;
}

export class CnpjNotasService {
  private cache = new Map<string, NotaPagador[]>();

  async buscarNotas(cnpj: string, politicoNome: string, fonte?: FonteDados): Promise<NotaPagador[]> {
    const key = `${normalizeCnpj(cnpj)}:${normalizarNomePolitico(politicoNome)}:${fonte ?? "all"}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const alvo = normalizarNomePolitico(politicoNome);
    const notas: NotaPagador[] = [];

    if (!fonte || fonte === "camara") {
      notas.push(...(await this.buscarCeap(cnpj, alvo)));
    }
    if (!fonte || fonte === "senado") {
      notas.push(...(await this.buscarCeaps(cnpj, alvo)));
    }

    notas.sort((a, b) => b.data.localeCompare(a.data));
    this.cache.set(key, notas);
    return notas;
  }

  private async buscarCeap(cnpj: string, politico: string): Promise<NotaPagador[]> {
    const anos = [...ANOS_CEAP].reverse();
    const chunks = await Promise.all(
      anos.map(async (ano) => {
        const csvText = await this.carregarCeapAno(ano, false);
        if (!csvText || !csvContemCnpj(csvText, cnpj)) return [] as NotaPagador[];

        const notas: NotaPagador[] = [];
        for (const row of csvToObjects(csvText)) {
          const rowCnpj = parseCnpjCeap(row.txtCNPJCPF ?? "");
          if (!rowCnpj || !cnpjMatchesQuery(cnpj, rowCnpj)) continue;
          const nome = row.txNomeParlamentar ?? "";
          if (!nome || normalizarNomePolitico(nome) !== politico) continue;

          const url = (row.urlDocumento ?? "").trim();
          notas.push({
            data: parseDataIso(row.datEmissao ?? ""),
            valor: parseValorBr(String(row.vlrLiquido ?? row.vlrDocumento ?? "0")),
            numeroDocumento: row.txtNumero || row.ideDocumento,
            tipoDespesa: row.txtDescricao ?? "",
            urlDocumento: url || undefined,
            fonteDado: `CEAP Câmara ${row.numAno ?? ano}`,
            ano: Number(row.numAno) || ano,
            mes: Number(row.numMes) || undefined,
          });
        }
        return notas;
      }),
    );
    return chunks.flat();
  }

  private async buscarCeaps(cnpj: string, politico: string): Promise<NotaPagador[]> {
    const anos = [...ANOS_CEAPS].reverse();
    const chunks = await Promise.all(
      anos.map(async (ano) => {
        try {
          const cachePath = join(config.dataDir, "raw", `ceaps-${ano}.csv`);
          let csvText: string;
          try {
            csvText = await readFile(cachePath, "utf-8");
          } catch {
            return [] as NotaPagador[];
          }
          if (!csvContemCnpj(csvText, cnpj)) return [] as NotaPagador[];

          const notas: NotaPagador[] = [];
          for (const row of csvToObjects(csvText)) {
            const rowCnpj = normalizeCnpj(row.CNPJ_CPF ?? "");
            if (!isCnpj(rowCnpj) || !cnpjMatchesQuery(cnpj, rowCnpj)) continue;
            const nome = row.SENADOR ?? "";
            if (!nome || normalizarNomePolitico(nome) !== politico) continue;

            const cod = row.COD_DOCUMENTO ?? "";
            notas.push({
              data: parseDataIso(row.DATA ?? ""),
              valor: parseValorBr(row.VALOR_REEMBOLSADO ?? "0"),
              numeroDocumento: row.DOCUMENTO,
              tipoDespesa: row.TIPO_DESPESA ?? "",
              urlDocumento: urlSenado(cod),
              fonteDado: `CEAPS Senado ${row.ANO ?? ano}`,
              ano: Number(row.ANO) || ano,
              mes: Number(row.MES) || undefined,
            });
          }
          return notas;
        } catch {
          return [] as NotaPagador[];
        }
      }),
    );
    return chunks.flat();
  }

  private async carregarCeapAno(ano: number, allowDownload = false): Promise<string | null> {
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
    if (!allowDownload || !ANOS_CEAP_DOWNLOAD.includes(ano)) return null;

    const zipPath = join(config.dataDir, "raw", `ceap-${ano}.zip`);
    const url = `${config.camaraCeapUrl}/Ano-${ano}.csv.zip`;
    try {
      await mkdir(join(config.dataDir, "raw"), { recursive: true });
      const response = await fetch(url);
      if (!response.ok) return null;
      const zipBuffer = Buffer.from(await response.arrayBuffer());
      await writeFile(zipPath, zipBuffer);
      const zip = new AdmZip(zipBuffer);
      await mkdir(extractDir, { recursive: true });
      zip.extractAllTo(extractDir, true);
      const content = await readFile(csvPath, "utf-8");
      await writeFile(cacheCsv, content, "utf-8");
      return content;
    } catch (error) {
      logger.debug(`CEAP ${ano} notas: ${String(error)}`);
      return null;
    }
  }
}

export const cnpjNotas = new CnpjNotasService();
