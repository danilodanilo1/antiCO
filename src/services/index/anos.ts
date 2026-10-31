/** Anos disponíveis de cada base, calculados a partir da data atual (sem listas fixas no código). */

function intervalo(inicio: number, fim: number): number[] {
  return Array.from({ length: fim - inicio + 1 }, (_, i) => inicio + i);
}

/** CEAPS (Senado): CSVs anuais desde 2009. */
export function anosCeaps(hoje = new Date()): number[] {
  return intervalo(2009, hoje.getFullYear());
}

/** CEAP (Câmara): arquivos anuais desde 2008. */
export function anosCeap(hoje = new Date()): number[] {
  return intervalo(2008, hoje.getFullYear());
}

/** Anos da Câmara baixados automaticamente (os mais antigos são grandes e raramente mudam). */
export function anosCeapDownload(hoje = new Date(), quantidade = 6): number[] {
  const ano = hoje.getFullYear();
  return intervalo(ano - quantidade + 1, ano);
}
