export interface Deputado {
  id: number;
  nome: string;
  siglaPartido: string;
  siglaUf: string;
  urlFoto?: string;
}

/** @deprecated Use Politico from politico.ts */
export type { Politico as PoliticoUnificado } from "./politico.js";
