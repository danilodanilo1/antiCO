import { config } from "../../config/env.js";
import type { Despesa, FornecedorAgrupado } from "../../types/despesa.js";
import { isCnpj, normalizeCnpj } from "../../utils/cnpj.js";

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Palavras do dia a dia → radical usado nos nomes oficiais dos tipos de despesa da cota.
 * Ex.: "aluguel de carro" vira ["locac", "veicul"], que casa com
 * "LOCAÇÃO OU FRETAMENTO DE VEÍCULOS AUTOMOTORES".
 */
const SINONIMOS_DESPESA: Record<string, string> = {
  aluguel: "locac", alugar: "locac", aluguer: "locac", locacao: "locac", locar: "locac",
  carro: "veicul", carros: "veicul", automovel: "veicul", automoveis: "veicul", veiculo: "veicul", veiculos: "veicul",
  fretamento: "fretamento", frete: "fretamento",
  gasolina: "combustive", combustivel: "combustive", combustiveis: "combustive", abastecimento: "combustive",
  passagem: "passage", passagens: "passage", aerea: "aere", aereas: "aere", aviao: "aere", voo: "aere",
  divulgacao: "divulgac", propaganda: "divulgac", publicidade: "divulgac", marketing: "divulgac",
  consultoria: "consultor", assessoria: "consultor",
  hotel: "hosped", hospedagem: "hosped",
  alimentacao: "aliment", comida: "aliment", refeicao: "aliment",
  telefone: "telefon", telefonia: "telefon", celular: "telefon",
  correio: "postai", correios: "postai",
  escritorio: "escritorio", manutencao: "manutenc",
};

const PALAVRAS_VAZIAS = new Set(["de", "do", "da", "dos", "das", "e", "ou", "com", "para", "em", "o", "a"]);

/** Radicais que precisam aparecer no tipo de despesa para o filtro casar. */
export function radicaisFiltroDespesa(filtro: string): string[] {
  return semAcento(filtro)
    .split(/[^a-z0-9]+/)
    .filter((p) => p && !PALAVRAS_VAZIAS.has(p))
    .map((p) => SINONIMOS_DESPESA[p] ?? p);
}

/**
 * Filtra por tipo de despesa aceitando o nome oficial ("LOCAÇÃO") ou palavras comuns
 * ("aluguel de carro"). Sem diferença de acento ou caixa. Todos os radicais precisam aparecer.
 */
export function filtrarDespesasPorTipo(despesas: Despesa[], tipoFiltro: string): Despesa[] {
  const radicais = radicaisFiltroDespesa(tipoFiltro);
  if (radicais.length === 0) return despesas;
  return despesas.filter((d) => {
    const tipo = semAcento(d.tipoDespesa);
    return radicais.every((r) => tipo.includes(r));
  });
}

export function agruparDespesasPorFornecedor(despesas: Despesa[]): FornecedorAgrupado[] {
  const map = new Map<string, FornecedorAgrupado>();

  for (const despesa of despesas) {
    const key = normalizeCnpj(despesa.cnpjCpfFornecedor) || despesa.nomeFornecedor.trim().toUpperCase();
    const existing = map.get(key);

    if (existing) {
      existing.totalGasto += despesa.valorDocumento;
      existing.quantidadeNotas += 1;
      existing.despesas.push(despesa);
      existing.valorMaximo = Math.max(existing.valorMaximo, despesa.valorDocumento);
    } else {
      map.set(key, {
        cnpjCpf: despesa.cnpjCpfFornecedor,
        nomeFornecedor: despesa.nomeFornecedor,
        totalGasto: despesa.valorDocumento,
        quantidadeNotas: 1,
        despesas: [despesa],
        valorMedio: despesa.valorDocumento,
        valorMaximo: despesa.valorDocumento,
      });
    }
  }

  return Array.from(map.values())
    .map((g) => ({ ...g, valorMedio: g.totalGasto / g.quantidadeNotas }))
    .sort((a, b) => b.totalGasto - a.totalGasto);
}

export function detectarFornecedoresAnomalos(fornecedores: FornecedorAgrupado[]): FornecedorAgrupado[] {
  return fornecedores.filter(
    (f) =>
      f.valorMaximo > config.anomalyThresholdReais ||
      f.totalGasto >= config.anomalyThresholdReais * 2,
  );
}

export function apenasFornecedoresCnpj(fornecedores: FornecedorAgrupado[]): FornecedorAgrupado[] {
  return fornecedores.filter((f) => isCnpj(f.cnpjCpf));
}

export function normalizarNomePolitico(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^senador(a)?\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function nomesPoliticoCompativeis(a: string, b: string): boolean {
  const na = normalizarNomePolitico(a);
  const nb = normalizarNomePolitico(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}
