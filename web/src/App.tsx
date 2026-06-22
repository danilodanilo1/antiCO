import { useEffect, useRef, useState } from "react";
import {
  buscarPoliticos,
  investigar,
  investigarEmpresa,
  listarCargos,
  type InvestigacaoResult,
  type InvestigacaoEmpresa,
  type PoliticoResumo,
} from "./api";
import { SearchForm } from "./components/SearchForm";
import { ResultsDashboard } from "./components/ResultsDashboard";
import { EmpresaDashboard } from "./components/EmpresaDashboard";
import { LoadingOverlay } from "./components/LoadingOverlay";

export default function App() {
  const [cargos, setCargos] = useState<Array<{ id: string; label: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InvestigacaoResult | null>(null);
  const [empresaResult, setEmpresaResult] = useState<InvestigacaoEmpresa | null>(null);
  const [suggestions, setSuggestions] = useState<PoliticoResumo[]>([]);
  const [searching, setSearching] = useState(false);
  const searchSeq = useRef(0);

  useEffect(() => {
    listarCargos().then(setCargos).catch(() => {});
  }, []);

  async function handleSearch(nome: string) {
    if (nome.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    const seq = ++searchSeq.current;
    setSearching(true);

    await new Promise((r) => setTimeout(r, 300));

    if (seq !== searchSeq.current) return;

    try {
      const items = await buscarPoliticos(nome);
      if (seq === searchSeq.current) {
        setSuggestions(items);
      }
    } catch (err) {
      console.error("Busca falhou:", err);
      if (seq === searchSeq.current) setSuggestions([]);
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  }

  async function handleInvestigate(params: {
    nome: string;
    cargo: string;
    tipoDespesa: string;
    ano: string;
    apenasAnomalias: boolean;
    limite: number;
  }) {
    setError(null);
    setResult(null);
    setEmpresaResult(null);
    setLoading(true);
    setLoadingMessage("Consultando dados públicos oficiais...");

    try {
      const data = await investigar({
        nome: params.nome,
        cargo: params.cargo === "auto" ? undefined : params.cargo,
        tipoDespesa: params.tipoDespesa || undefined,
        ano: params.ano ? Number(params.ano) : undefined,
        apenasAnomalias: params.apenasAnomalias,
        limiteFornecedores: params.limite,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  }

  async function handleInvestigateEmpresa(cnpj: string) {
    setError(null);
    setResult(null);
    setEmpresaResult(null);
    setLoading(true);
    setLoadingMessage("Investigando empresa (CNPJ, pagadores, Maps, sócios)...");

    try {
      const data = await investigarEmpresa(cnpj);
      setEmpresaResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <span className="brand-icon">◉</span>
            <div>
              <h1>antiCO</h1>
              <p>Auditoria cívica OSINT — despesas parlamentares</p>
            </div>
          </div>
          <div className="header-badge">Dados públicos · Câmara + Senado</div>
        </div>
      </header>

      <main className="main">
        <SearchForm
          cargos={cargos}
          suggestions={suggestions}
          searching={searching}
          onSearch={handleSearch}
          onSelectSuggestion={() => setSuggestions([])}
          onSubmit={handleInvestigate}
          onSubmitEmpresa={handleInvestigateEmpresa}
          disabled={loading}
        />

        {error && (
          <div className="error-banner" role="alert">
            <strong>Erro:</strong> {error}
          </div>
        )}

        {result && (
          <ResultsDashboard result={result} onInvestigarEmpresa={handleInvestigateEmpresa} />
        )}

        {empresaResult && <EmpresaDashboard result={empresaResult} />}

        {!result && !empresaResult && !loading && !error && (
          <section className="empty-state">
            <div className="empty-icon">🔍</div>
            <h2>Investigue despesas ou empresas</h2>
            <p>
              Busque deputados, senadores e presidentes — ou investigue diretamente por CNPJ
              para ver quem pagou a empresa, sócios, Maps e score de fachada.
            </p>
            <div className="empty-examples">
              <span>Exemplos:</span>
              <button
                type="button"
                onClick={() =>
                  handleInvestigate({
                    nome: "Nikolas Ferreira",
                    cargo: "deputado",
                    tipoDespesa: "Locação",
                    ano: "",
                    apenasAnomalias: true,
                    limite: 5,
                  })
                }
              >
                Nikolas Ferreira
              </button>
              <button
                type="button"
                onClick={() => handleInvestigateEmpresa("49000815000160")}
              >
                Nacional Rent A Car
              </button>
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <p>
          Indícios para investigação — não constitui prova de ilícito.
          Fontes: API Câmara, CEAPS Senado, BrasilAPI / Minha Receita.
        </p>
      </footer>

      {loading && <LoadingOverlay message={loadingMessage} />}
    </div>
  );
}
