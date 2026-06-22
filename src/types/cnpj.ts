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
  cnaeFiscal?: number;
  cnaeFiscalDescricao?: string;
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
