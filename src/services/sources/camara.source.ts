import { config } from "../../config/env.js";
import { CamaraClient } from "../camara/client.js";
import { deputadosIndex } from "../camara/deputados-index.service.js";
import type { Despesa } from "../../types/despesa.js";
import type { CargoPolitico, Politico } from "../../types/politico.js";
import { formatPoliticoId } from "../../types/politico.js";
import { logger } from "../../utils/logger.js";
import { normalizarNomePolitico } from "../shared/despesas-processor.js";
import type { PoliticoSource } from "./politico-source.js";

interface DeputadoApi {
  id: number;
  nome: string;
  siglaPartido: string;
  siglaUf: string;
  urlFoto?: string;
}

interface DespesaApi {
  ano: number;
  mes: number;
  tipoDespesa: string;
  codTipoDespesa: number;
  codDocumento: number;
  tipoDocumento: string;
  dataDocumento: string;
  numDocumento: string;
  valorDocumento: number;
  nomeFornecedor: string;
  cnpjCpfFornecedor: string;
  urlDocumento?: string;
}

interface MembroMesaApi {
  id: number;
  nome: string;
  siglaPartido: string;
  siglaUf: string;
  urlFoto?: string;
  titulo: string;
  codTitulo: number;
}

function mapCargoMesa(titulo: string): CargoPolitico {
  const t = titulo.toLowerCase();
  if (t.includes("presidente") && !t.includes("vice")) return "presidente_camara";
  if (t.includes("vice")) return "vice_presidente_camara";
  return "secretario_camara";
}

function mapDeputado(d: DeputadoApi, cargo: CargoPolitico = "deputado_federal", titulo?: string): Politico {
  return {
    id: formatPoliticoId("camara", d.id),
    nome: d.nome,
    siglaPartido: d.siglaPartido,
    siglaUf: d.siglaUf,
    cargo,
    fonte: "camara",
    titulo,
    urlFoto: d.urlFoto,
  };
}

function mapDespesa(d: DespesaApi): Despesa {
  return {
    ano: d.ano,
    mes: d.mes,
    tipoDespesa: d.tipoDespesa,
    codTipoDespesa: d.codTipoDespesa,
    codDocumento: d.codDocumento,
    tipoDocumento: d.tipoDocumento,
    dataDocumento: d.dataDocumento,
    numDocumento: d.numDocumento,
    valorDocumento: d.valorDocumento,
    nomeFornecedor: d.nomeFornecedor,
    cnpjCpfFornecedor: d.cnpjCpfFornecedor,
    urlDocumento: d.urlDocumento,
  };
}

export class CamaraSource implements PoliticoSource {
  readonly fonte = "camara" as const;

  constructor(private readonly client = new CamaraClient()) {}

  async buscarPorNome(nome: string): Promise<Politico[]> {
    const [indexResults, apiResults] = await Promise.all([
      deputadosIndex.buscar(nome, 15),
      this.client
        .get<{ dados: DeputadoApi[] }>("/deputados", { nome, ordem: "ASC", ordenarPor: "nome" })
        .then((r) => r.dados.map((d) => mapDeputado(d)))
        .catch(() => [] as Politico[]),
    ]);

    const map = new Map<string, Politico>();
    for (const p of [...indexResults, ...apiResults]) {
      if (!map.has(p.id)) map.set(p.id, p);
    }
    return Array.from(map.values());
  }

  async buscarMesaDiretora(): Promise<Politico[]> {
    const response = await this.client.get<{ dados: MembroMesaApi[] }>("/orgaos/4/membros");
    return response.dados.map((m) => mapDeputado(m, mapCargoMesa(m.titulo), m.titulo));
  }

  async buscarDespesas(politico: Politico, ano?: number): Promise<Despesa[]> {
    const deputadoId = politico.id.replace("camara:", "");

    const params: Record<string, string | number> = {};
    if (ano) params.ano = ano;

    const raw = await this.client.getAllPages<DespesaApi>(`/deputados/${deputadoId}/despesas`, params);
    logger.debug(`Câmara: ${raw.length} despesas para ${politico.nome}`);
    return raw.map(mapDespesa);
  }
}

export function filtrarMelhorMatchCamara(resultados: Politico[], nome: string): Politico | null {
  if (resultados.length === 0) return null;
  const alvo = normalizarNomePolitico(nome);
  const exato = resultados.find((p) => normalizarNomePolitico(p.nome) === alvo);
  if (exato) return exato;
  if (resultados.length === 1) return resultados[0];
  return null;
}
