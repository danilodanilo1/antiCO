export interface Socio {
  nome: string;
  qualificacao: string;
  dataEntrada?: string;
  cpfCnpj?: string;
}

export interface CnpjData {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia?: string;
  situacaoCadastral: string;
  dataSituacaoCadastral?: string;
  /** Data de abertura (AAAA-MM-DD). */
  dataInicioAtividade?: string;
  cnaeFiscal?: number;
  cnaeFiscalDescricao?: string;
  cnaesSecundarios?: number[];
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  email?: string;
  telefone?: string;
  socios: Socio[];
}
