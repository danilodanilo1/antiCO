import type { CategoriaSinal, InvestigacaoFornecedor } from "../types/investigacao.js";
import type { SinalEmpresaTipo } from "../types/empresa.js";

export type Classificacao = InvestigacaoFornecedor["classificacao"];

/**
 * Categoria de cada tipo de sinal. A regra de ouro: um sinal que aparece com frequência
 * em empresas legítimas (sem site, nota alta, fora do Google Maps) é CONTEXTO e não pontua.
 */
export const CATEGORIA_POR_TIPO: Record<SinalEmpresaTipo, CategoriaSinal> = {
  // Fatos oficiais
  CNPJ_INATIVO: "FATO",
  SOCIO_SERVIDOR_GABINETE: "FATO",

  // Indícios: suspeitos, mas precisam de outros sinais
  CNAE_INCOMPATIVEL: "INDICIO",
  SITE_DOMINIO_APOSTAS: "INDICIO",
  SITE_REDIRECT_SUSPEITO: "INDICIO",
  ENDERECO_COMPARTILHADO: "INDICIO",
  AVALIADOR_COMPARTILHADO: "INDICIO",
  EMPRESA_RECENTE: "INDICIO",
  CLIENTES_POLITICOS_CONCENTRADOS: "INDICIO",
  SOCIO_ALTERADO_RECENTE: "INDICIO",

  // Contexto: comum em empresas legítimas
  VALOR_ALTO: "CONTEXTO",
  CONCENTRACAO_FORNECEDOR: "CONTEXTO",
  SITE_INACESSIVEL: "CONTEXTO",
  SEM_PRESENCA_DIGITAL: "CONTEXTO",
  MAPS_AUSENTE: "CONTEXTO",
  ASTROTURFING_REVIEWS: "CONTEXTO",
  MULTIPLOS_PARLAMENTARES: "CONTEXTO",
};

export const PONTOS_POR_CATEGORIA: Record<CategoriaSinal, number> = {
  FATO: 0.4,
  INDICIO: 0.15,
  CONTEXTO: 0,
};

export interface SinalPontuavel {
  tipo: SinalEmpresaTipo;
  categoria?: CategoriaSinal;
}

export interface Pontuacao {
  score: number;
  classificacao: Classificacao;
  fatos: number;
  indicios: number;
}

export function categoriaDe(tipo: SinalEmpresaTipo): CategoriaSinal {
  return CATEGORIA_POR_TIPO[tipo] ?? "CONTEXTO";
}

/** Preenche `categoria` em cada sinal conforme o catálogo. */
export function categorizar<T extends SinalPontuavel>(sinais: T[]): T[] {
  return sinais.map((s) => ({ ...s, categoria: categoriaDe(s.tipo) }));
}

/**
 * Classificação por regras, não por média:
 * - CRITICO: ≥1 fato e ≥2 indícios
 * - ALTO: ≥1 fato, ou ≥3 indícios
 * - MEDIO: ≥2 indícios
 * - BAIXO: o resto (inclui qualquer quantidade de sinais de contexto)
 *
 * O score numérico (0–1) é a soma dos pontos, limitada a 1, só para ordenar resultados.
 * Sinais do mesmo tipo contam uma vez.
 */
export function pontuar(sinais: SinalPontuavel[]): Pontuacao {
  const tipos = new Map<SinalEmpresaTipo, CategoriaSinal>();
  for (const s of sinais) tipos.set(s.tipo, s.categoria ?? categoriaDe(s.tipo));

  let fatos = 0;
  let indicios = 0;
  let soma = 0;
  for (const categoria of tipos.values()) {
    if (categoria === "FATO") fatos++;
    if (categoria === "INDICIO") indicios++;
    soma += PONTOS_POR_CATEGORIA[categoria];
  }

  let classificacao: Classificacao = "BAIXO";
  if (fatos >= 1 && indicios >= 2) classificacao = "CRITICO";
  else if (fatos >= 1 || indicios >= 3) classificacao = "ALTO";
  else if (indicios >= 2) classificacao = "MEDIO";

  return {
    score: Number(Math.min(1, soma).toFixed(2)),
    classificacao,
    fatos,
    indicios,
  };
}
