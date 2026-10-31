import type { InvestigacaoPolitico, InvestigacaoFornecedor } from "../types/investigacao.js";
import { labelCargo, labelFonte } from "../types/politico.js";
import { formatCnpj } from "../utils/cnpj.js";

function formatarSinais(inv: InvestigacaoFornecedor): string {
  if (inv.sinais.length === 0) return "_Nenhum sinal detectado._\n";

  return inv.sinais
    .map(
      (s) =>
        `- **${s.tipo}** [${s.categoria ?? "CONTEXTO"}]\n  ${s.descricao}${s.evidencia ? `\n  _Evidência: ${s.evidencia}_` : ""}${s.fonte ? `\n  _Fonte: ${s.url ? `[${s.fonte}](${s.url})` : s.fonte}_` : ""}`,
    )
    .join("\n");
}

function formatarFornecedor(inv: InvestigacaoFornecedor, index: number): string {
  const f = inv.fornecedor;
  const cnpj = inv.cnpjData;

  let bloco = `### ${index + 1}. ${f.nomeFornecedor}\n\n`;
  bloco += `| Campo | Valor |\n|-------|-------|\n`;
  bloco += `| CNPJ | ${formatCnpj(f.cnpjCpf)} |\n`;
  bloco += `| Total gasto | R$ ${f.totalGasto.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} |\n`;
  bloco += `| Notas | ${f.quantidadeNotas} |\n`;
  bloco += `| Valor máximo | R$ ${f.valorMaximo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} |\n`;
  bloco += `| Score | **${inv.score}** (${inv.classificacao}) |\n\n`;

  if (cnpj) {
    bloco += `**Razão social:** ${cnpj.razaoSocial}  \n`;
    bloco += `**Situação:** ${cnpj.situacaoCadastral}  \n`;
    if (cnpj.cnaeFiscalDescricao) bloco += `**CNAE:** ${cnpj.cnaeFiscalDescricao}  \n`;
    if (cnpj.municipio) bloco += `**Endereço:** ${cnpj.logradouro ?? ""} ${cnpj.numero ?? ""}, ${cnpj.municipio}/${cnpj.uf}  \n`;
    if (cnpj.socios.length > 0) {
      bloco += `\n**Sócios (QSA):**\n`;
      for (const socio of cnpj.socios) {
        bloco += `- ${socio.nome} — ${socio.qualificacao}\n`;
      }
    }
    bloco += "\n";
  }

  if (inv.siteCheck) {
    bloco += `**Site:** ${inv.siteCheck.urlOriginal ?? "N/A"}  \n`;
    if (inv.siteCheck.urlFinal && inv.siteCheck.urlFinal !== inv.siteCheck.urlOriginal) {
      bloco += `**Redirect:** ${inv.siteCheck.urlFinal}  \n`;
    }
    bloco += "\n";
  }

  bloco += `**Sinais de risco:**\n\n${formatarSinais(inv)}\n`;

  return bloco;
}

export function gerarRelatorioMarkdown(resultado: InvestigacaoPolitico): string {
  const { politico } = resultado;
  const data = new Date(resultado.geradoEm).toLocaleString("pt-BR");

  let md = `# Dossiê de Investigação — ${politico.nome}\n\n`;
  md += `> Gerado em ${data} | antiCO v0.3 | Modo: regras determinísticas (sem IA)\n\n`;
  md += `> **Indícios para investigação a partir de dados públicos. Não constitui prova de ilícito.** Confira cada fonte antes de qualquer conclusão.\n\n`;
  if (resultado.avisos?.length) {
    md += `## ⚠️ Resultado parcial\n\n`;
    for (const a of resultado.avisos) {
      md += `- **${a.fonte}:** ${a.mensagem}${a.alternativa ? ` Usado no lugar: ${a.alternativa}.` : ""}\n`;
    }
    md += "\n";
  }

  md += `## Resumo\n\n`;
  md += `- **Político:** ${politico.nome}\n`;
  md += `- **Cargo:** ${labelCargo(politico)}${politico.titulo ? ` (${politico.titulo})` : ""}\n`;
  md += `- **Partido/UF:** ${politico.siglaPartido}/${politico.siglaUf}\n`;
  md += `- **Fonte de dados:** ${labelFonte(politico.fonte)}\n`;
  if (resultado.tipoDespesaFiltro) {
    md += `- **Filtro de despesa:** ${resultado.tipoDespesaFiltro}\n`;
  }
  md += `- **Total de despesas analisadas:** ${resultado.totalDespesas}\n`;
  md += `- **Fornecedores únicos (CNPJ):** ${resultado.totalFornecedores}\n`;
  md += `- **Fornecedores investigados neste relatório:** ${resultado.fornecedores.length}\n\n`;

  const criticos = resultado.fornecedores.filter((f) => f.classificacao === "CRITICO" || f.classificacao === "ALTO");
  if (criticos.length > 0) {
    md += `## ⚠️ Prioridade de investigação\n\n`;
    for (const c of criticos) {
      md += `- **${c.fornecedor.nomeFornecedor}** — score ${c.score} (${c.classificacao})\n`;
    }
    md += "\n";
  }

  md += `## Fornecedores\n\n`;
  resultado.fornecedores.forEach((inv, i) => {
    md += formatarFornecedor(inv, i);
    md += "---\n\n";
  });

  md += `## Metodologia\n\n`;
  md += `Este relatório cruza dados públicos federais:\n`;
  md += `1. **Câmara:** API de Dados Abertos (CEAP — despesas de deputados e mesa diretora)\n`;
  md += `2. **Senado:** CSV CEAPS + API Legislativa (despesas de senadores e mesa diretora)\n`;
  md += `3. **CNPJ:** BrasilAPI / Minha Receita (QSA, CNAE, situação cadastral)\n`;
  md += `4. Verificação HTTP de sites corporativos\n`;
  md += `5. Pessoal de gabinete da Câmara (quando coletado)\n\n`;
  md += `**Classificação:** FATO = dado oficial verificável; INDICIO = padrão suspeito que precisa de outros sinais; CONTEXTO = comum em empresas legítimas, não pontua. CRÍTICO exige 1 fato e 2 indícios; ALTO, 1 fato ou 3 indícios; MÉDIO, 2 indícios.\n\n`;
  md += `**Nota:** Os resultados indicam *indícios* para investigação jornalística ou jurídica, não constituem prova de ilícito.\n`;

  return md;
}
