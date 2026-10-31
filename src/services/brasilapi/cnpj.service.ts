import { config } from "../../config/env.js";
import type { CnpjData, Socio } from "../../types/cnpj.js";
import { formatCnpj, normalizeCnpj } from "../../utils/cnpj.js";
import { logger } from "../../utils/logger.js";

interface CnpjApiResponse {
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string;
  descricao_situacao_cadastral?: string;
  data_situacao_cadastral?: string;
  data_inicio_atividade?: string;
  cnae_fiscal?: number;
  cnae_fiscal_descricao?: string;
  cnaes_secundarios?: Array<{ codigo: number; descricao?: string }>;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  email?: string;
  ddd_telefone_1?: string;
  qsa?: Array<{
    nome_socio: string;
    qualificacao_socio: string;
    data_entrada_sociedade?: string;
    cnpj_cpf_do_socio?: string;
  }>;
}

export class CnpjService {
  constructor(
    private readonly brasilApiUrl = config.brasilApiBaseUrl,
    private readonly minhaReceitaUrl = config.minhaReceitaUrl,
  ) {}

  async consultar(cnpj: string): Promise<CnpjData | null> {
    const digits = normalizeCnpj(cnpj);
    if (digits.length !== 14) {
      logger.warn(`CNPJ inválido: ${cnpj}`);
      return null;
    }

    const brasilApi = await this.fetchFrom(`${this.brasilApiUrl}/cnpj/v1/${digits}`, "BrasilAPI");
    if (brasilApi) return this.mapResponse(brasilApi);

    logger.warn(`BrasilAPI indisponível para ${formatCnpj(digits)} — tentando Minha Receita...`);
    const minhaReceita = await this.fetchFrom(`${this.minhaReceitaUrl}/${digits}`, "Minha Receita");
    if (minhaReceita) return this.mapResponse(minhaReceita);

    logger.error(`Não foi possível consultar CNPJ ${formatCnpj(digits)} em nenhuma fonte.`);
    return null;
  }

  private async fetchFrom(url: string, fonte: string): Promise<CnpjApiResponse | null> {
    logger.debug(`GET ${url}`);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

      try {
        const response = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

        if (response.status === 404) return null;
        if (!response.ok) {
          logger.debug(`${fonte} retornou ${response.status} para ${url}`);
          return null;
        }

        return (await response.json()) as CnpjApiResponse;
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      logger.debug(`${fonte} falhou: ${String(error)}`);
      return null;
    }
  }

  private mapResponse(data: CnpjApiResponse): CnpjData {
    const socios: Socio[] = (data.qsa ?? []).map((s) => ({
      nome: s.nome_socio,
      qualificacao: s.qualificacao_socio,
      dataEntrada: s.data_entrada_sociedade,
      cpfCnpj: s.cnpj_cpf_do_socio,
    }));

    return {
      cnpj: normalizeCnpj(data.cnpj),
      razaoSocial: data.razao_social,
      nomeFantasia: data.nome_fantasia,
      situacaoCadastral: data.descricao_situacao_cadastral ?? "DESCONHECIDA",
      dataSituacaoCadastral: data.data_situacao_cadastral,
      dataInicioAtividade: data.data_inicio_atividade,
      cnaeFiscal: data.cnae_fiscal,
      cnaeFiscalDescricao: data.cnae_fiscal_descricao,
      cnaesSecundarios: (data.cnaes_secundarios ?? []).map((c) => c.codigo).filter((c) => c > 0),
      logradouro: data.logradouro,
      numero: data.numero,
      complemento: data.complemento,
      bairro: data.bairro,
      municipio: data.municipio,
      uf: data.uf,
      cep: data.cep,
      email: data.email,
      telefone: data.ddd_telefone_1,
      socios,
    };
  }
}
