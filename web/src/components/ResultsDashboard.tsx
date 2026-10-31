import type { InvestigacaoResult } from "../api";
import { formatBRL, formatDate, cargoLabel, fonteLabel } from "../utils";
import { FornecedorCard } from "./FornecedorCard";

interface Props {
  result: InvestigacaoResult;
  onInvestigarEmpresa?: (cnpj: string) => void;
}

export function ResultsDashboard({ result, onInvestigarEmpresa }: Props) {
  const { politico, fornecedores } = result;
  const maxScore = fornecedores.length > 0 ? Math.max(...fornecedores.map((f) => f.score)) : 0;
  const totalGasto = fornecedores.reduce((s, f) => s + f.fornecedor.totalGasto, 0);
  const criticos = fornecedores.filter((f) => f.classificacao === "CRITICO" || f.classificacao === "ALTO");

  return (
    <section className="results">
      <div className="politico-card">
        <div className="politico-info">
          <span className="politico-fonte">{fonteLabel(politico.fonte)}</span>
          <h2>{politico.nome}</h2>
          <p className="politico-meta">
            {cargoLabel(politico.cargo, politico.titulo)} · {politico.siglaPartido}/{politico.siglaUf}
          </p>
          {result.tipoDespesaFiltro && (
            <p className="politico-filtro">Filtro: {result.tipoDespesaFiltro}</p>
          )}
        </div>
        <div className="politico-time">
          <span>Gerado em</span>
          <time>{formatDate(result.geradoEm)}</time>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Despesas analisadas</span>
          <span className="stat-value">{result.totalDespesas}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Fornecedores (CNPJ)</span>
          <span className="stat-value">{result.totalFornecedores}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Investigados</span>
          <span className="stat-value">{fornecedores.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Gasto investigado</span>
          <span className="stat-value">{formatBRL(totalGasto)}</span>
        </div>
        <div className="stat-card stat-highlight">
          <span className="stat-label">Score máximo</span>
          <span className="stat-value">{maxScore.toFixed(2)}</span>
        </div>
        <div className="stat-card stat-alert">
          <span className="stat-label">Prioridade alta</span>
          <span className="stat-value">{criticos.length}</span>
        </div>
      </div>

      {criticos.length > 0 && (
        <div className="alert-strip">
          <strong>{criticos.length} fornecedor(es)</strong> com indícios altos ou críticos. Revisar as fontes de cada sinal antes de qualquer conclusão.
        </div>
      )}
      <p className="aviso-indicios">
        Classificação por regras: CRÍTICO exige 1 fato oficial e 2 indícios; ALTO, 1 fato ou 3 indícios. Sinais de contexto não pontuam.
        Indícios não constituem prova de ilícito.
      </p>

      {fornecedores.length === 0 ? (
        <div className="no-results">
          Nenhum fornecedor encontrado com os filtros aplicados.
        </div>
      ) : (
        <div className="fornecedores-list">
          <h3>Fornecedores por risco</h3>
          <div className="score-bar-legend">
            <span>Score de risco (0–1)</span>
            <div className="legend-colors">
              <span className="baixo">Baixo</span>
              <span className="medio">Médio</span>
              <span className="alto">Alto</span>
              <span className="critico">Crítico</span>
            </div>
          </div>
          {fornecedores.map((f, i) => (
            <FornecedorCard
              key={`${f.fornecedor.cnpjCpf}-${i}`}
              item={f}
              rank={i + 1}
              onInvestigarEmpresa={onInvestigarEmpresa}
            />
          ))}
        </div>
      )}
    </section>
  );
}
