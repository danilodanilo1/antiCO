import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../../config/env.js";
import type { Despesa } from "../../types/despesa.js";
import type { CargoPolitico, Politico } from "../../types/politico.js";
import { formatPoliticoId } from "../../types/politico.js";
import { csvToObjects, parseDataBr, parseValorBr } from "../../utils/csv.js";
import { ensureDir } from "../../utils/files.js";
import { fetchJson, fetchText } from "../../utils/http.js";
import { logger } from "../../utils/logger.js";
import { withRetry } from "../../utils/retry.js";
import { nomesPoliticoCompativeis, normalizarNomePolitico } from "../shared/despesas-processor.js";
import { senadoresIndex } from "../senado/senadores-index.service.js";
import type { PoliticoSource } from "./politico-source.js";

interface SenadorListaApi {
  IdentificacaoParlamentar: {
    CodigoParlamentar: string;
    NomeParlamentar: string;
    NomeCompletoParlamentar: string;
    SiglaPartidoParlamentar: string;
    UfParlamentar: string;
    UrlFotoParlamentar?: string;
    MembroMesa?: string;
  };
}

interface MesaSenadoApi {
  MesaSenado: {
    Colegiados: {
      Colegiado: Array<{
        Cargos: {
          Cargo: Array<{
            Cargo: string | string[];
            NomeParlamentar: string;
            Bancada?: string;
            Http: string;
          }>;
        };
      }>;
    };
  };
}

function mapCargoMesaSenado(cargo: string): CargoPolitico {
  const c = cargo.toUpperCase();
  if (c.includes("PRESIDENTE") && !c.includes("VICE")) return "presidente_senado";
  if (c.includes("VICE")) return "vice_presidente_senado";
  return "secretario_senado";
}

function parseBancada(bancada?: string): { partido: string; uf: string } {
  const match = bancada?.match(/\(([^-]+)-([A-Z]{2})\)/);
  return {
    partido: match?.[1]?.trim() ?? "N/A",
    uf: match?.[2]?.trim() ?? "N/A",
  };
}

function formatarNomeCeaps(nome: string): string {
  return nome
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join(" ");
}

function mapSenador(s: SenadorListaApi, cargo: CargoPolitico = "senador", titulo?: string): Politico {
  const id = s.IdentificacaoParlamentar.CodigoParlamentar;
  return {
    id: formatPoliticoId("senado", id),
    nome: s.IdentificacaoParlamentar.NomeParlamentar,
    siglaPartido: s.IdentificacaoParlamentar.SiglaPartidoParlamentar,
    siglaUf: s.IdentificacaoParlamentar.UfParlamentar,
    cargo,
    fonte: "senado",
    titulo,
    urlFoto: s.IdentificacaoParlamentar.UrlFotoParlamentar,
  };
}

function mapSenadorCeaps(nomeCeaps: string): Politico {
  const slug = normalizarNomePolitico(nomeCeaps).replace(/\s+/g, "-");
  return {
    id: formatPoliticoId("senado", slug),
    nome: formatarNomeCeaps(nomeCeaps),
    siglaPartido: "N/A",
    siglaUf: "N/A",
    cargo: "senador",
    fonte: "senado",
  };
}

export class SenadoSource implements PoliticoSource {
  readonly fonte = "senado" as const;
  private senadoresCache: Politico[] | null = null;
  private ceapsCache = new Map<number, Despesa[]>();

  async buscarPorNome(nome: string): Promise<Politico[]> {
    const indexResults = await senadoresIndex.buscar(nome, 15);

    let legisResults: Politico[] = [];
    try {
      const todos = await this.listarSenadoresLegis();
      const alvo = normalizarNomePolitico(nome);
      legisResults = todos.filter(
        (s) =>
          normalizarNomePolitico(s.nome) === alvo ||
          normalizarNomePolitico(s.nome).includes(alvo) ||
          alvo.includes(normalizarNomePolitico(s.nome)),
      );
    } catch (error) {
      logger.warn(`Lista legislativa do Senado indisponível: ${String(error)}`);
    }

    const ceapsResults = await this.buscarPorNomeCeaps(nome);

    const map = new Map<string, Politico>();
    for (const p of [...indexResults, ...legisResults, ...ceapsResults]) {
      if (!map.has(p.id)) map.set(p.id, p);
    }
    return Array.from(map.values());
  }

  async buscarMesaDiretora(): Promise<Politico[]> {
    const url = `${config.senadoLegisUrl}/composicao/mesaSF`;
    logger.debug(`GET ${url}`);

    const response = await withRetry(
      () => fetchJson<MesaSenadoApi>(url, "Senado mesaSF"),
      "Senado mesaSF",
    );

    const cargos = response.MesaSenado.Colegiados.Colegiado[0]?.Cargos.Cargo ?? [];

    return cargos.map((c) => {
      const titulo = Array.isArray(c.Cargo) ? c.Cargo[0] : c.Cargo;
      const { partido, uf } = parseBancada(c.Bancada);
      const nome = c.NomeParlamentar.replace(/^Senador(a)?\s+/i, "");

      return {
        id: formatPoliticoId("senado", c.Http),
        nome,
        siglaPartido: partido,
        siglaUf: uf,
        cargo: mapCargoMesaSenado(titulo),
        fonte: "senado" as const,
        titulo,
      };
    });
  }

