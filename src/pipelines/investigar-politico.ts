import {
  agruparDespesasPorFornecedor,
  apenasFornecedoresCnpj,
  detectarFornecedoresAnomalos,
  filtrarDespesasPorTipo,
} from "../services/shared/despesas-processor.js";
import { politicoRegistry, type CargoAlias } from "../services/sources/registry.js";
import { ordenarPorRisco } from "../scoring/risk-engine.js";
import type { Politico } from "../types/politico.js";
import { labelCargo, labelFonte } from "../types/politico.js";
import type { InvestigacaoPolitico } from "../types/investigacao.js";
import { logger } from "../utils/logger.js";
import { saveJson } from "../utils/files.js";
import { investigarFornecedor } from "./investigar-fornecedor.js";

export interface InvestigarPoliticoOptions {
  nome: string;
  cargo?: CargoAlias;
  tipoDespesa?: string;
  ano?: number;
  limiteFornecedores?: number;
  apenasAnomalias?: boolean;
}

export async function investigarPolitico(options: InvestigarPoliticoOptions): Promise<InvestigacaoPolitico> {
  const cargoHint = politicoRegistry.parseCargoAlias(options.cargo);
  const politico: Politico = await politicoRegistry.resolver(options.nome, cargoHint);

  logger.info(
    `${labelCargo(politico)}: ${politico.nome} (${politico.siglaPartido}/${politico.siglaUf}) — ${labelFonte(politico.fonte)}`,
  );

  const source = politicoRegistry.getSource(politico.fonte);
  let despesas = await source.buscarDespesas(politico, options.ano);

  if (options.tipoDespesa) {
    despesas = filtrarDespesasPorTipo(despesas, options.tipoDespesa);
    logger.info(`${despesas.length} despesas após filtro "${options.tipoDespesa}"`);
  }

  const slug = politico.id.replace(":", "-");
  await saveJson("raw", `despesas-${slug}.json`, { politico, despesas });

  let fornecedores = agruparDespesasPorFornecedor(despesas);
  fornecedores = apenasFornecedoresCnpj(fornecedores);

  if (options.apenasAnomalias) {
    fornecedores = detectarFornecedoresAnomalos(fornecedores);
    logger.info(`${fornecedores.length} fornecedores com anomalias financeiras`);
  }

  const limite = options.limiteFornecedores ?? fornecedores.length;
  const alvo = fornecedores.slice(0, limite);

  const investigacoes = [];
  for (const fornecedor of alvo) {
    investigacoes.push(await investigarFornecedor(fornecedor, options.tipoDespesa));
  }

  return {
    politico,
    tipoDespesaFiltro: options.tipoDespesa,
    totalDespesas: despesas.length,
    totalFornecedores: fornecedores.length,
    fornecedores: ordenarPorRisco(investigacoes),
    geradoEm: new Date().toISOString(),
  };
}
