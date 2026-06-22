import { config } from "../../config/env.js";
import type { Despesa, FornecedorAgrupado } from "../../types/despesa.js";
import { isCnpj, normalizeCnpj } from "../../utils/cnpj.js";

export function filtrarDespesasPorTipo(despesas: Despesa[], tipoFiltro: string): Despesa[] {
  const filtro = tipoFiltro.toLowerCase();
  return despesas.filter((d) => d.tipoDespesa.toLowerCase().includes(filtro));
}

export function agruparDespesasPorFornecedor(despesas: Despesa[]): FornecedorAgrupado[] {
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

  return Array.from(map.values())
    .map((g) => ({ ...g, valorMedio: g.totalGasto / g.quantidadeNotas }))
    .sort((a, b) => b.totalGasto - a.totalGasto);
}

export function detectarFornecedoresAnomalos(fornecedores: FornecedorAgrupado[]): FornecedorAgrupado[] {
  return fornecedores.filter(
    (f) =>
      f.valorMaximo > config.anomalyThresholdReais ||
      f.totalGasto >= config.anomalyThresholdReais * 2,
  );
}

export function apenasFornecedoresCnpj(fornecedores: FornecedorAgrupado[]): FornecedorAgrupado[] {
  return fornecedores.filter((f) => isCnpj(f.cnpjCpf));
}

export function normalizarNomePolitico(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^senador(a)?\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function nomesPoliticoCompativeis(a: string, b: string): boolean {
  const na = normalizarNomePolitico(a);
  const nb = normalizarNomePolitico(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}
