import type { CnpjData } from "./cnpj.js";
import type { FornecedorAgrupado } from "./despesa.js";
import type { Politico } from "./politico.js";

export type SinalTipo =
  | "VALOR_ALTO"
  | "CONCENTRACAO_FORNECEDOR"
  | "SITE_INACESSIVEL"
  | "SITE_REDIRECT_SUSPEITO"
  | "SITE_DOMINIO_APOSTAS"
  | "CNPJ_INATIVO"
  | "SEM_PRESENCA_DIGITAL"
  | "CNAE_INCOMPATIVEL";

export interface SinalRisco {
  tipo: SinalTipo;
  confianca: number;
  descricao: string;
  evidencia?: string;
}

export interface SiteCheckResult {
  urlOriginal?: string;
  urlFinal?: string;
  statusCode?: number;
  acessivel: boolean;
  redirectSuspeito: boolean;
  dominioApostas: boolean;
  erro?: string;
}

export interface InvestigacaoFornecedor {
  fornecedor: FornecedorAgrupado;
  cnpjData?: CnpjData;
  siteCheck?: SiteCheckResult;
  sinais: SinalRisco[];
  score: number;
  classificacao: "BAIXO" | "MEDIO" | "ALTO" | "CRITICO";
}

export interface InvestigacaoPolitico {
  politico: Politico;
  tipoDespesaFiltro?: string;
  totalDespesas: number;
  totalFornecedores: number;
  fornecedores: InvestigacaoFornecedor[];
  geradoEm: string;
}

/** @deprecated Use InvestigacaoPolitico */
export type InvestigacaoDeputado = InvestigacaoPolitico;
