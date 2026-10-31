import type { Politico } from "../../types/politico.js";
import type { ResultadoDespesas } from "../../types/despesa.js";

export interface PoliticoMatch {
  politico: Politico;
  score: number;
}

export interface PoliticoSource {
  readonly fonte: Politico["fonte"];
  buscarPorNome(nome: string): Promise<Politico[]>;
  buscarMesaDiretora(): Promise<Politico[]>;
  /** Nunca lança por falha de fonte: devolve o que conseguiu e avisos do que falhou. */
  buscarDespesas(politico: Politico, ano?: number): Promise<ResultadoDespesas>;
}
