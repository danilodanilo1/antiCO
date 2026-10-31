/**
 * Parser da página "Pessoal de gabinete" da Câmara
 * (https://www.camara.leg.br/deputados/{id}/pessoal-gabinete?ano={ano}).
 * Colunas: Nome | Grupo funcional | Cargo | Período de exercício | Remuneração mensal.
 */

export interface LinhaGabinete {
  nome: string;
  grupoFuncional?: string;
  cargo?: string;
  periodo?: string;
}

function textoLimpo(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

export function parsePessoalGabinete(html: string): LinhaGabinete[] {
  const linhas: LinhaGabinete[] = [];
  const trs = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  for (const tr of trs) {
    const tds = tr.match(/<td[\s\S]*?<\/td>/gi);
    if (!tds || tds.length < 3) continue;
    const [nome, grupo, cargo, periodo] = tds.map(textoLimpo);
    if (!nome || nome.length < 5) continue;
    linhas.push({ nome, grupoFuncional: grupo || undefined, cargo: cargo || undefined, periodo: periodo || undefined });
  }
  return linhas;
}

/** Normaliza nome para comparação exata: sem acento, minúsculo, espaços simples. */
export function normalizarNomeCompleto(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
