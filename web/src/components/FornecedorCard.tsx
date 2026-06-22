import { useState } from "react";
import type { FornecedorInvestigacao } from "../api";
import { formatBRL, formatCnpj, classificacaoColor } from "../utils";
import { SinaisList, scrollToSinalEvidencia } from "./SinaisList";

interface Props {
  item: FornecedorInvestigacao;
  rank: number;
  onInvestigarEmpresa?: (cnpj: string) => void;
}

export function FornecedorCard({ item, rank, onInvestigarEmpresa }: Props) {
  const [expanded, setExpanded] = useState(rank <= 3);
  const f = item.fornecedor;
  const cls = classificacaoColor(item.classificacao);
  const cnpjDigits = f.cnpjCpf.replace(/\D/g, "");

  return (
    <article className={`fornecedor-card ${cls}`}>
      <header className="fornecedor-header" onClick={() => setExpanded(!expanded)}>
        <div className="fornecedor-rank">#{rank}</div>
        <div className="fornecedor-title">
          <h4>{f.nomeFornecedor}</h4>
          <span className="fornecedor-cnpj">{formatCnpj(f.cnpjCpf)}</span>
        </div>
        <div className="fornecedor-score">
          <span className={`badge badge-${cls}`}>{item.classificacao}</span>
          <span className="score-num">{item.score.toFixed(2)}</span>
        </div>
        <div className="fornecedor-chevron">{expanded ? "▲" : "▼"}</div>
      </header>

      <div className="score-bar">
        <div className={`score-fill ${cls}`} style={{ width: `${item.score * 100}%` }} />
      </div>

      <div className="fornecedor-metrics">
        <div><span>Total</span><strong>{formatBRL(f.totalGasto)}</strong></div>
        <div><span>Notas</span><strong>{f.quantidadeNotas}</strong></div>
        <div><span>Máximo</span><strong>{formatBRL(f.valorMaximo)}</strong></div>
        <div><span>Média</span><strong>{formatBRL(f.valorMedio)}</strong></div>
      </div>

      {cnpjDigits.length === 14 && onInvestigarEmpresa && (
        <div className="fornecedor-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={(e) => {
              e.stopPropagation();
              onInvestigarEmpresa(cnpjDigits);
            }}
          >
            Investigar empresa
          </button>
        </div>
      )}

      {item.sinais.length > 0 && (
        <div className="fornecedor-sinais-preview" onClick={(e) => e.stopPropagation()}>
          {item.sinais.map((s, i) => (
            <button
              key={`prev-${s.tipo}-${i}`}
              type="button"
              className="sinal-chip sinal-chip-sm"
              onClick={() => {
                setExpanded(true);
                window.setTimeout(() => scrollToSinalEvidencia(`fornecedor-${rank}`, i), 150);
              }}
            >
              {s.tipo}
            </button>
          ))}
        </div>
      )}

      {expanded && (
        <div className="fornecedor-details">
          {item.cnpjData && (
            <div className="detail-block">
              <h5>Dados cadastrais (CNPJ)</h5>
              <dl>
                <div><dt>Razão social</dt><dd>{item.cnpjData.razaoSocial}</dd></div>
                <div><dt>Situação</dt><dd>{item.cnpjData.situacaoCadastral}</dd></div>
                {item.cnpjData.cnaeFiscalDescricao && (
                  <div><dt>CNAE</dt><dd>{item.cnpjData.cnaeFiscalDescricao}</dd></div>
                )}
                {item.cnpjData.municipio && (
                  <div><dt>Endereço</dt><dd>{item.cnpjData.logradouro} {item.cnpjData.numero}, {item.cnpjData.municipio}/{item.cnpjData.uf}</dd></div>
                )}
              </dl>
              {item.cnpjData.socios.length > 0 && (
                <>
                  <h6>Sócios (QSA)</h6>
                  <ul className="socios-list">
                    {item.cnpjData.socios.map((s) => (
                      <li key={s.nome}><strong>{s.nome}</strong> — {s.qualificacao}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          <div className="detail-block">
            <h5>Sinais de risco ({item.sinais.length})</h5>
            <SinaisList sinais={item.sinais} idPrefix={`fornecedor-${rank}`} />
          </div>
        </div>
      )}
    </article>
  );
}
