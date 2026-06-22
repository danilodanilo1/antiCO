import { useState } from "react";

type ModoBusca = "politico" | "empresa";

interface Props {
  cargos: Array<{ id: string; label: string }>;
  suggestions: Array<{ id: string; nome: string; cargo: string; titulo?: string; partido: string; uf: string; fonte: string }>;
  searching?: boolean;
  onSearch: (nome: string) => void;
  onSelectSuggestion: (p: { nome: string }) => void;
  onSubmit: (params: {
    nome: string;
    cargo: string;
    tipoDespesa: string;
    ano: string;
    apenasAnomalias: boolean;
    limite: number;
  }) => void;
  onSubmitEmpresa: (cnpj: string) => void;
  disabled: boolean;
}

function formatCnpjInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function SearchForm({
  cargos,
  suggestions,
  searching,
  onSearch,
  onSelectSuggestion,
  onSubmit,
  onSubmitEmpresa,
  disabled,
}: Props) {
  const [modo, setModo] = useState<ModoBusca>("politico");
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [cargo, setCargo] = useState("auto");
  const [tipoDespesa, setTipoDespesa] = useState("");
  const [ano, setAno] = useState("");
  const [apenasAnomalias, setApenasAnomalias] = useState(true);
  const [limite, setLimite] = useState(10);
  const [showSuggestions, setShowSuggestions] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setShowSuggestions(false);
    if (modo === "empresa") {
      onSubmitEmpresa(cnpj.replace(/\D/g, ""));
      return;
    }
    onSubmit({ nome, cargo, tipoDespesa, ano, apenasAnomalias, limite });
  }

  function selectSuggestion(item: { nome: string }) {
    setNome(item.nome);
    setShowSuggestions(false);
    onSelectSuggestion(item);
  }

  const isCargoEspecial = cargo === "presidente-camara" || cargo === "presidente-senado";
  const cnpjValido = cnpj.replace(/\D/g, "").length === 14;

  return (
    <section className="search-panel">
      <div className="modo-toggle">
        <button
          type="button"
          className={modo === "politico" ? "active" : ""}
          onClick={() => setModo("politico")}
          disabled={disabled}
        >
          Político
        </button>
        <button
          type="button"
          className={modo === "empresa" ? "active" : ""}
          onClick={() => setModo("empresa")}
          disabled={disabled}
        >
          Empresa (CNPJ)
        </button>
      </div>

      <form onSubmit={handleSubmit} className="search-form">
        {modo === "politico" ? (
          <div className="form-grid">
            <div className="field field-wide autocomplete-wrap">
              <label htmlFor="nome">Político</label>
              <input
                id="nome"
                type="text"
                placeholder={isCargoEspecial ? "Opcional para cargo especial" : "Ex: Nikolas Ferreira, Hugo Motta..."}
                value={nome}
                disabled={disabled}
                onChange={(e) => {
                  setNome(e.target.value);
                  setShowSuggestions(true);
                  onSearch(e.target.value);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              />
              {showSuggestions && searching && (
                <div className="suggestions-empty">Buscando...</div>
              )}
              {showSuggestions && !searching && nome.length >= 2 && suggestions.length === 0 && (
                <div className="suggestions-empty">Nenhum político encontrado.</div>
              )}
              {showSuggestions && suggestions.length > 0 && (
                <ul className="suggestions">
                  {suggestions.map((s) => (
                    <li key={s.id}>
                      <button type="button" onMouseDown={() => selectSuggestion(s)}>
                        <strong>{s.nome}</strong>
                        <span>
                          {s.cargo}
                          {s.titulo ? ` · ${s.titulo}` : ""}
                          {" · "}{s.partido}/{s.uf} · {s.fonte}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="field">
              <label htmlFor="cargo">Cargo / Casa</label>
              <select id="cargo" value={cargo} disabled={disabled} onChange={(e) => setCargo(e.target.value)}>
                {cargos.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="tipo">Tipo de despesa</label>
              <input
                id="tipo"
                type="text"
                placeholder="Ex: Locação, Aluguel..."
                value={tipoDespesa}
                disabled={disabled}
                onChange={(e) => setTipoDespesa(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="ano">Ano</label>
              <input
                id="ano"
                type="number"
                placeholder="2024"
                min={2008}
                max={2030}
                value={ano}
                disabled={disabled}
                onChange={(e) => setAno(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="limite">Limite fornecedores</label>
              <input
                id="limite"
                type="number"
                min={1}
                max={50}
                value={limite}
                disabled={disabled}
                onChange={(e) => setLimite(Number(e.target.value))}
              />
            </div>

            <div className="field field-check">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={apenasAnomalias}
                  disabled={disabled}
                  onChange={(e) => setApenasAnomalias(e.target.checked)}
                />
                Apenas anomalias financeiras
              </label>
            </div>
          </div>
        ) : (
          <div className="form-grid">
            <div className="field field-wide">
              <label htmlFor="cnpj">CNPJ</label>
              <input
                id="cnpj"
                type="text"
                placeholder="00.000.000/0000-00"
                value={cnpj}
                disabled={disabled}
                onChange={(e) => setCnpj(formatCnpjInput(e.target.value))}
              />
              <small className="field-hint">Ex: 49.000.815/0001-60 (Nacional Rent A Car)</small>
            </div>
          </div>
        )}

        <button
          type="submit"
          className="btn-primary"
          disabled={disabled || (modo === "politico" ? !nome && !isCargoEspecial : !cnpjValido)}
        >
          {disabled
            ? "Investigando..."
            : modo === "empresa"
              ? "Investigar empresa"
              : "Investigar despesas"}
        </button>
      </form>
    </section>
  );
}
