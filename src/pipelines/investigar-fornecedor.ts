import { CnpjService } from "../services/brasilapi/cnpj.service.js";
import { checkSite, inferSiteFromEmail } from "../services/site-checker.js";
import { calcularRisco } from "../scoring/risk-engine.js";
import type { FornecedorAgrupado } from "../types/despesa.js";
import type { InvestigacaoFornecedor } from "../types/investigacao.js";
import { logger } from "../utils/logger.js";
import { formatCnpj } from "../utils/cnpj.js";

export async function investigarFornecedor(
  fornecedor: FornecedorAgrupado,
  tipoDespesa?: string,
): Promise<InvestigacaoFornecedor> {
  logger.info(`Investigando fornecedor: ${fornecedor.nomeFornecedor} (${formatCnpj(fornecedor.cnpjCpf)})`);

  const cnpjService = new CnpjService();
  const cnpjData = await cnpjService.consultar(fornecedor.cnpjCpf);

  const siteUrl = inferSiteFromEmail(cnpjData?.email);
  const tinhaUrl = Boolean(siteUrl);
  const siteCheck = tinhaUrl ? await checkSite(siteUrl) : undefined;

  return calcularRisco(fornecedor, cnpjData ?? undefined, siteCheck, tipoDespesa, tinhaUrl);
}
