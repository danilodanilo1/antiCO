export interface Despesa {
  ano: number;
  mes: number;
  tipoDespesa: string;
  codTipoDespesa: number;
  codDocumento: number;
  tipoDocumento: string;
  dataDocumento: string;
  numDocumento: string;
  valorDocumento: number;
  nomeFornecedor: string;
  cnpjCpfFornecedor: string;
  urlDocumento?: string;
}

export interface FornecedorAgrupado {
  cnpjCpf: string;
  nomeFornecedor: string;
  totalGasto: number;
  quantidadeNotas: number;
  despesas: Despesa[];
  valorMedio: number;
  valorMaximo: number;
}

export interface TipoDespesa {
  cod: number;
  nome: string;
  descricao?: string;
}

/** Uma fonte que falhou ou foi substituída durante a investigação. */
export interface AvisoFonte {
  fonte: string;
  mensagem: string;
  /** Fonte usada no lugar, quando houve alternativa. */
  alternativa?: string;
}

export interface ResultadoDespesas {
  despesas: Despesa[];
  avisos: AvisoFonte[];
}
