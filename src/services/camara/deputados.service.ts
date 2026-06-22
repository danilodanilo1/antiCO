import type { Deputado } from "../../types/deputado.js";
import { CamaraClient } from "./client.js";

interface DeputadoApi {
  id: number;
  nome: string;
  siglaPartido: string;
  siglaUf: string;
  urlFoto?: string;
}

export class DeputadosService {
  constructor(private readonly client = new CamaraClient()) {}

  async buscarPorNome(nome: string): Promise<Deputado[]> {
    const response = await this.client.get<{ dados: DeputadoApi[] }>("/deputados", {
      nome,
      ordem: "ASC",
      ordenarPor: "nome",
    });

    return response.dados.map((d) => ({
      id: d.id,
      nome: d.nome,
      siglaPartido: d.siglaPartido,
      siglaUf: d.siglaUf,
      urlFoto: d.urlFoto,
    }));
  }

  async buscarUnicoPorNome(nome: string): Promise<Deputado> {
    const resultados = await this.buscarPorNome(nome);

    if (resultados.length === 0) {
      throw new Error(`Nenhum deputado encontrado para: "${nome}"`);
    }

    const nomeLower = nome.toLowerCase();
    const exato = resultados.find((d) => d.nome.toLowerCase() === nomeLower);
    if (exato) return exato;

    if (resultados.length === 1) return resultados[0];

    const nomes = resultados.map((d) => d.nome).join(", ");
    throw new Error(`Múltiplos deputados encontrados para "${nome}": ${nomes}. Seja mais específico.`);
  }
}
