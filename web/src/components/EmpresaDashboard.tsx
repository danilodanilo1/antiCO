import { useState } from "react";
import type { InvestigacaoEmpresa } from "../api";
import { formatBRL, formatCnpj, formatPercent, classificacaoColor, fonteLabel, formatDateShort } from "../utils";
import { SinaisList, scrollToSinalEvidencia } from "./SinaisList";
import { PagadorExpander } from "./PagadorExpander";

interface Props {
  result: InvestigacaoEmpresa;
}

function scrollToSinais() {
  document.getElementById("sinais-risco")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function EmpresaDashboard({ result }: Props) {
  const [expandedSocio, setExpandedSocio] = useState<number | null>(0);
  const cls = classificacaoColor(result.classificacao);
  const plausCls =
    result.plausibilidade.classificacao === "BAIXA"
      ? "alto"
      : result.plausibilidade.classificacao === "ALTA"
        ? "baixo"
        : "medio";

  const maxPagador = result.pagadores[0]?.totalGasto ?? 1;

  return (
    <section className="results-dashboard empresa-dashboard">
      <header className="results-header selectable-text">
        <div>
          <h2>{result.cnpjData?.razaoSocial ?? formatCnpj(result.cnpj)}</h2>
          <p className="results-meta">
            CNPJ <span className="mono-copy">{formatCnpj(result.cnpj)}</span>
            {result.cnpjData?.nomeFantasia ? ` · ${result.cnpjData.nomeFantasia}` : ""}
            {result.ultimoGasto ? ` · Último gasto: ${formatDateShort(result.ultimoGasto)}` : ""}
          </p>
        </div>
        <div className="results-badges">
          <span className={`badge badge-${cls}`}>Risco {result.classificacao}</span>
          <span className={`badge badge-${plausCls}`}>
            Plausibilidade {result.plausibilidade.classificacao}
          </span>
          <button type="button" className="score-pill score-pill-btn" onClick={scrollToSinais} title="Ver sinais de risco">
            {result.score.toFixed(2)}
          </button>
        </div>
        {result.sinais.length > 0 && (
          <div className="header-sinais-row">
            {result.sinais.map((s, i) => (
              <button
                key={`hdr-${s.tipo}-${i}`}
                type="button"
                className="sinal-chip"
                onClick={() => {
                  scrollToSinais();
                  window.setTimeout(() => scrollToSinalEvidencia("empresa", i), 350);
                }}
              >
                {s.tipo}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="empresa-grid">
        <div className="stat-cards">
          <div className="stat-card">
            <span>Total recebido</span>
            <strong>{formatBRL(result.totalRecebido)}</strong>
          </div>
          <div className="stat-card">
            <span>Políticos pagadores</span>
            <strong>{result.pagadores.length}</strong>
          </div>
          <div className="stat-card">
            <span>Sócios</span>
            <strong>{result.socios.length}</strong>
          </div>
          <button type="button" className="stat-card stat-card-clickable" onClick={scrollToSinais}>
            <span>Sinais de risco</span>
            <strong>{result.sinais.length}</strong>
          </button>
        </div>

        {result.cnpjData && (
          <div className="detail-block">
            <h3>Dados cadastrais</h3>
            <dl className="cadastro-dl">
              <div><dt>Situação</dt><dd>{result.cnpjData.situacaoCadastral}</dd></div>
              {result.cnpjData.cnaeFiscalDescricao && (
                <div><dt>CNAE</dt><dd>{result.cnpjData.cnaeFiscalDescricao}</dd></div>
              )}
              {result.cnpjData.municipio && (
                <div>
                  <dt>Endereço</dt>
                  <dd>
                    {result.cnpjData.logradouro} {result.cnpjData.numero},{" "}
                    {result.cnpjData.municipio}/{result.cnpjData.uf}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}

        <div className="detail-block">
          <h3>Políticos pagadores</h3>
          {result.pagadores.length === 0 ? (
            <p className="muted">Nenhum pagador encontrado nos índices CEAPS/CEAP.</p>
          ) : (
            <>
              <div className="concentracao-chart">
                {result.pagadores.slice(0, 8).map((p) => (
                  <div key={`${p.fonte}-${p.nome}`} className="bar-row">
                    <span className="bar-label" title={p.nome}>
                      {p.nome.length > 22 ? `${p.nome.slice(0, 22)}…` : p.nome}
                    </span>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{ width: `${(p.totalGasto / maxPagador) * 100}%` }}
                      />
                    </div>
                    <span className="bar-value">{formatBRL(p.totalGasto)}</span>
                  </div>
                ))}
              </div>
              <table className="pagadores-table">
                <thead>
                  <tr>
                    <th>Político</th>
                    <th>Fonte</th>
                    <th>Notas</th>
                    <th>Último gasto</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {result.pagadores.map((p) => (
                    <PagadorExpander key={`${p.fonte}-${p.nome}`} cnpj={result.cnpj} pagador={p} />
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        {result.maps && (
          <div className="detail-block">
            <h3>Google Maps</h3>
            {result.maps.encontrado && (result.maps.notaMedia || result.maps.totalAvaliacoes) ? (
              <>
                <p>
                  Nota {result.maps.notaMedia?.toFixed(1) ?? "—"} ·{" "}
                  {result.maps.totalAvaliacoes ?? 0} avaliações
                </p>
                {result.maps.url && (
                  <a href={result.maps.url} target="_blank" rel="noreferrer" className="link-maps">
                    Ver no Maps
                  </a>
                )}
                {result.maps.avaliacoes.length > 0 && (
                  <ul className="maps-reviews-preview">
                    {result.maps.avaliacoes.slice(0, 3).map((a, i) => (
                      <li key={`${a.autorNome}-${i}`}>
                        <strong>{a.autorNome}</strong> · {a.estrelas}★ — {a.texto.slice(0, 120)}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="muted">
                {result.maps.erro ??
                  "Empresa não encontrada ou sem presença verificável no Maps (Google pode bloquear scraping automatizado)."}
              </p>
            )}
            {result.astroturfing?.suspeito && (
              <div className="alert-astroturfing">
                <strong>Indício de astroturfing</strong>
                <ul>
                  {result.astroturfing.detalhes.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {result.socios.length > 0 && (
          <div className="detail-block">
            <h3>Sócios (QSA)</h3>
            {result.socios.map((s, i) => (
              <article key={s.nome} className="socio-card">
                <header onClick={() => setExpandedSocio(expandedSocio === i ? null : i)}>
                  <strong>{s.nome}</strong>
                  <span>{s.qualificacao}</span>
                  <span className="fornecedor-chevron">{expandedSocio === i ? "▲" : "▼"}</span>
                </header>
                {expandedSocio === i && (
                  <div className="socio-details">
                    {s.dataEntrada && <p>Entrada: {s.dataEntrada}</p>}
                    {s.vinculosPoliticos.length > 0 && (
                      <>
                        <h6>Vínculos políticos</h6>
                        <ul>{s.vinculosPoliticos.map((v) => <li key={v}>{v}</li>)}</ul>
                      </>
                    )}
                    {s.outrasEmpresas.length > 0 && (
                      <>
                        <h6>Outras empresas</h6>
                        <ul>{s.outrasEmpresas.map((e) => <li key={e}>{e}</li>)}</ul>
                      </>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        <div className="detail-block">
          <h3>Plausibilidade operacional</h3>
          <p className={`plausibilidade-label plaus-${result.plausibilidade.classificacao.toLowerCase()}`}>
            {result.plausibilidade.classificacao} ({formatPercent(result.plausibilidade.score)})
          </p>
          <div className="plaus-grid">
            <div>
              <h6>A favor</h6>
              {result.plausibilidade.evidenciasFavor.length === 0 ? (
                <p className="muted">Nenhuma evidência favorável.</p>
              ) : (
                <ul>{result.plausibilidade.evidenciasFavor.map((e) => <li key={e}>{e}</li>)}</ul>
              )}
            </div>
            <div>
              <h6>Contra</h6>
              {result.plausibilidade.evidenciasContra.length === 0 ? (
                <p className="muted">Nenhuma evidência contra.</p>
              ) : (
                <ul>{result.plausibilidade.evidenciasContra.map((e) => <li key={e}>{e}</li>)}</ul>
              )}
            </div>
          </div>
        </div>

        <div className="detail-block" id="sinais-risco">
          <h3>Sinais de risco ({result.sinais.length})</h3>
          <SinaisList sinais={result.sinais} idPrefix="empresa" />
        </div>
      </div>
    </section>
  );
}
