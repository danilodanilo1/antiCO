import { config } from "../../config/env.js";
import type { Despesa, FornecedorAgrupado, TipoDespesa } from "../../types/despesa.js";
import { isCnpj, normalizeCnpj } from "../../utils/cnpj.js";
import { CamaraClient } from "./client.js";

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

interface TipoDespesaApi {
  cod: number;
  nome: string;
  descricao?: string;
}

export class DespesasService {
  constructor(private readonly client = new CamaraClient()) {}

  async listarTiposDespesa(): Promise<TipoDespesa[]> {
    const response = await this.client.get<{ dados: TipoDespesaApi[] }>(
      "/referencias/deputados/tipoDespesa",
    );
    return response.dados;
  }

  async buscarDespesas(deputadoId: number, ano?: number): Promise<Despesa[]> {
    const params: Record<string, string | number> = {};
    if (ano) params.ano = ano;

    const raw = await this.client.getAllPages<DespesaApi>(
      `/deputados/${deputadoId}/despesas`,
      params,
    );

    return raw.map((d) => ({
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
    }));
  }

  filtrarPorTipo(despesas: Despesa[], tipoFiltro: string): Despesa[] {
    const filtro = tipoFiltro.toLowerCase();
    return despesas.filter((d) => d.tipoDespesa.toLowerCase().includes(filtro));
  }

  agruparPorFornecedor(despesas: Despesa[]): FornecedorAgrupado[] {
    const map = new Map<string, FornecedorAgrupado>();

    for (const despesa of despesas) {
      const key = normalizeCnpj(despesa.cnpjCpfFornecedor) || despesa.nomeFornecedor.trim().toUpperCase();
      const existing = map.get(key);

      if (existing) {
        existing.totalGasto += despesa.valorDocumento;
        existing.quantidadeNotas += 1;
        existing.despesas.push(despesa);
        existing.valorMaximo = Math.max(existing.valorMaximo, despesa.valorDocumento);
      } else {
        map.set(key, {
          cnpjCpf: despesa.cnpjCpfFornecedor,
          nomeFornecedor: despesa.nomeFornecedor,
          totalGasto: despesa.valorDocumento,
          quantidadeNotas: 1,
          despesas: [despesa],
          valorMedio: despesa.valorDocumento,
          valorMaximo: despesa.valorDocumento,
        });
      }
    }

    const grupos = Array.from(map.values()).map((g) => ({
      ...g,
      valorMedio: g.totalGasto / g.quantidadeNotas,
    }));

    return grupos.sort((a, b) => b.totalGasto - a.totalGasto);
  }

  detectarAnomalias(fornecedores: FornecedorAgrupado[]): FornecedorAgrupado[] {
    return fornecedores.filter(
      (f) =>
        f.valorMaximo >= config.anomalyThresholdReais ||
        f.totalGasto >= config.anomalyThresholdReais * 2,
    );
  }

  apenasCnpj(fornecedores: FornecedorAgrupado[]): FornecedorAgrupado[] {
    return fornecedores.filter((f) => isCnpj(f.cnpjCpf));
  }
}
