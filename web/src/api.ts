export interface PoliticoResumo {
  id: string;
  nome: string;
  cargo: string;
  titulo?: string;
  partido: string;
  uf: string;
  fonte: string;
}

export type CategoriaSinal = "FATO" | "INDICIO" | "CONTEXTO";

export interface SinalRisco {
  tipo: string;
  categoria?: CategoriaSinal;
  confianca: number;
  descricao: string;
  evidencia?: string;
  fonte?: string;
  url?: string;
}

export interface VinculoGabinete {
  nomeServidor: string;
  parlamentar: string;
  cargo?: string;
  periodo?: string;
  fonte: string;
  url?: string;
}

export interface Socio {
  nome: string;
  qualificacao: string;
  dataEntrada?: string;
  cpfCnpj?: string;
}

export interface SocioEnriquecido extends Socio {
  vinculosPoliticos: VinculoGabinete[];
  outrasEmpresas: string[];
}

export interface CnpjData {
  cnpj?: string;
  razaoSocial: string;
  nomeFantasia?: string;
  situacaoCadastral: string;
  cnaeFiscalDescricao?: string;
  municipio?: string;
  uf?: string;
  logradouro?: string;
  numero?: string;
  cep?: string;
  socios: Socio[];
}

export interface PagadorPolitico {
  nome: string;
  fonte: string;
  partido?: string;
  uf?: string;
  totalGasto: number;
  quantidadeNotas: number;
  tiposDespesa: string[];
  ultimaDespesa?: string;
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

export interface MapsResult {
  encontrado: boolean;
  nomeEmpresa?: string;
  notaMedia?: number;
  totalAvaliacoes?: number;
  url?: string;
  avaliacoes: Array<{ autorNome: string; estrelas: number; texto: string }>;
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
  siteCheck?: {
    urlOriginal?: string;
    urlFinal?: string;
    acessivel: boolean;
    dominioApostas: boolean;
    redirectSuspeito: boolean;
    erro?: string;
  };
  maps?: MapsResult;
  astroturfing?: AstroturfingResult;
  socios: SocioEnriquecido[];
  sinais: SinalRisco[];
  score: number;
  classificacao: "BAIXO" | "MEDIO" | "ALTO" | "CRITICO";
  plausibilidade: PlausibilidadeOperacional;
  geradoEm: string;
  ultimoGasto?: string;
  reportPath?: string;
}

export interface FornecedorInvestigacao {
  fornecedor: {
    cnpjCpf: string;
    nomeFornecedor: string;
    totalGasto: number;
    quantidadeNotas: number;
    valorMaximo: number;
    valorMedio: number;
  };
  cnpjData?: CnpjData;
  sinais: SinalRisco[];
  score: number;
  classificacao: "BAIXO" | "MEDIO" | "ALTO" | "CRITICO";
}

export interface InvestigacaoResult {
  politico: {
    id: string;
    nome: string;
    siglaPartido: string;
    siglaUf: string;
    cargo: string;
    fonte: string;
    titulo?: string;
  };
  tipoDespesaFiltro?: string;
  totalDespesas: number;
  totalFornecedores: number;
  fornecedores: FornecedorInvestigacao[];
  geradoEm: string;
  reportPath?: string;
}

export interface InvestigarParams {
  nome: string;
  cargo?: string;
  tipoDespesa?: string;
  ano?: number;
  limiteFornecedores?: number;
  apenasAnomalias?: boolean;
}

export async function buscarPoliticos(nome: string): Promise<PoliticoResumo[]> {
  const res = await fetch(`/api/buscar?nome=${encodeURIComponent(nome)}`);
  if (!res.ok) throw new Error("Falha na busca");
  return res.json();
}

export async function investigar(params: InvestigarParams): Promise<InvestigacaoResult> {
  const res = await fetch("/api/investigar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Falha na investigação");
  return data;
}

export async function investigarEmpresa(cnpj: string, incluirMaps = true): Promise<InvestigacaoEmpresa> {
  const res = await fetch("/api/investigar-empresa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cnpj, incluirMaps }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Falha na investigação da empresa");
  return data;
}

export async function buscarPagadores(cnpj: string): Promise<{
  cnpj: string;
  pagadores: PagadorPolitico[];
  totalRecebido: number;
}> {
  const digits = cnpj.replace(/\D/g, "");
  const res = await fetch(`/api/cnpj/${digits}/pagadores`);
  if (!res.ok) throw new Error("Falha ao buscar pagadores");
  return res.json();
}

export async function buscarNotasPagador(
  cnpj: string,
  politico: string,
  fonte?: string,
): Promise<NotaPagador[]> {
  const digits = cnpj.replace(/\D/g, "");
  const params = fonte ? `?fonte=${encodeURIComponent(fonte)}` : "";
  const res = await fetch(
    `/api/cnpj/${digits}/pagadores/${encodeURIComponent(politico)}/notas${params}`,
  );
  if (!res.ok) throw new Error("Falha ao buscar notas");
  const data = await res.json();
  return data.notas;
}

export async function listarCargos(): Promise<Array<{ id: string; label: string }>> {
  const res = await fetch("/api/cargos");
  return res.json();
}
