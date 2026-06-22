export type FonteDados = "camara" | "senado";

export type CargoPolitico =
  | "deputado_federal"
  | "senador"
  | "presidente_camara"
  | "vice_presidente_camara"
  | "secretario_camara"
  | "presidente_senado"
  | "vice_presidente_senado"
  | "secretario_senado"
  | "mesa_camara"
  | "mesa_senado";

export interface Politico {
  id: string;
  nome: string;
  siglaPartido: string;
  siglaUf: string;
  cargo: CargoPolitico;
  fonte: FonteDados;
  titulo?: string;
  urlFoto?: string;
}

export function formatPoliticoId(fonte: FonteDados, id: string | number): string {
  return `${fonte}:${id}`;
}

export function parsePoliticoId(id: string): { fonte: FonteDados; id: string } {
  const [fonte, ...rest] = id.split(":");
  if (fonte !== "camara" && fonte !== "senado") {
    throw new Error(`ID de político inválido: ${id}`);
  }
  return { fonte, id: rest.join(":") };
}

export function labelCargo(politico: Politico): string {
  if (politico.titulo) return politico.titulo;
  switch (politico.cargo) {
    case "deputado_federal":
      return "Deputado Federal";
    case "senador":
      return "Senador";
    default:
      return politico.cargo.replace(/_/g, " ");
  }
}

export function labelFonte(fonte: FonteDados): string {
  return fonte === "camara" ? "Câmara dos Deputados" : "Senado Federal";
}
