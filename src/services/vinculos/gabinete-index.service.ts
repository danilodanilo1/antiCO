import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../../config/env.js";
import type { VinculoGabinete } from "../../types/empresa.js";
import { csvToObjects } from "../../utils/csv.js";
import { logger } from "../../utils/logger.js";
import { normalizarNomeCompleto } from "./gabinete-parser.js";

/**
 * Índice de servidores de gabinete parlamentar, lido de `data/gabinete/servidores.csv`
 * (gerado por `npm run coletar:gabinete`). Separador ";" com colunas:
 * nome;parlamentar;cargo;periodo;fonte;url
 *
 * O vínculo só é apontado quando o NOME COMPLETO é idêntico (sem acentos) e tem
 * pelo menos 3 palavras. Não há casamento por primeiro nome ou por partes do nome:
 * isso marcava qualquer "Luis Fernando" do país.
 */
export const MIN_PALAVRAS_NOME = 3;

interface ServidorGabinete extends VinculoGabinete {
  chave: string;
}

export class GabineteIndexService {
  private porNome: Map<string, ServidorGabinete[]> | null = null;

  constructor(private readonly arquivo = join(config.dataDir, "gabinete", "servidores.csv")) {}

  async ensureLoaded(): Promise<void> {
    await this.carregar();
  }

  /** Carrega a partir de uma lista (usado em testes e na ingestão). */
  carregarLista(lista: VinculoGabinete[]): void {
    this.porNome = new Map();
    for (const s of lista) this.adicionar(s);
  }

  async buscarVinculos(nomeSocio: string): Promise<VinculoGabinete[]> {
    const idx = await this.carregar();
    const chave = normalizarNomeCompleto(nomeSocio);
    if (chave.split(" ").length < MIN_PALAVRAS_NOME) return [];
    return (idx.get(chave) ?? []).map(({ chave: _chave, ...v }) => v);
  }

  get total(): number {
    let n = 0;
    for (const v of this.porNome?.values() ?? []) n += v.length;
    return n;
  }

  private adicionar(s: VinculoGabinete): void {
    const chave = normalizarNomeCompleto(s.nomeServidor);
    if (!chave || !this.porNome) return;
    const lista = this.porNome.get(chave) ?? [];
    lista.push({ ...s, chave });
    this.porNome.set(chave, lista);
  }

  private async carregar(): Promise<Map<string, ServidorGabinete[]>> {
    if (this.porNome) return this.porNome;
    this.porNome = new Map();
    try {
      const csv = await readFile(this.arquivo, "utf-8");
      for (const row of csvToObjects(csv)) {
        if (!row.nome || !row.parlamentar) continue;
        this.adicionar({
          nomeServidor: row.nome,
          parlamentar: row.parlamentar,
          cargo: row.cargo || undefined,
          periodo: row.periodo || undefined,
          fonte: row.fonte || "Câmara dos Deputados, pessoal de gabinete",
          url: row.url || undefined,
        });
      }
      logger.info(`Índice de gabinetes: ${this.total} registros`);
    } catch {
      logger.warn(
        `Índice de gabinetes vazio (${this.arquivo} não encontrado). Rode "npm run coletar:gabinete" para ativar o sinal SOCIO_SERVIDOR_GABINETE.`,
      );
    }
    return this.porNome;
  }
}

export const gabineteIndex = new GabineteIndexService();
