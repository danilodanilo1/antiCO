import { saveReport } from "../utils/files.js";
import { logger } from "../utils/logger.js";
import type { InvestigacaoEmpresa } from "../types/empresa.js";
import { formatCnpj, normalizeCnpj, isCnpj } from "../utils/cnpj.js";
import { calcularRiscoEmpresa } from "../scoring/risk-engine.js";
import { CnpjService } from "../services/brasilapi/cnpj.service.js";
import { cnpjIndex } from "../services/index/cnpj-index.service.js";
import { checkSite, inferSiteFromEmail } from "../services/site-checker.js";
import { googleMapsScraper } from "../services/scrapers/google-maps.scraper.js";
import { analisarAstroturfing } from "../services/analysis/astroturfing.analyzer.js";
import { socioRede } from "../services/socio/socio-rede.service.js";

export interface InvestigarEmpresaOptions {
  cnpj: string;
  incluirMaps?: boolean;
}

function gerarMarkdown(dossie: InvestigacaoEmpresa): string {
  const lines: string[] = [
    `# Dossiê Empresa — ${formatCnpj(dossie.cnpj)}`,
    "",
    `**Gerado em:** ${new Date(dossie.geradoEm).toLocaleString("pt-BR")}`,
    "> Indícios para investigação a partir de dados públicos. Não constitui prova de ilícito. Confira cada fonte antes de qualquer conclusão.",
    "",
    `**Classificação:** ${dossie.classificacao} (score ${dossie.score})`,
    `**Plausibilidade operacional:** ${dossie.plausibilidade.classificacao}`,
    "",
  ];

  if (dossie.cnpjData) {
    lines.push(
      "## Dados cadastrais",
      `- Razão social: ${dossie.cnpjData.razaoSocial}`,
      `- Situação: ${dossie.cnpjData.situacaoCadastral}`,
      `- CNAE: ${dossie.cnpjData.cnaeFiscalDescricao ?? "—"}`,
      `- Endereço: ${dossie.cnpjData.logradouro ?? ""} ${dossie.cnpjData.numero ?? ""}, ${dossie.cnpjData.municipio ?? ""}/${dossie.cnpjData.uf ?? ""}`,
      "",
    );
  }

  lines.push("## Políticos pagadores", "");
  if (dossie.pagadores.length === 0) {
    lines.push("_Nenhum pagador encontrado nos índices CEAPS/CEAP._", "");
  } else {
    for (const p of dossie.pagadores) {
      lines.push(
        `- **${p.nome}** (${p.fonte}) — R$ ${p.totalGasto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} · ${p.quantidadeNotas} nota(s)`,
      );
    }
    lines.push("");
  }

  if (dossie.socios.length > 0) {
    lines.push("## Sócios", "");
    for (const s of dossie.socios) {
      lines.push(`- **${s.nome}** — ${s.qualificacao}`);
      for (const v of s.vinculosPoliticos) {
        lines.push(`  - Mesmo nome completo de servidor(a) do gabinete de ${v.parlamentar}${v.cargo ? ` (${v.cargo}` : ""}${v.periodo ? `, ${v.periodo})` : v.cargo ? ")" : ""}. Fonte: ${v.url ? `[${v.fonte}](${v.url})` : v.fonte}`);
      }
      if (s.outrasEmpresas.length) lines.push(`  - Outras empresas: ${s.outrasEmpresas.join("; ")}`);
    }
    lines.push("");
  }

  lines.push("## Sinais de risco", "");
  for (const s of dossie.sinais) {
    const fonte = s.fonte ? ` Fonte: ${s.url ? `[${s.fonte}](${s.url})` : s.fonte}.` : "";
    lines.push(`- **${s.tipo}** [${s.categoria ?? "CONTEXTO"}]: ${s.descricao}${s.evidencia ? ` (${s.evidencia})` : ""}.${fonte}`);
  }
  lines.push("");

  lines.push("## Plausibilidade operacional", "");
  lines.push(`Classificação: **${dossie.plausibilidade.classificacao}** (score ${dossie.plausibilidade.score})`, "");
  if (dossie.plausibilidade.evidenciasFavor.length) {
    lines.push("Evidências a favor:", ...dossie.plausibilidade.evidenciasFavor.map((e) => `- ${e}`), "");
  }
  if (dossie.plausibilidade.evidenciasContra.length) {
    lines.push("Evidências contra:", ...dossie.plausibilidade.evidenciasContra.map((e) => `- ${e}`), "");
  }

  lines.push("---", "_Indícios para investigação — não constitui prova de ilícito._");
  return lines.join("\n");
}

export async function investigarEmpresa(options: InvestigarEmpresaOptions): Promise<InvestigacaoEmpresa & { reportPath?: string }> {
  const cnpj = normalizeCnpj(options.cnpj);
  if (!isCnpj(cnpj)) {
    throw new Error(`CNPJ inválido: ${options.cnpj}`);
  }

  logger.info(`Investigando empresa ${formatCnpj(cnpj)}...`);

  await cnpjIndex.ensureLoaded();

  const cnpjService = new CnpjService();
  const cnpjData = await cnpjService.consultar(cnpj);
  const pagadores = await cnpjIndex.buscarPagadores(cnpj);
  const totalRecebido = pagadores.reduce((s, p) => s + p.totalGasto, 0);

  const siteUrl = inferSiteFromEmail(cnpjData?.email);
  const siteCheck = siteUrl ? await checkSite(siteUrl) : await checkSite(undefined);

  let maps;
  let astroturfing;
  if (options.incluirMaps !== false && cnpjData) {
    maps = await googleMapsScraper.buscar(
      cnpjData.nomeFantasia ?? cnpjData.razaoSocial,
      cnpjData.municipio,
      cnpjData.uf,
      cnpj,
    );
    const compartilhados = await googleMapsScraper.buscarAvaliadoresCompartilhados(cnpj);
    astroturfing = analisarAstroturfing(maps, compartilhados.avaliadores, compartilhados.empresas);
  }

  let socios: InvestigacaoEmpresa["socios"] = [];
  let socioAlteradoRecente = false;
  if (cnpjData) {
    const enriquecido = await socioRede.enriquecerSocios(cnpjData);
    socios = enriquecido.socios;
    socioAlteradoRecente = enriquecido.socioAlteradoRecente;
  }

  const enderecoCompartilhado = cnpjData
    ? await socioRede.buscarCnpjsPorEndereco(cnpjData.cep, cnpjData.logradouro)
    : [];

  const { sinais, score, classificacao, plausibilidade } = calcularRiscoEmpresa({
    cnpjData: cnpjData ?? undefined,
    pagadores,
    siteCheck,
    maps,
    astroturfing,
    socios,
    socioAlteradoRecente,
    enderecoCompartilhado: enderecoCompartilhado.filter((c) => c !== cnpj),
    tinhaUrl: Boolean(siteUrl),
  });

  const dossie: InvestigacaoEmpresa = {
    cnpj,
    cnpjData: cnpjData ?? undefined,
    pagadores,
    totalRecebido,
    siteCheck,
    maps,
    astroturfing,
    socios,
    sinais,
    score,
    classificacao,
    plausibilidade,
    geradoEm: new Date().toISOString(),
    ultimoGasto: pagadores.reduce<string | undefined>((max, p) => {
      if (!p.ultimaDespesa) return max;
      return !max || p.ultimaDespesa > max ? p.ultimaDespesa : max;
    }, undefined),
  };

  const markdown = gerarMarkdown(dossie);
  const reportPath = await saveReport(`dossie-empresa-${cnpj}-${Date.now()}.md`, markdown);

  return { ...dossie, reportPath };
}
