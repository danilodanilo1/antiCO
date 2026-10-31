import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../../config/env.js";
import type { Despesa } from "../../types/despesa.js";
import { parseCnpjCeap } from "../../utils/cnpj.js";
import { csvToObjects, parseValorBr } from "../../utils/csv.js";

/**
 * Lê as despesas de um deputado no arquivo anual da cota (CEAP) já baixado em data/raw
 * pelo índice CNPJ. Serve de alternativa quando a API de Dados Abertos da Câmara falha.
 * Não baixa nada: se o arquivo do ano não existir, devolve null.
 */

const TIPOS_DOCUMENTO: Record<string, string> = {
  "0": "Nota Fiscal",
  "1": "Recibos/Outros",
  "2": "Despesa no Exterior",
  "3": "Nota Fiscal Eletrônica",
  "4": "Documento de Despesa no Exterior",
};

async function lerArquivoAno(ano: number, dataDir: string): Promise<string | null> {
  const candidatos = [
    join(dataDir, "raw", `ceap-${ano}.csv`),
    join(dataDir, "raw", "ceap-extract", `Ano-${ano}.csv`),
  ];
  for (const caminho of candidatos) {
    try {
      return await readFile(caminho, "utf-8");
    } catch {
      // tenta o próximo
    }
  }
  return null;
}

export function despesasDoCsv(csv: string, deputadoId: string): Despesa[] {
  const despesas: Despesa[] = [];
  for (const row of csvToObjects(csv)) {
    if ((row.ideCadastro ?? "").trim() !== deputadoId) continue;
    const doc = (row.txtCNPJCPF ?? "").trim();
    despesas.push({
      ano: Number(row.numAno) || 0,
      mes: Number(row.numMes) || 0,
      tipoDespesa: row.txtDescricao ?? "",
      codTipoDespesa: Number(row.numSubCota) || 0,
      codDocumento: Number(row.ideDocumento) || 0,
      tipoDocumento: TIPOS_DOCUMENTO[(row.indTipoDocumento ?? "").trim()] ?? row.indTipoDocumento ?? "",
      dataDocumento: (row.datEmissao ?? "").slice(0, 10),
      numDocumento: row.txtNumero ?? "",
      valorDocumento: parseValorBr(String(row.vlrDocumento ?? row.vlrLiquido ?? "0")),
      nomeFornecedor: row.txtFornecedor ?? "",
      cnpjCpfFornecedor: parseCnpjCeap(doc) ?? doc.replace(/\D/g, ""),
      urlDocumento: (row.urlDocumento ?? "").trim() || undefined,
    });
  }
  return despesas;
}

/** Despesas do deputado no ano, ou null se o arquivo do ano não estiver em disco. */
export async function despesasCeapLocal(
  deputadoId: string,
  ano: number,
  dataDir = config.dataDir,
): Promise<Despesa[] | null> {
  const csv = await lerArquivoAno(ano, dataDir);
  return csv === null ? null : despesasDoCsv(csv, deputadoId);
}
