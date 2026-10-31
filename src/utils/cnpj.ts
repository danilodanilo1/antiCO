export function normalizeCnpj(value: string): string {
  return value.replace(/\D/g, "");
}

export function formatCnpj(value: string): string {
  const digits = normalizeCnpj(value);

  if (digits.length !== 14) return value;

  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

export function isCnpj(value: string): boolean {
  return normalizeCnpj(value).length === 14;
}

/** Primeiros 8 dígitos — identificador da empresa (matriz + filiais). */

export function cnpjRaiz(value: string): string {
  const digits = normalizeCnpj(value);

  return digits.length >= 8 ? digits.slice(0, 8) : digits;
}

/**

 * Parse CNPJ formatado do CEAP (filial/dígito frequentemente truncados).

 * Ex.: "117.247.550/0015-5" → filial 0015, não colide com matriz 0001-55.

 */

export function parseCnpjCeap(raw: string): string | null {
  const trimmed = raw.trim();

  if (!trimmed) return null;

  const structured = trimmed.match(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{1,4})-(\d{1,2})$/);

  if (structured) {
    const [, p1, p2, p3, filial, dv] = structured;

    const base8 = `${p1}${p2}${p3}`.slice(0, 8);

    const filialPad = filial.padStart(4, "0");

    const dvPad = dv.padStart(2, "0");

    const digits = `${base8}${filialPad}${dvPad}`;

    return digits.length === 14 ? digits : null;
  }

  const digits = normalizeCnpj(trimmed);

  if (digits.length === 14) return digits;

  return null;
}

/** Padrões de busca rápida em CSV (CEAP formata CNPJ com pontos). */
export function cnpjCsvNeedles(value: string): string[] {
  const raiz = cnpjRaiz(value);
  const needles = new Set<string>([raiz, normalizeCnpj(value)]);
  if (raiz.length >= 8) {
    needles.add(`${raiz.slice(0, 3)}.${raiz.slice(3, 6)}.${raiz.slice(6)}`);
    needles.add(`${raiz.slice(0, 3)}.${raiz.slice(3, 6)}`);
    needles.add(`${raiz.slice(0, 2)}.${raiz.slice(2, 5)}.${raiz.slice(5)}`);
  }
  return [...needles].filter(Boolean);
}

export function csvContemCnpj(csvText: string, cnpj: string): boolean {
  return cnpjCsvNeedles(cnpj).some((needle) => csvText.includes(needle));
}

export function cnpjsMesmaRaiz(a: string, b: string): boolean {
  return cnpjRaiz(a) === cnpjRaiz(b);
}

/**
 * Compara um CNPJ consultado com um CNPJ indexado.
 * Por padrão compara raiz + filial (12 primeiros dígitos): o CEAP às vezes trunca o dígito
 * verificador, mas matriz e filiais são estabelecimentos diferentes. Uma rede com 300 lojas
 * não deve aparecer como "um fornecedor pago por 300 parlamentares".
 * Use `incluirFiliais` para agrupar toda a empresa pela raiz (8 dígitos).
 */
export function cnpjMatchesQuery(query: string, indexed: string, incluirFiliais = false): boolean {
  const q = normalizeCnpj(query);
  const idx = normalizeCnpj(indexed);
  if (q === idx) return true;
  if (q.length < 12 || idx.length < 12) return false;
  if (incluirFiliais) return q.slice(0, 8) === idx.slice(0, 8);
  return q.slice(0, 12) === idx.slice(0, 12);
}

/** @deprecated Use parseCnpjCeap para dados CEAP */

export function normalizeCnpjFromFormatted(value: string): string | null {
  return parseCnpjCeap(value);
}

