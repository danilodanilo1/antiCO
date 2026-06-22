import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../../config/env.js";
import type { Politico } from "../../types/politico.js";
import { formatPoliticoId } from "../../types/politico.js";
import { csvToObjects } from "../../utils/csv.js";
import { ensureDir } from "../../utils/files.js";
import { fetchJson, fetchText } from "../../utils/http.js";
import { logger } from "../../utils/logger.js";
import { normalizarNomePolitico } from "../shared/despesas-processor.js";

interface SenadorLegisApi {
  IdentificacaoParlamentar: {
    CodigoParlamentar: string;
    NomeParlamentar: string;
    NomeCompletoParlamentar: string;
    SiglaPartidoParlamentar?: string;
    UfParlamentar?: string;
    UrlFotoParlamentar?: string;
  };
}

interface SenadorIndexEntry {
  codigo: string;
  nome: string;
  nomeCompleto: string;
  partido: string;
  uf: string;
  ativo: boolean;
  falecido?: boolean;
}

const LEGISLATURAS_HISTORICO = [54, 55, 56, 57];
const ANOS_CEAPS = Array.from({ length: 17 }, (_, i) => 2009 + i);

function formatarNome(nome: string): string {
  return nome
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function scoreMatch(entry: SenadorIndexEntry, alvo: string): number {
  const nome = normalizarNomePolitico(entry.nome);
  const completo = normalizarNomePolitico(entry.nomeCompleto);
  if (nome === alvo || completo === alvo) return 100;
  if (nome.includes(alvo) || alvo.includes(nome)) return 75;
  if (completo.includes(alvo) || alvo.includes(completo)) return 65;
  const tokens = alvo.split(" ").filter((t) => t.length > 2);
  const matched = tokens.filter((t) => nome.includes(t) || completo.includes(t)).length;
  return matched > 0 ? 35 + matched * 12 : 0;
}

function mapEntry(e: SenadorIndexEntry): Politico {
  let titulo: string | undefined;
  if (e.falecido) titulo = "Ex-senador (falecido)";
  else if (!e.ativo) titulo = "Ex-senador";

  return {
    id: formatPoliticoId("senado", e.codigo),
    nome: formatarNome(e.nome),
    siglaPartido: e.partido || "—",
    siglaUf: e.uf || "—",
    cargo: "senador",
    fonte: "senado",
    titulo,
    urlFoto: e.codigo
      ? `http://www.senado.leg.br/senadores/img/fotos-oficiais/senador${e.codigo}.jpg`
      : undefined,
  };
}

export class SenadoresIndexService {
  private cache: SenadorIndexEntry[] | null = null;

  async ensureLoaded(): Promise<void> {
    await this.carregar();
  }

  async buscar(nome: string, limit = 15): Promise<Politico[]> {
    const lista = await this.carregar();
    const alvo = normalizarNomePolitico(nome);
    if (alvo.length < 2) return [];

    return lista
      .map((e) => ({ e, score: scoreMatch(e, alvo) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => mapEntry(x.e));
  }

  private async carregar(): Promise<SenadorIndexEntry[]> {
    if (this.cache) return this.cache;

    const cachePath = join(config.dataDir, "raw", "senadores-index.json");

    try {
      const raw = await readFile(cachePath, "utf-8");
      this.cache = JSON.parse(raw) as SenadorIndexEntry[];
      logger.debug(`Índice de senadores: ${this.cache.length} registros (cache local)`);
      return this.cache;
    } catch {
      logger.info("Construindo índice de senadores (atual + histórico + CEAPS)...");
      const map = new Map<string, SenadorIndexEntry>();

      await this.carregarAtuais(map);
      await this.carregarLegislaturas(map);
      await this.carregarCeaps(map);

      this.cache = Array.from(map.values());
      await ensureDir(join(config.dataDir, "raw"));
      const { writeFile } = await import("node:fs/promises");
      await writeFile(cachePath, JSON.stringify(this.cache, null, 2), "utf-8");
      logger.info(`Índice de senadores: ${this.cache.length} registros`);
      return this.cache;
    }
  }

  private async carregarAtuais(map: Map<string, SenadorIndexEntry>): Promise<void> {
    try {
      const url = `${config.senadoLegisUrl}/senador/lista/atual`;
      const data = await fetchJson<{
        ListaParlamentarEmExercicio: { Parlamentares: { Parlamentar: SenadorLegisApi[] } };
      }>(url, "Senado atual");

      for (const s of data.ListaParlamentarEmExercicio.Parlamentares.Parlamentar) {
        this.addLegis(map, s, true);
      }
    } catch (error) {
      logger.warn(`Senadores atuais indisponíveis: ${String(error)}`);
    }
  }

  private async carregarLegislaturas(map: Map<string, SenadorIndexEntry>): Promise<void> {
    for (const leg of LEGISLATURAS_HISTORICO) {
      try {
        const url = `${config.senadoLegisUrl}/senador/lista/legislatura/${leg}`;
        const data = await fetchJson<{
          ListaParlamentarLegislatura: { Parlamentares: { Parlamentar: SenadorLegisApi[] } };
        }>(url, `Senado leg ${leg}`);

        for (const s of data.ListaParlamentarLegislatura.Parlamentares.Parlamentar) {
          this.addLegis(map, s, false);
        }
      } catch (error) {
        logger.debug(`Legislatura ${leg} indisponível: ${String(error)}`);
      }
    }
  }

  private addLegis(map: Map<string, SenadorIndexEntry>, s: SenadorLegisApi, ativo: boolean): void {
    const id = s.IdentificacaoParlamentar.CodigoParlamentar;
    const existing = map.get(id);
    map.set(id, {
      codigo: id,
      nome: s.IdentificacaoParlamentar.NomeParlamentar,
      nomeCompleto: s.IdentificacaoParlamentar.NomeCompletoParlamentar,
      partido: s.IdentificacaoParlamentar.SiglaPartidoParlamentar ?? existing?.partido ?? "—",
      uf: s.IdentificacaoParlamentar.UfParlamentar ?? existing?.uf ?? "—",
      ativo: existing?.ativo || ativo,
    });
  }

  private async carregarCeaps(map: Map<string, SenadorIndexEntry>): Promise<void> {
    const nomesCeaps = new Set<string>();

    for (const ano of ANOS_CEAPS) {
      try {
        const cachePath = join(config.dataDir, "raw", `ceaps-${ano}.csv`);
        let csvText: string;
        try {
          csvText = await readFile(cachePath, "utf-8");
        } catch {
          const url = `${config.senadoCeapsUrl}/despesa_ceaps_${ano}.csv`;
          csvText = await fetchText(url, `CEAPS ${ano}`);
          await ensureDir(join(config.dataDir, "raw"));
          const { writeFile } = await import("node:fs/promises");
          await writeFile(cachePath, csvText, "utf-8");
        }

        for (const row of csvToObjects(csvText)) {
          if (row.SENADOR) nomesCeaps.add(row.SENADOR);
        }
      } catch {
        // ano pode não existir
      }
    }

    for (const nomeCeaps of nomesCeaps) {
      const normalizado = normalizarNomePolitico(nomeCeaps);
      const jaExiste = [...map.values()].some(
        (e) => normalizarNomePolitico(e.nome) === normalizado,
      );
      if (jaExiste) continue;

      const slug = normalizado.replace(/\s+/g, "-");
      map.set(`ceaps-${slug}`, {
        codigo: slug,
        nome: nomeCeaps,
        nomeCompleto: nomeCeaps,
        partido: "—",
        uf: "—",
        ativo: false,
      });
    }
  }
}

export const senadoresIndex = new SenadoresIndexService();
