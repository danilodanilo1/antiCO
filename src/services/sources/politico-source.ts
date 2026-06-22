import type { Politico } from "../../types/politico.js";
import type { Despesa } from "../../types/despesa.js";

export interface PoliticoMatch {
  politico: Politico;
  score: number;
}

export interface PoliticoSource {
  readonly fonte: Politico["fonte"];
  buscarPorNome(nome: string): Promise<Politico[]>;
  buscarMesaDiretora(): Promise<Politico[]>;
  buscarDespesas(politico: Politico, ano?: number): Promise<Despesa[]>;
}
