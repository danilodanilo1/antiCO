import { config } from "../config/env.js";
import type { CnpjData } from "../types/cnpj.js";
import type { FornecedorAgrupado } from "../types/despesa.js";
import type { InvestigacaoFornecedor, SinalRisco, SiteCheckResult } from "../types/investigacao.js";
import type {
  AstroturfingResult,
  MapsResult,
  PagadorPolitico,
  PlausibilidadeOperacional,
  SinalEmpresa,
  SocioEnriquecido,
} from "../types/empresa.js";

const CNAE_LOCACAO_VEICULOS = [7711000, 7719599, 7719601, 7719602, 7719603, 7719604, 7719699];

function classificarScore(score: number): InvestigacaoFornecedor["classificacao"] {
  if (score >= 0.75) return "CRITICO";
  if (score >= 0.55) return "ALTO";
  if (score >= 0.35) return "MEDIO";
  return "BAIXO";
}

function sinaisFinanceiros(fornecedor: FornecedorAgrupado): SinalRisco[] {
  const sinais: SinalRisco[] = [];

  if (fornecedor.valorMaximo > config.anomalyThresholdReais) {
    sinais.push({
      tipo: "VALOR_ALTO",
      confianca: Math.min(0.95, 0.6 + fornecedor.valorMaximo / 50_000),
      descricao: `Nota individual de R$ ${fornecedor.valorMaximo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} acima do limiar de R$ ${config.anomalyThresholdReais.toLocaleString("pt-BR")}`,
      evidencia: `Máximo: R$ ${fornecedor.valorMaximo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    });
  }

  if (fornecedor.quantidadeNotas >= 3 && fornecedor.valorMedio >= config.anomalyThresholdReais * 0.5) {
    sinais.push({
      tipo: "CONCENTRACAO_FORNECEDOR",
      confianca: 0.65,
      descricao: `${fornecedor.quantidadeNotas} notas com valor médio elevado (R$ ${fornecedor.valorMedio.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})`,
      evidencia: `Total: R$ ${fornecedor.totalGasto.toFixed(2)}`,
    });
  }

  return sinais;
}

function sinaisCnpj(cnpjData: CnpjData | undefined, tipoDespesa?: string): SinalRisco[] {
  if (!cnpjData) return [];

  const sinais: SinalRisco[] = [];
  const situacao = cnpjData.situacaoCadastral.toUpperCase();

  if (!situacao.includes("ATIVA")) {
    sinais.push({
      tipo: "CNPJ_INATIVO",
      confianca: 0.9,
      descricao: `CNPJ com situação cadastral: ${cnpjData.situacaoCadastral}`,
      evidencia: cnpjData.dataSituacaoCadastral,
    });
  }

  if (tipoDespesa && cnpjData.cnaeFiscal) {
    const despesaLocacao = tipoDespesa.toLowerCase().includes("locação") || tipoDespesa.toLowerCase().includes("locacao");
    const cnaeLocacao = CNAE_LOCACAO_VEICULOS.includes(cnpjData.cnaeFiscal);

    if (despesaLocacao && !cnaeLocacao) {
      sinais.push({
        tipo: "CNAE_INCOMPATIVEL",
        confianca: 0.7,
        descricao: `CNAE "${cnpjData.cnaeFiscalDescricao}" pode ser incompatível com despesa de locação de veículos`,
        evidencia: `CNAE ${cnpjData.cnaeFiscal}`,
      });
    }
  }

  return sinais;
}

function sinaisSite(siteCheck: SiteCheckResult | undefined, tinhaUrl: boolean): SinalRisco[] {
  if (!siteCheck) return [];

  const sinais: SinalRisco[] = [];

  if (!tinhaUrl) {
    sinais.push({
      tipo: "SEM_PRESENCA_DIGITAL",
      confianca: 0.5,
      descricao: "Empresa sem e-mail corporativo ou site identificável nos dados cadastrais",
    });
    return sinais;
  }

  if (!siteCheck.acessivel) {
    sinais.push({
      tipo: "SITE_INACESSIVEL",
      confianca: 0.6,
      descricao: "Site informado está inacessível ou não responde",
      evidencia: siteCheck.erro ?? `Status: ${siteCheck.statusCode}`,
    });
  }

  if (siteCheck.dominioApostas) {
    sinais.push({
      tipo: "SITE_DOMINIO_APOSTAS",
      confianca: 0.95,
      descricao: "URL final aponta para domínio relacionado a apostas/jogos",
      evidencia: siteCheck.urlFinal,
    });
  } else if (siteCheck.redirectSuspeito) {
    sinais.push({
      tipo: "SITE_REDIRECT_SUSPEITO",
      confianca: 0.85,
      descricao: "Site redireciona para URL suspeita",
      evidencia: `${siteCheck.urlOriginal} → ${siteCheck.urlFinal}`,
    });
  }

  return sinais;
}

export function calcularRisco(
  fornecedor: FornecedorAgrupado,
  cnpjData: CnpjData | undefined,
  siteCheck: SiteCheckResult | undefined,
  tipoDespesa?: string,
  tinhaUrl = false,
): InvestigacaoFornecedor {
  const sinais = [
    ...sinaisFinanceiros(fornecedor),
    ...sinaisCnpj(cnpjData, tipoDespesa),
    ...sinaisSite(siteCheck, tinhaUrl),
  ];

  const score =
    sinais.length === 0
      ? 0
      : sinais.reduce((sum, s) => sum + s.confianca, 0) / Math.max(sinais.length, 1);

  const bonusCritico = sinais.filter((s) =>
    ["SITE_DOMINIO_APOSTAS", "CNPJ_INATIVO"].includes(s.tipo),
  ).length;

  const scoreFinal = Math.min(1, score + bonusCritico * 0.1);

  return {
    fornecedor,
    cnpjData,
    siteCheck,
    sinais,
    score: Number(scoreFinal.toFixed(2)),
    classificacao: classificarScore(scoreFinal),
  };
}

export function ordenarPorRisco(investigacoes: InvestigacaoFornecedor[]): InvestigacaoFornecedor[] {
  return [...investigacoes].sort((a, b) => b.score - a.score);
}

export interface RiscoEmpresaInput {
  cnpjData?: CnpjData;
  pagadores: PagadorPolitico[];
  siteCheck?: SiteCheckResult;
  maps?: MapsResult;
  astroturfing?: AstroturfingResult;
  socios: SocioEnriquecido[];
  socioAlteradoRecente?: boolean;
  enderecoCompartilhado?: string[];
  tinhaUrl?: boolean;
}

function sinaisPagadores(pagadores: PagadorPolitico[]): SinalEmpresa[] {
  const sinais: SinalEmpresa[] = [];
  if (pagadores.length >= 5) {
    sinais.push({
      tipo: "MULTIPLOS_PARLAMENTARES",
      confianca: Math.min(0.9, 0.5 + pagadores.length * 0.05),
      descricao: `CNPJ recebeu pagamentos de ${pagadores.length} parlamentares distintos`,
      evidencia: pagadores.slice(0, 5).map((p) => p.nome).join(", "),
    });
  }

  const total = pagadores.reduce((s, p) => s + p.totalGasto, 0);
  if (total > 0 && pagadores.length >= 1) {
    const top = pagadores[0]!;
    const pct = top.totalGasto / total;
    if (pct >= 0.8 && pagadores.length <= 3) {
      sinais.push({
        tipo: "CLIENTES_POLITICOS_CONCENTRADOS",
        confianca: 0.75,
        descricao: `${Math.round(pct * 100)}% dos pagamentos vêm de ${top.nome}`,
        evidencia: `R$ ${top.totalGasto.toFixed(2)} de R$ ${total.toFixed(2)}`,
      });
    }
  }

  return sinais;
}

function sinaisMapsEmpresa(maps?: MapsResult): SinalEmpresa[] {
  if (!maps) return [];
  if (!maps.encontrado) {
    return [{
      tipo: "MAPS_AUSENTE",
      confianca: 0.55,
      descricao: "Empresa não encontrada ou sem presença verificável no Google Maps",
    }];
  }
  return [];
}

function sinaisAstroturfing(astroturfing?: AstroturfingResult): SinalEmpresa[] {
  if (!astroturfing?.suspeito) return [];
  const sinais: SinalEmpresa[] = [{
    tipo: "ASTROTURFING_REVIEWS",
    confianca: astroturfing.confianca,
    descricao: "Indícios de astroturfing em avaliações do Google Maps",
    evidencia: astroturfing.detalhes.slice(0, 2).join("; "),
  }];

  if (astroturfing.avaliadoresCompartilhados.length > 0) {
    sinais.push({
      tipo: "AVALIADOR_COMPARTILHADO",
      confianca: 0.85,
      descricao: "Avaliadores aparecem em múltiplas empresas investigadas",
      evidencia: astroturfing.avaliadoresCompartilhados.slice(0, 3).join(", "),
    });
  }
  return sinais;
}

function sinaisSocios(socios: SocioEnriquecido[], socioAlteradoRecente?: boolean): SinalEmpresa[] {
  const sinais: SinalEmpresa[] = [];

  for (const s of socios) {
    if (s.vinculosPoliticos.length > 0) {
      sinais.push({
        tipo: "SOCIO_VINCULO_POLITICO",
        confianca: 0.8,
        descricao: `Sócio ${s.nome} com possível vínculo político`,
        evidencia: s.vinculosPoliticos[0],
      });
    }
  }

  if (socioAlteradoRecente) {
    sinais.push({
      tipo: "SOCIO_ALTERADO_RECENTE",
      confianca: 0.7,
      descricao: "Quadro societário alterado entre investigações recentes (snapshot)",
    });
  }

  return sinais;
}

function sinaisEmpresaRecente(cnpjData?: CnpjData, pagadores?: PagadorPolitico[]): SinalEmpresa[] {
  if (!cnpjData?.socios.length) return [];
  const entradas = cnpjData.socios
    .map((s) => s.dataEntrada)
    .filter(Boolean)
    .map((d) => new Date(d!))
    .filter((d) => !Number.isNaN(d.getTime()));

  if (entradas.length === 0) return [];

  const maisRecente = entradas.reduce((a, b) => (a > b ? a : b));
  const doisAnosAtras = new Date();
  doisAnosAtras.setFullYear(doisAnosAtras.getFullYear() - 2);

  if (maisRecente > doisAnosAtras && pagadores && pagadores.length > 0) {
    return [{
      tipo: "EMPRESA_RECENTE",
      confianca: 0.65,
      descricao: "Sócio(s) entraram recentemente na sociedade",
      evidencia: maisRecente.toISOString().slice(0, 10),
    }];
  }
  return [];
}

function sinaisEndereco(enderecoCompartilhado?: string[]): SinalEmpresa[] {
  if (!enderecoCompartilhado || enderecoCompartilhado.length < 2) return [];
  return [{
    tipo: "ENDERECO_COMPARTILHADO",
    confianca: 0.7,
    descricao: `Endereço compartilhado com ${enderecoCompartilhado.length} CNPJ(s) investigados`,
    evidencia: enderecoCompartilhado.slice(0, 3).join(", "),
  }];
}

function sinaisCnaeEmpresa(cnpjData?: CnpjData, pagadores?: PagadorPolitico[]): SinalEmpresa[] {
  if (!cnpjData?.cnaeFiscal || !pagadores?.length) return [];

  const tipos = pagadores.flatMap((p) => p.tiposDespesa);
  const locacao = tipos.some((t) => t.toLowerCase().includes("locação") || t.toLowerCase().includes("locacao"));
  const cnaeLocacao = CNAE_LOCACAO_VEICULOS.includes(cnpjData.cnaeFiscal);

  if (locacao && !cnaeLocacao) {
    return [{
      tipo: "CNAE_INCOMPATIVEL",
      confianca: 0.75,
      descricao: `CNAE "${cnpjData.cnaeFiscalDescricao}" incompatível com despesas de locação cobradas`,
      evidencia: `CNAE ${cnpjData.cnaeFiscal}`,
    }];
  }
  return [];
}

export function calcularPlausibilidade(input: RiscoEmpresaInput, sinais: SinalEmpresa[]): PlausibilidadeOperacional {
  const favor: string[] = [];
  const contra: string[] = [];

  if (input.maps?.encontrado && input.maps.notaMedia && input.maps.notaMedia >= 3.5) {
    favor.push(`Google Maps ativo com nota ${input.maps.notaMedia}`);
  } else if (input.maps && !input.maps.encontrado) {
    contra.push("Sem presença verificável no Google Maps");
  }

  if (input.astroturfing?.suspeito) contra.push("Indícios de astroturfing em reviews");
  if (input.siteCheck?.dominioApostas) contra.push("Site redireciona para domínio de apostas");
  if (!input.siteCheck?.acessivel && input.tinhaUrl) contra.push("Site inacessível");
  if (!input.tinhaUrl) contra.push("Sem presença digital nos dados cadastrais");

  const cnaeOk = !sinais.some((s) => s.tipo === "CNAE_INCOMPATIVEL");
  if (cnaeOk && input.cnpjData?.cnaeFiscalDescricao) {
    favor.push(`CNAE compatível: ${input.cnpjData.cnaeFiscalDescricao}`);
  } else if (sinais.some((s) => s.tipo === "CNAE_INCOMPATIVEL")) {
    contra.push("CNAE incompatível com serviços cobrados");
  }

  if (input.enderecoCompartilhado && input.enderecoCompartilhado.length >= 2) {
    contra.push("Endereço compartilhado com múltiplos CNPJs");
  } else if (input.cnpjData?.logradouro) {
    favor.push("Endereço comercial cadastrado");
  }

  const scoreBase = 0.5 + favor.length * 0.12 - contra.length * 0.15;
  const score = Math.max(0, Math.min(1, scoreBase));

  let classificacao: PlausibilidadeOperacional["classificacao"];
  if (score >= 0.65) classificacao = "ALTA";
  else if (score >= 0.4) classificacao = "MEDIA";
  else classificacao = "BAIXA";

  return { score: Number(score.toFixed(2)), classificacao, evidenciasFavor: favor, evidenciasContra: contra };
}

export function calcularRiscoEmpresa(input: RiscoEmpresaInput): {
  sinais: SinalEmpresa[];
  score: number;
  classificacao: InvestigacaoFornecedor["classificacao"];
  plausibilidade: PlausibilidadeOperacional;
} {
  const tinhaUrl = input.tinhaUrl ?? Boolean(input.cnpjData?.email);
  const sinaisSiteList = input.siteCheck ? (sinaisSite(input.siteCheck, tinhaUrl) as SinalEmpresa[]) : [];
  const sinais: SinalEmpresa[] = [
    ...sinaisPagadores(input.pagadores),
    ...sinaisSiteList,
    ...(!tinhaUrl && sinaisSiteList.length === 0
      ? [{ tipo: "SEM_PRESENCA_DIGITAL" as const, confianca: 0.5, descricao: "Sem site/e-mail corporativo identificável" }]
      : []),
    ...sinaisMapsEmpresa(input.maps),
    ...sinaisAstroturfing(input.astroturfing),
    ...sinaisSocios(input.socios, input.socioAlteradoRecente),
    ...sinaisEmpresaRecente(input.cnpjData, input.pagadores),
    ...sinaisEndereco(input.enderecoCompartilhado),
    ...sinaisCnaeEmpresa(input.cnpjData, input.pagadores),
    ...(input.cnpjData ? sinaisCnpj(input.cnpjData) as SinalEmpresa[] : []),
  ];

  const score =
    sinais.length === 0
      ? 0
      : sinais.reduce((sum, s) => sum + s.confianca, 0) / sinais.length;

  const convergencia = sinais.length >= 3 ? 0.1 : 0;
  const bonusCritico = sinais.filter((s) =>
    ["SITE_DOMINIO_APOSTAS", "ASTROTURFING_REVIEWS", "SOCIO_VINCULO_POLITICO"].includes(s.tipo),
  ).length * 0.08;

  const scoreFinal = Math.min(1, score + convergencia + bonusCritico);
  const plausibilidade = calcularPlausibilidade(input, sinais);

  return {
    sinais,
    score: Number(scoreFinal.toFixed(2)),
    classificacao: classificarScore(scoreFinal),
    plausibilidade,
  };
}
