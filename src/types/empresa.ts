import type { FonteDados } from "./politico.js";
import type { CnpjData } from "./cnpj.js";
import type { SinalRisco, SiteCheckResult } from "./investigacao.js";

export type SinalEmpresaTipo =
  | SinalRisco["tipo"]
  | "MAPS_AUSENTE"
  | "ASTROTURFING_REVIEWS"
  | "AVALIADOR_COMPARTILHADO"
  | "EMPRESA_RECENTE"
  | "CLIENTES_POLITICOS_CONCENTRADOS"
  | "ENDERECO_COMPARTILHADO"
  | "SOCIO_SERVIDOR_GABINETE"
  | "SOCIO_ALTERADO_RECENTE"
  | "MULTIPLOS_PARLAMENTARES";

export interface SinalEmpresa extends Omit<SinalRisco, "tipo"> {
  tipo: SinalEmpresaTipo;
}

export interface PagadorPolitico {
  nome: string;
  fonte: FonteDados;
  partido?: string;
  uf?: string;
  totalGasto: number;
  quantidadeNotas: number;
  tiposDespesa: string[];
  ultimaDespesa?: string;
  primeiraDespesa?: string;
}

export interface NotaPagador {
  data: string;
  valor: number;
  numeroDocumento?: string;
  tipoDespesa: string;
  urlDocumento?: string;
  fonteDado: string;
  ano?: number;
  mes?: number;
}

export interface AvaliacaoMaps {
  autorNome: string;
  autorId?: string;
  estrelas: number;
  texto: string;
  data?: string;
}

export interface MapsResult {
  encontrado: boolean;
  nomeEmpresa?: string;
  notaMedia?: number;
  totalAvaliacoes?: number;
  url?: string;
  avaliacoes: AvaliacaoMaps[];
  erro?: string;
}

export interface AstroturfingResult {
  suspeito: boolean;
  confianca: number;
  avaliadoresSuspeitos: number;
  avaliadoresCompartilhados: string[];
  empresasRelacionadas: string[];
  detalhes: string[];
}

export interface VinculoGabinete {
  nomeServidor: string;
  parlamentar: string;
  cargo?: string;
  periodo?: string;
  fonte: string;
  url?: string;
}

export interface SocioEnriquecido {
  nome: string;
  qualificacao: string;
  dataEntrada?: string;
  cpfCnpj?: string;
  /** Vínculos com gabinetes encontrados em listas oficiais de pessoal (nome completo idêntico). */
  vinculosPoliticos: VinculoGabinete[];
  outrasEmpresas: string[];
}

export interface PlausibilidadeOperacional {
  score: number;
  classificacao: "BAIXA" | "MEDIA" | "ALTA";
  evidenciasFavor: string[];
  evidenciasContra: string[];
}

export interface InvestigacaoEmpresa {
  cnpj: string;
  cnpjData?: CnpjData;
  pagadores: PagadorPolitico[];
  totalRecebido: number;
  siteCheck?: SiteCheckResult;
  maps?: MapsResult;
  astroturfing?: AstroturfingResult;
  socios: SocioEnriquecido[];
  sinais: SinalEmpresa[];
  score: number;
  classificacao: "BAIXO" | "MEDIO" | "ALTO" | "CRITICO";
  plausibilidade: PlausibilidadeOperacional;
  geradoEm: string;
  ultimoGasto?: string;
}
