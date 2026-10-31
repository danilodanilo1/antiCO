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
import { categorizar, pontuar } from "./pontuacao.js";

const FONTE_RECEITA = "Receita Federal (BrasilAPI / Minha Receita)";
const FONTE_COTA = "Cota parlamentar (CEAP Câmara / CEAPS Senado)";

/**
 * CNAEs compatíveis com "Locação ou fretamento de veículos automotores".
 * Inclui locação sem condutor (77.1x), com motorista (49.23-0-02) e fretamento (49.29).
 */
const CNAE_LOCACAO_VEICULOS = new Set([
  7711000, 7719501, 7719502, 7719599, 7719601, 7719602, 7719603, 7719604, 7719699,
  4923001, 4923002, 4929901, 4929902, 4929903, 4929904, 4929999,
]);

/** Dias entre abertura da empresa e o primeiro pagamento abaixo dos quais vira indício. */
const DIAS_EMPRESA_RECENTE = 180;

function brl(valor: number): string {
  return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function despesaDeLocacao(tipoDespesa?: string): boolean {
  if (!tipoDespesa) return false;
  const t = tipoDespesa.toLowerCase();
  return t.includes("locação") || t.includes("locacao") || t.includes("fretamento");
}

function cnaeCompativelComLocacao(cnpjData: CnpjData): boolean {
  const cnaes = [cnpjData.cnaeFiscal, ...(cnpjData.cnaesSecundarios ?? [])].filter(
    (c): c is number => typeof c === "number",
  );
  return cnaes.some((c) => CNAE_LOCACAO_VEICULOS.has(c));
}

function sinaisFinanceiros(fornecedor: FornecedorAgrupado): SinalRisco[] {
  const sinais: SinalRisco[] = [];

  if (fornecedor.valorMaximo > config.anomalyThresholdReais) {
    sinais.push({
      tipo: "VALOR_ALTO",
      confianca: 0.5,
      descricao: `Nota individual de ${brl(fornecedor.valorMaximo)}, acima do limiar de ${brl(config.anomalyThresholdReais)}`,
      evidencia: `Máximo: ${brl(fornecedor.valorMaximo)}`,
      fonte: FONTE_COTA,
    });
  }

  if (fornecedor.quantidadeNotas >= 3 && fornecedor.valorMedio >= config.anomalyThresholdReais * 0.5) {
    sinais.push({
      tipo: "CONCENTRACAO_FORNECEDOR",
      confianca: 0.5,
      descricao: `${fornecedor.quantidadeNotas} notas com valor médio de ${brl(fornecedor.valorMedio)}`,
      evidencia: `Total: ${brl(fornecedor.totalGasto)}`,
      fonte: FONTE_COTA,
    });
  }

  return sinais;
}

function sinaisCnpj(cnpjData: CnpjData | undefined, tiposDespesa: string[] = []): SinalRisco[] {
  if (!cnpjData) return [];

  const sinais: SinalRisco[] = [];
  const situacao = cnpjData.situacaoCadastral.toUpperCase();

  if (situacao !== "DESCONHECIDA" && !situacao.includes("ATIVA")) {
    sinais.push({
      tipo: "CNPJ_INATIVO",
      confianca: 0.9,
      descricao: `Situação cadastral atual: ${cnpjData.situacaoCadastral}`,
      evidencia: cnpjData.dataSituacaoCadastral
        ? `Desde ${cnpjData.dataSituacaoCadastral}. Conferir se já estava assim na data dos pagamentos.`
        : undefined,
      fonte: FONTE_RECEITA,
    });
  }

  if (tiposDespesa.some(despesaDeLocacao) && cnpjData.cnaeFiscal && !cnaeCompativelComLocacao(cnpjData)) {
    sinais.push({
      tipo: "CNAE_INCOMPATIVEL",
      confianca: 0.7,
      descricao: `Nenhum CNAE da empresa (principal: "${cnpjData.cnaeFiscalDescricao ?? cnpjData.cnaeFiscal}") é de locação ou fretamento de veículos`,
      evidencia: `CNAE principal ${cnpjData.cnaeFiscal}`,
      fonte: FONTE_RECEITA,
    });
  }

  return sinais;
}

function sinaisSite(siteCheck: SiteCheckResult | undefined, tinhaUrl: boolean): SinalRisco[] {
  if (!tinhaUrl) {
    return [{
      tipo: "SEM_PRESENCA_DIGITAL",
      confianca: 0.3,
      descricao: "Sem e-mail corporativo ou site nos dados cadastrais (comum em empresas pequenas)",
      fonte: FONTE_RECEITA,
    }];
  }
  if (!siteCheck) return [];

  const sinais: SinalRisco[] = [];

  if (!siteCheck.acessivel) {
    sinais.push({
      tipo: "SITE_INACESSIVEL",
      confianca: 0.4,
      descricao: "Site informado está inacessível",
      evidencia: siteCheck.erro ?? `Status: ${siteCheck.statusCode}`,
      url: siteCheck.urlOriginal,
    });
  }

  if (siteCheck.dominioApostas) {
    sinais.push({
      tipo: "SITE_DOMINIO_APOSTAS",
      confianca: 0.85,
      descricao: "O site da empresa abre uma página de apostas ou cassino",
      evidencia: siteCheck.motivoApostas
        ? `${siteCheck.urlFinal ?? siteCheck.urlOriginal} (${siteCheck.motivoApostas})`
        : siteCheck.urlFinal,
      fonte: "Acesso ao site do cadastro",
      url: siteCheck.urlFinal ?? siteCheck.urlOriginal,
    });
  } else if (siteCheck.redirectSuspeito) {
    sinais.push({
      tipo: "SITE_REDIRECT_SUSPEITO",
      confianca: 0.7,
      descricao: "Site redireciona para outro domínio",
      evidencia: `${siteCheck.urlOriginal} → ${siteCheck.urlFinal}`,
      url: siteCheck.urlFinal,
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
  const tiposDespesa = tipoDespesa
    ? [tipoDespesa]
    : [...new Set(fornecedor.despesas.map((d) => d.tipoDespesa).filter(Boolean))];

  const sinais = categorizar([
    ...sinaisFinanceiros(fornecedor),
    ...sinaisCnpj(cnpjData, tiposDespesa),
    ...(cnpjData ? sinaisSite(siteCheck, tinhaUrl) : []),
  ]);

  const { score, classificacao } = pontuar(sinais);

  return { fornecedor, cnpjData, siteCheck, sinais, score, classificacao };
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
      confianca: 0.4,
      descricao: `CNPJ recebeu da cota de ${pagadores.length} parlamentares distintos`,
      evidencia: pagadores.slice(0, 5).map((p) => p.nome).join(", "),
      fonte: FONTE_COTA,
    });
  }

  const total = pagadores.reduce((s, p) => s + p.totalGasto, 0);
  if (total > 0 && pagadores.length >= 1 && pagadores.length <= 3) {
    const top = pagadores[0]!;
    const pct = top.totalGasto / total;
    if (pct >= 0.8 && top.quantidadeNotas >= 3) {
      sinais.push({
        tipo: "CLIENTES_POLITICOS_CONCENTRADOS",
        confianca: 0.7,
        descricao: `${Math.round(pct * 100)}% do que o CNPJ recebeu da cota veio de ${top.nome}`,
        evidencia: `${brl(top.totalGasto)} de ${brl(total)} em ${top.quantidadeNotas} notas`,
        fonte: FONTE_COTA,
      });
    }
  }

  return sinais;
}

function sinaisMapsEmpresa(maps?: MapsResult): SinalEmpresa[] {
  if (!maps || maps.encontrado || maps.erro) return [];
  return [{
    tipo: "MAPS_AUSENTE",
    confianca: 0.3,
    descricao: "Empresa não encontrada no Google Maps",
    fonte: "Google Maps",
  }];
}

function sinaisAstroturfing(astroturfing?: AstroturfingResult): SinalEmpresa[] {
  if (!astroturfing) return [];
  const sinais: SinalEmpresa[] = [];

  if (astroturfing.suspeito) {
    sinais.push({
      tipo: "ASTROTURFING_REVIEWS",
      confianca: astroturfing.confianca,
      descricao: "Avaliações do Google Maps com padrão genérico ou repetido",
      evidencia: astroturfing.detalhes.slice(0, 2).join("; "),
      fonte: "Google Maps",
    });
  }

  if (astroturfing.avaliadoresCompartilhados.length > 0) {
    sinais.push({
      tipo: "AVALIADOR_COMPARTILHADO",
      confianca: 0.8,
      descricao: "Os mesmos avaliadores elogiam outras empresas investigadas",
      evidencia: `${astroturfing.avaliadoresCompartilhados.slice(0, 3).join(", ")} → ${astroturfing.empresasRelacionadas.slice(0, 3).join(", ")}`,
      fonte: "Google Maps",
    });
  }
  return sinais;
}

function sinaisSocios(socios: SocioEnriquecido[], socioAlteradoRecente?: boolean): SinalEmpresa[] {
  const sinais: SinalEmpresa[] = [];

  for (const s of socios) {
    for (const v of s.vinculosPoliticos) {
      sinais.push({
        tipo: "SOCIO_SERVIDOR_GABINETE",
        confianca: 0.85,
        descricao: `Sócio ${s.nome} tem o mesmo nome completo de servidor(a) do gabinete de ${v.parlamentar}`,
        evidencia: [v.cargo, v.periodo].filter(Boolean).join(" · ") || undefined,
        fonte: v.fonte,
        url: v.url,
      });
    }
  }

  if (socioAlteradoRecente) {
    sinais.push({
      tipo: "SOCIO_ALTERADO_RECENTE",
      confianca: 0.6,
      descricao: "Quadro societário mudou entre duas consultas do AntiCo",
      fonte: FONTE_RECEITA,
    });
  }

  return sinais;
}

function diasEntre(inicioIso: string, fimIso: string): number | null {
  const a = new Date(inicioIso.slice(0, 10));
  const b = new Date(fimIso.slice(0, 10));
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Empresa aberta pouco antes de começar a receber da cota. */
function sinaisEmpresaRecente(cnpjData?: CnpjData, pagadores: PagadorPolitico[] = []): SinalEmpresa[] {
  if (!cnpjData?.dataInicioAtividade) return [];
  const primeiras = pagadores.map((p) => p.primeiraDespesa).filter((d): d is string => Boolean(d)).sort();
  const primeira = primeiras[0];
  if (!primeira) return [];

  const dias = diasEntre(cnpjData.dataInicioAtividade, primeira);
  if (dias === null || dias < 0 || dias > DIAS_EMPRESA_RECENTE) return [];

  return [{
    tipo: "EMPRESA_RECENTE",
    confianca: 0.65,
    descricao: `Empresa aberta ${dias} dias antes do primeiro pagamento pela cota`,
    evidencia: `Abertura ${cnpjData.dataInicioAtividade}; primeiro pagamento ${primeira}`,
    fonte: `${FONTE_RECEITA} + ${FONTE_COTA}`,
  }];
}

function sinaisEndereco(enderecoCompartilhado?: string[]): SinalEmpresa[] {
  if (!enderecoCompartilhado || enderecoCompartilhado.length < 1) return [];
  return [{
    tipo: "ENDERECO_COMPARTILHADO",
    confianca: 0.6,
    descricao: `Mesmo endereço de ${enderecoCompartilhado.length} outro(s) CNPJ(s) já investigado(s)`,
    evidencia: enderecoCompartilhado.slice(0, 3).join(", "),
    fonte: FONTE_RECEITA,
  }];
}

export function calcularPlausibilidade(input: RiscoEmpresaInput, sinais: SinalEmpresa[]): PlausibilidadeOperacional {
  const favor: string[] = [];
  const contra: string[] = [];

  if (input.maps?.encontrado && input.maps.notaMedia && input.maps.notaMedia >= 3.5) {
    favor.push(`Google Maps ativo com nota ${input.maps.notaMedia}`);
  }

  if (sinais.some((s) => s.tipo === "AVALIADOR_COMPARTILHADO")) contra.push("Avaliadores em comum com outras empresas investigadas");
  if (input.siteCheck?.dominioApostas) contra.push("Site abre página de apostas");

  const cnaeIncompativel = sinais.some((s) => s.tipo === "CNAE_INCOMPATIVEL");
  if (cnaeIncompativel) {
    contra.push("CNAE incompatível com os serviços cobrados");
  } else if (input.cnpjData?.cnaeFiscalDescricao) {
    favor.push(`CNAE compatível: ${input.cnpjData.cnaeFiscalDescricao}`);
  }

  if (input.enderecoCompartilhado && input.enderecoCompartilhado.length >= 1) {
    contra.push("Endereço compartilhado com outros CNPJs investigados");
  } else if (input.cnpjData?.logradouro) {
    favor.push("Endereço comercial cadastrado");
  }

  if (sinais.some((s) => s.tipo === "EMPRESA_RECENTE")) contra.push("Aberta pouco antes de receber da cota");

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
  const tiposDespesa = input.pagadores.flatMap((p) => p.tiposDespesa);

  const sinais = categorizar<SinalEmpresa>([
    ...sinaisPagadores(input.pagadores),
    ...(input.cnpjData ? (sinaisSite(input.siteCheck, tinhaUrl) as SinalEmpresa[]) : []),
    ...sinaisMapsEmpresa(input.maps),
    ...sinaisAstroturfing(input.astroturfing),
    ...sinaisSocios(input.socios, input.socioAlteradoRecente),
    ...sinaisEmpresaRecente(input.cnpjData, input.pagadores),
    ...sinaisEndereco(input.enderecoCompartilhado),
    ...(sinaisCnpj(input.cnpjData, tiposDespesa) as SinalEmpresa[]),
  ]);

  const { score, classificacao } = pontuar(sinais);
  const plausibilidade = calcularPlausibilidade(input, sinais);

  return { sinais, score, classificacao, plausibilidade };
}
