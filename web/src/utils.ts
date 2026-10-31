export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14) return value;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

export function formatDateShort(iso: string): string {
  const d = iso.includes("T") ? iso.slice(0, 10) : iso;
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return iso;
  return `${day}/${m}/${y}`;
}

export function cargoLabel(cargo: string, titulo?: string): string {
  const map: Record<string, string> = {
    deputado_federal: "Deputado Federal",
    senador: "Senador",
    presidente_camara: "Presidente da Câmara",
    presidente_senado: "Presidente do Senado",
    vice_presidente_camara: "Vice-Presidente da Câmara",
    vice_presidente_senado: "Vice-Presidente do Senado",
    secretario_camara: "Secretário da Câmara",
    secretario_senado: "Secretário do Senado",
  };
  return titulo ?? map[cargo] ?? cargo.replace(/_/g, " ");
}

export function fonteLabel(fonte: string): string {
  return fonte === "camara" ? "Câmara dos Deputados" : fonte === "senado" ? "Senado Federal" : fonte;
}

export function classificacaoColor(c: string): string {
  switch (c) {
    case "CRITICO":
      return "critico";
    case "ALTO":
      return "alto";
    case "MEDIO":
      return "medio";
    default:
      return "baixo";
  }
}

export function categoriaLabel(categoria?: string): string {
  switch (categoria) {
    case "FATO":
      return "Fato oficial";
    case "INDICIO":
      return "Indício";
    default:
      return "Contexto";
  }
}
