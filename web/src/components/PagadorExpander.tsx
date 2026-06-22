import { useState } from "react";
import type { NotaPagador, PagadorPolitico } from "../api";
import { buscarNotasPagador } from "../api";
import { formatBRL, formatDateShort, fonteLabel } from "../utils";

interface Props {
  cnpj: string;
  pagador: PagadorPolitico;
}

export function PagadorExpander({ cnpj, pagador }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notas, setNotas] = useState<NotaPagador[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (notas !== null) return;

    setLoading(true);
    setError(null);
    try {
      const data = await buscarNotasPagador(cnpj, pagador.nome, pagador.fonte);
      setNotas(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <tr className={`pagador-row ${open ? "pagador-row-open" : ""}`}>
        <td>
          <button type="button" className="pagador-toggle" onClick={toggle}>
            <span className="pagador-chevron">{open ? "▼" : "▶"}</span>
            {pagador.nome}
            {pagador.partido && pagador.partido !== "—" ? ` (${pagador.partido}/${pagador.uf})` : ""}
          </button>
        </td>
        <td>{fonteLabel(pagador.fonte)}</td>
        <td>{pagador.quantidadeNotas}</td>
        <td>{pagador.ultimaDespesa ? formatDateShort(pagador.ultimaDespesa) : "—"}</td>
        <td>{formatBRL(pagador.totalGasto)}</td>
      </tr>
      {open && (
        <tr className="pagador-notas-row">
          <td colSpan={5}>
            <div className="pagador-notas-panel">
              <p className="pagador-notas-fonte">
                Fonte: CSV oficial {pagador.fonte === "camara" ? "CEAP (Câmara)" : "CEAPS (Senado)"} — cada linha é uma nota reembolsada
              </p>
              {loading && <p className="muted">Carregando notas fiscais...</p>}
              {error && <p className="error-text">{error}</p>}
              {notas && notas.length === 0 && !loading && (
                <p className="muted">Nenhuma nota encontrada nos CSVs para este pagador.</p>
              )}
              {notas && notas.length > 0 && (
                <ul className="notas-list">
                  {notas.map((n, i) => (
                    <li key={`${n.data}-${n.valor}-${i}`} className="nota-item">
                      <div className="nota-meta">
                        <span className="nota-data">{n.data ? formatDateShort(n.data) : "—"}</span>
                        <span className="nota-valor">{formatBRL(n.valor)}</span>
                        {n.numeroDocumento && (
                          <span className="nota-num">NF {n.numeroDocumento}</span>
                        )}
                        <span className="nota-fonte">{n.fonteDado}</span>
                      </div>
                      <p className="nota-tipo">{n.tipoDespesa}</p>
                      {n.urlDocumento ? (
                        <a
                          href={n.urlDocumento}
                          target="_blank"
                          rel="noreferrer"
                          className="nota-link"
                        >
                          Ver documento oficial ↗
                        </a>
                      ) : (
                        <span className="muted nota-sem-link">Documento sem URL no CSV</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
