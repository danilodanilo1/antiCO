import { config } from "../../config/env.js";
import { CamaraClient } from "../camara/client.js";
import { deputadosIndex } from "../camara/deputados-index.service.js";
import type { AvisoFonte, Despesa, ResultadoDespesas } from "../../types/despesa.js";
import { despesasCeapLocal } from "../camara/ceap-arquivo.js";
import type { CargoPolitico, Politico } from "../../types/politico.js";
import { formatPoliticoId } from "../../types/politico.js";
import { logger } from "../../utils/logger.js";
import { normalizarNomePolitico } from "../shared/despesas-processor.js";
import type { PoliticoSource } from "./politico-source.js";

interface DeputadoApi {
  id: number;
  nome: string;
  siglaPartido: string;
  siglaUf: string;
  urlFoto?: string;
}

interface DespesaApi {
  ano: number;
  mes: number;
  tipoDespesa: string;
  codTipoDespesa: number;
  codDocumento: number;
  tipoDocumento: string;
  dataDocumento: string;
  numDocumento: string;
  valorDocumento: number;
  nomeFornecedor: string;
  cnpjCpfFornecedor: string;
  urlDocumento?: string;
}

interface MembroMesaApi {
  id: number;
  nome: string;
  siglaPartido: string;
  siglaUf: string;
  urlFoto?: string;
  titulo: string;
  codTitulo: number;
}

function mapCargoMesa(titulo: string): CargoPolitico {
  const t = titulo.toLowerCase();
  if (t.includes("presidente") && !t.includes("vice")) return "presidente_camara";
  if (t.includes("vice")) return "vice_presidente_camara";
  return "secretario_camara";
}

function mapDeputado(d: DeputadoApi, cargo: CargoPolitico = "deputado_federal", titulo?: string): Politico {
  return {
    id: formatPoliticoId("camara", d.id),
    nome: d.nome,
    siglaPartido: d.siglaPartido,
    siglaUf: d.siglaUf,
    cargo,
    fonte: "camara",
    titulo,
    urlFoto: d.urlFoto,
  };
}

function mapDespesa(d: DespesaApi): Despesa {
  return {
    ano: d.ano,
    mes: d.mes,
    tipoDespesa: d.tipoDespesa,
    codTipoDespesa: d.codTipoDespesa,
    codDocumento: d.codDocumento,
    tipoDocumento: d.tipoDocumento,
    dataDocumento: d.dataDocumento,
    numDocumento: d.numDocumento,
    valorDocumento: d.valorDocumento,
    nomeFornecedor: d.nomeFornecedor,
    cnpjCpfFornecedor: d.cnpjCpfFornecedor,
    urlDocumento: d.urlDocumento,
  };
}

export class CamaraSource implements PoliticoSource {
  readonly fonte = "camara" as const;

  constructor(
    private readonly client = new CamaraClient(),
    private readonly dataDir = config.dataDir,
  ) {}

  async buscarPorNome(nome: string): Promise<Politico[]> {
    const [indexResults, apiResults] = await Promise.all([
      deputadosIndex.buscar(nome, 15),
      this.client
        .get<{ dados: DeputadoApi[] }>("/deputados", { nome, ordem: "ASC", ordenarPor: "nome" })
        .then((r) => r.dados.map((d) => mapDeputado(d)))
        .catch(() => [] as Politico[]),
    ]);

    const map = new Map<string, Politico>();
    for (const p of [...indexResults, ...apiResults]) {
      if (!map.has(p.id)) map.set(p.id, p);
    }
    return Array.from(map.values());
  }

  async buscarMesaDiretora(): Promise<Politico[]> {
    const response = await this.client.get<{ dados: MembroMesaApi[] }>("/orgaos/4/membros");
    return response.dados.map((m) => mapDeputado(m, mapCargoMesa(m.titulo), m.titulo));
  }

  /**
   * Busca ano a ano (consultas menores dão menos 504). Se a API falhar num ano mesmo depois
   * das novas tentativas, usa o arquivo da cota já baixado em data/raw. Se também não houver
   * arquivo, segue com os outros anos e registra um aviso, em vez de derrubar o resultado.
   */
  async buscarDespesas(politico: Politico, ano?: number): Promise<ResultadoDespesas> {
    const deputadoId = politico.id.replace("camara:", "");
    const anos = ano ? [ano] : anosLegislaturaAtual();
    const despesas: Despesa[] = [];
    const avisos: AvisoFonte[] = [];

    for (const a of anos) {
      try {
        const raw = await this.client.getAllPages<DespesaApi>(`/deputados/${deputadoId}/despesas`, { ano: a });
        if (raw.length === 0) {
          // Sob carga a API às vezes responde 200 com lista vazia. Confere no arquivo da cota.
          const local = await this.carregarLocal(deputadoId, a);
          if (local && local.length > 0) {
            despesas.push(...local);
            avisos.push({
              fonte: `API da Câmara (${a})`,
              mensagem: `Respondeu sem nenhuma despesa, mas o arquivo da cota tem ${local.length}.`,
              alternativa: `Arquivo da cota parlamentar ${a} já baixado`,
            });
            continue;
          }
        }
        despesas.push(...raw.map(mapDespesa));
        continue;
      } catch (error) {
        logger.warn(`Câmara API falhou para ${politico.nome} em ${a}: ${String(error)}`);
        const local = await this.carregarLocal(deputadoId, a);
        if (local) {
          despesas.push(...local);
          avisos.push({
            fonte: `API da Câmara (${a})`,
            mensagem: `Indisponível (${resumoErro(error)}).`,
            alternativa: `Arquivo da cota parlamentar ${a} já baixado`,
          });
        } else {
          avisos.push({
            fonte: `API da Câmara (${a})`,
            mensagem: `Indisponível (${resumoErro(error)}) e sem arquivo local da cota para esse ano. As despesas de ${a} ficaram de fora.`,
          });
        }
      }
    }

    logger.debug(`Câmara: ${despesas.length} despesas para ${politico.nome}`);
    return { despesas, avisos };
  }

  private async carregarLocal(deputadoId: string, ano: number): Promise<Despesa[] | null> {
    try {
      return await despesasCeapLocal(deputadoId, ano, this.dataDir);
    } catch {
      return null;
    }
  }
}

/** Anos da legislatura em curso até o ano atual (57ª: 2023–2026). */
export function anosLegislaturaAtual(hoje = new Date()): number[] {
  const ano = hoje.getFullYear();
  const inicio = 2019 + Math.floor((ano - 2019) / 4) * 4;
  return Array.from({ length: ano - inicio + 1 }, (_, i) => inicio + i);
}

function resumoErro(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  const status = msg.match(/\b(5\d\d|429|408)\b/);
  if (status) return `erro ${status[1]}`;
  if (/abort|timeout/i.test(msg)) return "tempo esgotado";
  return msg.slice(0, 80);
}

export function filtrarMelhorMatchCamara(resultados: Politico[], nome: string): Politico | null {
  if (resultados.length === 0) return null;
  const alvo = normalizarNomePolitico(nome);
  const exato = resultados.find((p) => normalizarNomePolitico(p.nome) === alvo);
  if (exato) return exato;
  if (resultados.length === 1) return resultados[0];
  return null;
}
