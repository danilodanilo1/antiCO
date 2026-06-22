import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../../config/env.js";
import type { Politico } from "../../types/politico.js";
import { formatPoliticoId } from "../../types/politico.js";
import { ensureDir } from "../../utils/files.js";
import { fetchText } from "../../utils/http.js";
import { logger } from "../../utils/logger.js";
import { normalizarNomePolitico } from "../shared/despesas-processor.js";

interface DeputadoJson {
  uri: string;
  nome: string;
  nomeCivil?: string;
  idLegislaturaInicial?: number;
  idLegislaturaFinal?: number;
  dataFalecimento?: string;
}

const DEPUTADOS_URL = "https://dadosabertos.camara.leg.br/arquivos/deputados/json/deputados.json";
const LEGISLATURA_ATUAL = 57;

function extractId(uri: string): string {
  return uri.split("/").filter(Boolean).pop() ?? "";
}

function mapDeputadoJson(d: DeputadoJson): Politico {
  const id = extractId(d.uri);
  const falecido = Boolean(d.dataFalecimento);
  const exParlamentar = (d.idLegislaturaFinal ?? 0) < LEGISLATURA_ATUAL || falecido;

  return {
    id: formatPoliticoId("camara", id),
    nome: d.nome,
    siglaPartido: "—",
    siglaUf: "—",
    cargo: "deputado_federal",
    fonte: "camara",
    titulo: falecido ? "Ex-deputado (falecido)" : exParlamentar ? "Ex-deputado" : undefined,
    urlFoto: id ? `https://www.camara.leg.br/internet/deputado/bandep/${id}.jpg` : undefined,
  };
}

function scoreMatch(entry: DeputadoJson, alvo: string): number {
  const nome = normalizarNomePolitico(entry.nome);
  const civil = normalizarNomePolitico(entry.nomeCivil ?? "");
  if (nome === alvo || civil === alvo) return 100;
  if (nome.startsWith(alvo) || alvo.startsWith(nome)) return 80;
  if (nome.includes(alvo) || alvo.includes(nome)) return 70;
  if (civil.includes(alvo) || alvo.includes(civil)) return 60;
  const tokens = alvo.split(" ").filter((t) => t.length > 2);
  const matched = tokens.filter((t) => nome.includes(t) || civil.includes(t)).length;
  return matched > 0 ? 40 + matched * 10 : 0;
}

export class DeputadosIndexService {
  private cache: DeputadoJson[] | null = null;

  async ensureLoaded(): Promise<void> {
    await this.carregar();
  }

  async buscar(nome: string, limit = 15): Promise<Politico[]> {
    const lista = await this.carregar();
    const alvo = normalizarNomePolitico(nome);
    if (alvo.length < 2) return [];

    const scored = lista
      .map((d) => ({ d, score: scoreMatch(d, alvo) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map((x) => mapDeputadoJson(x.d));
  }

  private async carregar(): Promise<DeputadoJson[]> {
    if (this.cache) return this.cache;

    const cachePath = join(config.dataDir, "raw", "deputados-all.json");

    try {
      const raw = await readFile(cachePath, "utf-8");
      this.cache = this.parseLista(JSON.parse(raw));
      logger.debug(`Índice de deputados: ${this.cache.length} registros (cache local)`);
      return this.cache;
    } catch {
      logger.info("Baixando índice completo de deputados (histórico)...");
      const text = await fetchText(DEPUTADOS_URL, "Deputados JSON");
      await ensureDir(join(config.dataDir, "raw"));
      const { writeFile } = await import("node:fs/promises");
      await writeFile(cachePath, text, "utf-8");
      this.cache = this.parseLista(JSON.parse(text));
      logger.info(`Índice de deputados: ${this.cache.length} registros`);
      return this.cache;
    }
  }

  private parseLista(data: unknown): DeputadoJson[] {
    if (Array.isArray(data)) return data as DeputadoJson[];
    const obj = data as { dados?: DeputadoJson[] };
    return obj.dados ?? [];
  }
}

export const deputadosIndex = new DeputadosIndexService();
