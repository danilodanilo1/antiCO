export const config = {
  camaraBaseUrl: process.env.CAMARA_API_URL ?? "https://dadosabertos.camara.leg.br/api/v2",
  senadoLegisUrl: process.env.SENADO_LEGIS_URL ?? "https://legis.senado.leg.br/dadosabertos",
  senadoCeapsUrl: process.env.SENADO_CEAPS_URL ?? "https://www.senado.gov.br/transparencia/LAI/verba",
  camaraCeapUrl: process.env.CAMARA_CEAP_URL ?? "http://www.camara.leg.br/cotas",
  brasilApiBaseUrl: process.env.BRASILAPI_URL ?? "https://brasilapi.com.br/api",
  minhaReceitaUrl: process.env.MINHA_RECEITA_URL ?? "https://minhareceita.org",
  dataDir: process.env.DATA_DIR ?? "data",
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 30_000),
  anomalyThresholdReais: Number(process.env.ANOMALY_THRESHOLD_REAIS ?? 10_000),
} as const;
