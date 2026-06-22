import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../../config/env.js";
import { ensureDir } from "../../utils/files.js";
import { logger } from "../../utils/logger.js";
import { normalizarNomePolitico } from "../shared/despesas-processor.js";
import { CamaraClient } from "../camara/client.js";

export interface AssessorEntry {
  nome: string;
  nomeNormalizado: string;
  politico: string;
  cargo?: string;
  fonte: "camara" | "seed";
}

interface AssessoresCache {
  geradoEm: string;
  total: number;
  assessores: AssessorEntry[];
}

const SEED_ASSESSORES: AssessorEntry[] = [
  { nome: "Amelia", nomeNormalizado: "amelia", politico: "Telhada", cargo: "ex-secretária", fonte: "seed" },
  { nome: "Luis Fernando", nomeNormalizado: "luis fernando", politico: "Major Olímpio", cargo: "ex-secretário", fonte: "seed" },
];

export class AssessoresIndexService {
  private assessores: AssessorEntry[] | null = null;

  async ensureLoaded(): Promise<void> {
    await this.carregar();
  }

  async buscarVinculos(nomeSocio: string): Promise<string[]> {
    const idx = await this.carregar();
    const alvo = normalizarNomePolitico(nomeSocio);
    const tokens = alvo.split(" ").filter((t) => t.length > 2);

    const matches: string[] = [];
    for (const a of idx) {
      if (a.nomeNormalizado === alvo) {
        matches.push(`${a.nome} — ${a.cargo ?? "assessor"} de ${a.politico}`);
        continue;
      }
      const matchedTokens = tokens.filter((t) => a.nomeNormalizado.includes(t)).length;
      if (matchedTokens >= 2 || (tokens.length === 1 && a.nomeNormalizado.includes(tokens[0]!))) {
        matches.push(`${a.nome} — ${a.cargo ?? "assessor"} de ${a.politico}`);
      }
    }
    return matches;
  }

  private async carregar(): Promise<AssessorEntry[]> {
    if (this.assessores) return this.assessores;

    const cachePath = join(config.dataDir, "raw", "assessores-index.json");
    try {
      const raw = await readFile(cachePath, "utf-8");
      const data = JSON.parse(raw) as AssessoresCache;
      this.assessores = data.assessores;
      logger.info(`Índice assessores: ${this.assessores.length} entradas (cache)`);
      return this.assessores;
    } catch {
      logger.info("Construindo índice de assessores (Câmara)...");
      this.assessores = [...SEED_ASSESSORES];
      await this.indexarCamara(this.assessores);
      await this.persistir(this.assessores, cachePath);
      return this.assessores;
    }
  }

  private async indexarCamara(list: AssessorEntry[]): Promise<void> {
    const client = new CamaraClient();
    try {
      const deputados = await client.getAllPages<{ id: number; nome: string; siglaUf: string; siglaPartido: string }>(
        "/deputados",
        { ordem: "ASC", ordenarPor: "nome" },
      );

      for (const dep of deputados.slice(0, 200)) {
        try {
          const resp = await client.get<{ dados: Array<{ titulo: string; descricao?: string }> }>(
            `/deputados/${dep.id}/ocupacoes`,
          );
          for (const o of resp.dados ?? []) {
            const titulo = (o.titulo ?? "").toLowerCase();
            if (titulo.includes("assessor") || titulo.includes("secretário") || titulo.includes("secretario")) {
              const nome = o.descricao ?? o.titulo;
              if (nome && nome.length > 3) {
                list.push({
                  nome,
                  nomeNormalizado: normalizarNomePolitico(nome),
                  politico: dep.nome,
                  cargo: o.titulo,
                  fonte: "camara",
                });
              }
            }
          }
        } catch {
          // deputado sem ocupações públicas
        }
      }
    } catch (error) {
      logger.debug(`Falha ao indexar assessores Câmara: ${String(error)}`);
    }
  }

  private async persistir(list: AssessorEntry[], path: string): Promise<void> {
    await ensureDir(join(config.dataDir, "raw"));
    const data: AssessoresCache = {
      geradoEm: new Date().toISOString(),
      total: list.length,
      assessores: list,
    };
    await writeFile(path, JSON.stringify(data), "utf-8");
    logger.info(`Índice assessores: ${list.length} entradas`);
  }
}

export const assessoresIndex = new AssessoresIndexService();
