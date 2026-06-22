import type { SinalRisco } from "../api";
import { formatPercent } from "../utils";

interface Props {
  sinais: SinalRisco[];
  idPrefix?: string;
  showChips?: boolean;
}

function scrollToEvidencia(elementId: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("sinal-highlight");
  void el.offsetWidth;
  el.classList.add("sinal-highlight");
  window.setTimeout(() => el.classList.remove("sinal-highlight"), 2200);
}

export function scrollToSinalEvidencia(idPrefix: string, index: number) {
  scrollToEvidencia(`${idPrefix}-evidencia-${index}`);
}

export function SinaisList({ sinais, idPrefix = "sinal", showChips = true }: Props) {
  if (sinais.length === 0) {
    return <p className="muted">Nenhum sinal detectado.</p>;
  }

  return (
    <>
      {showChips && (
        <div className="sinais-chips" role="navigation" aria-label="Atalhos para evidências">
          {sinais.map((s, i) => (
            <button
              key={`chip-${s.tipo}-${i}`}
              type="button"
              className="sinal-chip"
              title={`Ver evidência: ${s.tipo}`}
              onClick={() => scrollToEvidencia(`${idPrefix}-evidencia-${i}`)}
            >
              {s.tipo}
            </button>
          ))}
        </div>
      )}

      <ul className="sinais-list">
        {sinais.map((s, i) => {
          const evidenciaId = `${idPrefix}-evidencia-${i}`;
          return (
            <li key={`${s.tipo}-${i}`} className="sinal-item">
              <button
                type="button"
                className="sinal-header sinal-header-clickable"
                onClick={() => scrollToEvidencia(evidenciaId)}
                title="Ir para evidência"
              >
                <code>{s.tipo}</code>
                <span className="sinal-conf">{formatPercent(s.confianca)}</span>
              </button>
              <p className="sinal-descricao">{s.descricao}</p>
              <div id={evidenciaId} className="sinal-evidencia-block" tabIndex={-1}>
                <span className="sinal-evidencia-label">Evidência</span>
                {s.evidencia ? (
                  <p className="sinal-evidencia-texto">{s.evidencia}</p>
                ) : (
                  <p className="sinal-evidencia-texto sinal-evidencia-inferida">{s.descricao}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function SinaisChips({ sinais, idPrefix = "sinal" }: Pick<Props, "sinais" | "idPrefix">) {
  if (sinais.length === 0) return null;

  return (
    <div className="sinais-chips sinais-chips-inline" role="navigation" aria-label="Sinais de risco">
      {sinais.map((s, i) => (
        <button
          key={`chip-${s.tipo}-${i}`}
          type="button"
          className="sinal-chip"
          onClick={() => scrollToEvidencia(`${idPrefix}-evidencia-${i}`)}
        >
          {s.tipo}
        </button>
      ))}
    </div>
  );
}