  async buscarDespesas(politico: Politico, ano?: number): Promise<Despesa[]> {
    if (ano) {
      const todas = await this.carregarCeaps(ano);
      return this.filtrarPorPolitico(todas, politico);
    }

    const anos = Array.from({ length: 17 }, (_, i) => 2025 - i);
    const todas: Despesa[] = [];
    for (const a of anos) {
      try {
        const anoDespesas = await this.carregarCeaps(a);
        todas.push(...this.filtrarPorPolitico(anoDespesas, politico));
      } catch {
        // ano indisponível
      }
    }
    return todas;
  }

  private filtrarPorPolitico(despesas: Despesa[], politico: Politico): Despesa[] {
    return despesas.filter((d) => {
      const meta = d as Despesa & { _senador?: string };
      return meta._senador ? nomesPoliticoCompativeis(meta._senador, politico.nome) : false;
    });
  }

  private async buscarPorNomeCeaps(nome: string, ano?: number): Promise<Politico[]> {
    const despesas = await this.carregarCeaps(ano ?? new Date().getFullYear());
    const nomesUnicos = new Set<string>();

    for (const d of despesas) {
      const meta = d as Despesa & { _senador?: string };
      if (meta._senador) nomesUnicos.add(meta._senador);
    }

    const alvo = normalizarNomePolitico(nome);
    return [...nomesUnicos]
      .filter(
        (n) =>
          normalizarNomePolitico(n) === alvo ||
          normalizarNomePolitico(n).includes(alvo) ||
          alvo.includes(normalizarNomePolitico(n)),
      )
      .map(mapSenadorCeaps);
  }

  private async listarSenadoresLegis(): Promise<Politico[]> {
    if (this.senadoresCache) return this.senadoresCache;

    const url = `${config.senadoLegisUrl}/senador/lista/atual`;
    logger.debug(`GET ${url}`);

    const response = await fetchJson<{
      ListaParlamentarEmExercicio: { Parlamentares: { Parlamentar: SenadorListaApi[] } };
    }>(url, "Senado lista");

    const lista = response.ListaParlamentarEmExercicio.Parlamentares.Parlamentar;
    this.senadoresCache = lista.map((s) => mapSenador(s));
    return this.senadoresCache;
  }

  private async carregarCeaps(ano: number): Promise<Despesa[]> {
    if (this.ceapsCache.has(ano)) return this.ceapsCache.get(ano)!;

    const cachePath = join(config.dataDir, "raw", `ceaps-${ano}.csv`);
    let csvText: string;

    try {
      csvText = await readFile(cachePath, "utf-8");
      logger.debug(`CEAPS ${ano} carregado do cache local`);
    } catch {
      const url = `${config.senadoCeapsUrl}/despesa_ceaps_${ano}.csv`;
      logger.info(`Baixando CEAPS ${ano} do Senado...`);

      csvText = await withRetry(() => fetchText(url, `CEAPS ${ano}`), `CEAPS ${ano}`);

      await ensureDir(join(config.dataDir, "raw"));
      const { writeFile } = await import("node:fs/promises");
      await writeFile(cachePath, csvText, "utf-8");
    }

    const allRows = csvToObjects(csvText);
    const rows = allRows.filter((r) => r.ANO && r.SENADOR);
    const despesas: Despesa[] = [];

    for (const row of rows) {
      if (!row.SENADOR || !row.VALOR_REEMBOLSADO) continue;

      const dataParsed = parseDataBr(row.DATA ?? "");
      const anoRow = Number(row.ANO) || dataParsed?.ano || ano;
      const mesRow = Number(row.MES) || dataParsed?.mes || 1;

      const despesa: Despesa & { _senador: string } = {
        ano: anoRow,
        mes: mesRow,
        tipoDespesa: row.TIPO_DESPESA ?? "",
        codTipoDespesa: 0,
        codDocumento: Number(row.COD_DOCUMENTO) || 0,
        tipoDocumento: "CEAPS",
        dataDocumento: row.DATA ?? "",
        numDocumento: row.DOCUMENTO ?? "",
        valorDocumento: parseValorBr(row.VALOR_REEMBOLSADO),
        nomeFornecedor: row.FORNECEDOR ?? "",
        cnpjCpfFornecedor: row.CNPJ_CPF ?? "",
        _senador: row.SENADOR,
      };

      despesas.push(despesa);
    }

    this.ceapsCache.set(ano, despesas);
    logger.info(`CEAPS ${ano}: ${despesas.length} despesas carregadas`);
    return despesas;
  }
}

export function filtrarMelhorMatchSenado(resultados: Politico[], nome: string): Politico | null {
  if (resultados.length === 0) return null;
  const alvo = normalizarNomePolitico(nome);
  const exato = resultados.find((p) => normalizarNomePolitico(p.nome) === alvo);
  if (exato) return exato;
  if (resultados.length === 1) return resultados[0];
  return null;
}
