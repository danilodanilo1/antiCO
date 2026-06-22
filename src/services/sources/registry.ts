import type { FonteDados, Politico } from "../../types/politico.js";
import { labelCargo, labelFonte } from "../../types/politico.js";
import { normalizarNomePolitico } from "../shared/despesas-processor.js";
import { logger } from "../../utils/logger.js";
import { CamaraSource, filtrarMelhorMatchCamara } from "./camara.source.js";
import type { PoliticoSource } from "./politico-source.js";
import { SenadoSource, filtrarMelhorMatchSenado } from "./senado.source.js";

export type CargoAlias =
  | "deputado"
  | "senador"
  | "presidente-camara"
  | "presidente-senado"
  | "mesa-camara"
  | "mesa-senado"
  | "auto";

const CARGO_ALIASES: Record<string, CargoAlias> = {
  deputado: "deputado",
  "deputado federal": "deputado",
  camara: "deputado",
  câmara: "deputado",
  senador: "senador",
  senado: "senador",
  "presidente da camara": "presidente-camara",
  "presidente da câmara": "presidente-camara",
  "presidente-camara": "presidente-camara",
  "presidente do senado": "presidente-senado",
  "presidente-senado": "presidente-senado",
  "mesa camara": "mesa-camara",
  "mesa da camara": "mesa-camara",
  "mesa-camara": "mesa-camara",
  "mesa senado": "mesa-senado",
  "mesa do senado": "mesa-senado",
  "mesa-senado": "mesa-senado",
  auto: "auto",
};

export class PoliticoRegistry {
  private readonly sources: Map<FonteDados, PoliticoSource>;

  constructor(
    camara: PoliticoSource = new CamaraSource(),
    senado: PoliticoSource = new SenadoSource(),
  ) {
    this.sources = new Map<FonteDados, PoliticoSource>([
      ["camara", camara],
      ["senado", senado],
    ]);
  }

  getSource(fonte: FonteDados): PoliticoSource {
    const source = this.sources.get(fonte);
    if (!source) throw new Error(`Fonte não suportada: ${fonte}`);
    return source;
  }

  parseCargoAlias(input?: string): CargoAlias {
    if (!input) return "auto";
    const key = input.toLowerCase().trim();
    return CARGO_ALIASES[key] ?? "auto";
  }

  async resolver(nomeOuCargo: string, cargoHint: CargoAlias = "auto"): Promise<Politico> {
    const hint = cargoHint === "auto" ? this.parseCargoAlias(nomeOuCargo) : cargoHint;

    if (hint === "presidente-camara") {
      return this.buscarPorCargoMesa("camara", "presidente");
    }
    if (hint === "presidente-senado") {
      return this.buscarPorCargoMesa("senado", "presidente");
    }
    if (hint === "mesa-camara") {
      const mesa = await this.getSource("camara").buscarMesaDiretora();
      const match = mesa.find((m) => normalizarNomePolitico(m.nome).includes(normalizarNomePolitico(nomeOuCargo)));
      if (match) return match;
      throw new Error(`Membro da mesa da Câmara não encontrado: "${nomeOuCargo}"`);
    }
    if (hint === "mesa-senado") {
      const mesa = await this.getSource("senado").buscarMesaDiretora();
      const match = mesa.find((m) => normalizarNomePolitico(m.nome).includes(normalizarNomePolitico(nomeOuCargo)));
      if (match) return match;
      throw new Error(`Membro da mesa do Senado não encontrado: "${nomeOuCargo}"`);
    }

    const fontes: FonteDados[] =
      hint === "deputado" ? ["camara"] : hint === "senador" ? ["senado"] : ["camara", "senado"];

    const resultados: Politico[] = [];
    for (const fonte of fontes) {
      const matches = await this.getSource(fonte).buscarPorNome(nomeOuCargo);
      resultados.push(...matches);
    }

    if (resultados.length === 0) {
      throw new Error(`Nenhum político encontrado para: "${nomeOuCargo}"`);
    }

    const camaraMatch = filtrarMelhorMatchCamara(
      resultados.filter((p) => p.fonte === "camara"),
      nomeOuCargo,
    );
    const senadoMatch = filtrarMelhorMatchSenado(
      resultados.filter((p) => p.fonte === "senado"),
      nomeOuCargo,
    );

    if (camaraMatch && senadoMatch) {
      throw new Error(
        `Ambíguo: "${nomeOuCargo}" encontrado na Câmara (${camaraMatch.nome}) e no Senado (${senadoMatch.nome}). Use --cargo deputado ou --cargo senador.`,
      );
    }

    const unico = camaraMatch ?? senadoMatch ?? (resultados.length === 1 ? resultados[0] : null);
    if (unico) return unico;

    const lista = resultados
      .map((p) => `${p.nome} (${labelCargo(p)} — ${labelFonte(p.fonte)})`)
      .join("; ");
    throw new Error(`Múltiplos políticos encontrados para "${nomeOuCargo}": ${lista}. Seja mais específico ou use --cargo.`);
  }

  private async buscarPorCargoMesa(fonte: FonteDados, cargo: "presidente"): Promise<Politico> {
    const mesa = await this.getSource(fonte).buscarMesaDiretora();
    const match = mesa.find((m) =>
      cargo === "presidente"
        ? m.cargo === (fonte === "camara" ? "presidente_camara" : "presidente_senado")
        : false,
    );

    if (!match) {
      throw new Error(`Presidente do ${fonte === "camara" ? "Câmara" : "Senado"} não encontrado na mesa diretora.`);
    }

    logger.info(`${match.titulo}: ${match.nome} (${match.siglaPartido}/${match.siglaUf})`);
    return match;
  }
}

export const politicoRegistry = new PoliticoRegistry();