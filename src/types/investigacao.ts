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

/**
 * Peso de um sinal na classificação final.
 * - FATO: dado oficial verificável que, sozinho, justifica revisão (ex.: sócio foi servidor de gabinete).
 * - INDICIO: padrão suspeito que precisa de outros sinais para pesar.
 * - CONTEXTO: informação útil ao investigador, mas comum em empresas legítimas; não pontua.
 */
export type CategoriaSinal = "FATO" | "INDICIO" | "CONTEXTO";

export interface SinalRisco {
  tipo: SinalTipo;
  /** Preenchida pelo motor de pontuação a partir do tipo. */
  categoria?: CategoriaSinal;
  confianca: number;
  descricao: string;
  evidencia?: string;
  /** Nome da fonte oficial ou pública do dado (ex.: "Receita Federal via BrasilAPI"). */
  fonte?: string;
  /** Link para conferir o dado na origem, quando existir. */
  url?: string;
}

export interface SiteCheckResult {
  urlOriginal?: string;
  urlFinal?: string;
  statusCode?: number;
  acessivel: boolean;
  redirectSuspeito: boolean;
  dominioApostas: boolean;
  /** Por que o site foi considerado de apostas (domínio ou conteúdo). */
  motivoApostas?: string;
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
