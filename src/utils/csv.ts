/**
 * Parser CSV simples para dados públicos brasileiros (delimitador ;, campos entre aspas).
 */
export function parseCsv(content: string, delimiter = ";"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === delimiter) {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n" || (char === "\r" && next === "\n")) {
      row.push(field);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      field = "";
      if (char === "\r") i++;
      continue;
    }

    if (char !== "\r") field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((c) => c.trim())) rows.push(row);
  }

  return rows;
}

export function csvToObjects(
  content: string,
  delimiter = ";",
  headerRowIndex?: number,
): Record<string, string>[] {
  const rows = parseCsv(content, delimiter);
  if (rows.length === 0) return [];

  let headerIndex = headerRowIndex ?? 0;
  if (headerRowIndex === undefined) {
    const autoIndex = rows.findIndex((r) => r[0]?.toUpperCase() === "ANO" || r.includes("SENADOR"));
    if (autoIndex >= 0) headerIndex = autoIndex;
  }

  const headers = rows[headerIndex].map((h) => h.trim());
  return rows.slice(headerIndex + 1).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, i) => {
      obj[header] = (cells[i] ?? "").trim();
    });
    return obj;
  });
}

/**
 * Converte valores monetários de arquivos públicos.
 * - Com vírgula: formato brasileiro ("1.500,00" → 1500).
 * - Só com ponto e 1 ou 2 casas depois dele: ponto decimal, como no CSV da Câmara ("165.65" → 165.65).
 * - Só com ponto e 3 casas: separador de milhar ("1.500" → 1500).
 */
export function parseValorBr(valor: string): number {
  const v = valor.trim();
  let normalized: string;
  if (v.includes(",")) {
    normalized = v.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d+\.\d{1,2}$/.test(v)) {
    normalized = v;
  } else {
    normalized = v.replace(/\./g, "");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export function parseDataBr(data: string): { dia: number; mes: number; ano: number } | null {
  const match = data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return { dia: Number(match[1]), mes: Number(match[2]), ano: Number(match[3]) };
}
