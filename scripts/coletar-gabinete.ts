#!/usr/bin/env node
/**
 * Coleta o "Pessoal de gabinete" dos deputados federais no portal da Câmara e grava em
 * data/gabinete/servidores.csv, usado pelo sinal SOCIO_SERVIDOR_GABINETE.
 *
 * Uso:
 *   npm run coletar:gabinete -- --anos 2019-2026
 *   npm run coletar:gabinete -- --anos 2023 --ids 204554,209787
 *
 * Faz uma requisição por deputado e ano, com pausa entre elas (--pausa, padrão 1500 ms),
 * para não sobrecarregar o portal. A coleta completa de várias legislaturas leva horas.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../src/config/env.js";
import { parsePessoalGabinete } from "../src/services/vinculos/gabinete-parser.js";
import { fetchText } from "../src/utils/http.js";
import { logger } from "../src/utils/logger.js";

const DEPUTADOS_URL = "https://dadosabertos.camara.leg.br/arquivos/deputados/json/deputados.json";
const FONTE = "Câmara dos Deputados, pessoal de gabinete";

interface DeputadoJson {
  uri: string;
  nome: string;
  idLegislaturaInicial?: number;
  idLegislaturaFinal?: number;
}

interface Args {
  anos: number[];
  ids?: Set<string>;
  pausaMs: number;
}

function parseArgs(argv: string[]): Args {
  const anoAtual = new Date().getFullYear();
  const args: Args = { anos: [anoAtual - 1, anoAtual], pausaMs: 1500 };
  for (let i = 0; i < argv.length; i++) {
    const next = argv[i + 1];
    if (argv[i] === "--anos" && next) {
      const [ini, fim] = next.split("-").map(Number);
      args.anos = Array.from({ length: (fim ?? ini!) - ini! + 1 }, (_, k) => ini! + k);
      i++;
    } else if (argv[i] === "--ids" && next) {
      args.ids = new Set(next.split(",").map((s) => s.trim()));
      i++;
    } else if (argv[i] === "--pausa" && next) {
      args.pausaMs = Number(next);
      i++;
    }
  }
  return args;
}

/** Legislatura 56 = 2019–2022, 57 = 2023–2026, e assim por diante. */
export function anosDaLegislatura(leg: number): [number, number] {
  const inicio = 2019 + (leg - 56) * 4;
  return [inicio, inicio + 3];
}

function exerceuNoAno(d: DeputadoJson, ano: number): boolean {
  if (!d.idLegislaturaInicial || !d.idLegislaturaFinal) return false;
  const [ini] = anosDaLegislatura(d.idLegislaturaInicial);
  const [, fim] = anosDaLegislatura(d.idLegislaturaFinal);
  return ano >= ini && ano <= fim;
}

function csvCampo(v?: string): string {
  const s = (v ?? "").replace(/"/g, '""');
  return /[;"\n]/.test(s) ? `"${s}"` : s;
}

async function carregarDeputados(): Promise<DeputadoJson[]> {
  const cache = join(config.dataDir, "raw", "deputados-all.json");
  let texto: string;
  try {
    texto = await readFile(cache, "utf-8");
  } catch {
    texto = await fetchText(DEPUTADOS_URL, "Deputados JSON");
  }
  const data = JSON.parse(texto) as DeputadoJson[] | { dados?: DeputadoJson[] };
  return Array.isArray(data) ? data : data.dados ?? [];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const deputados = await carregarDeputados();
  const linhas: string[] = ["nome;parlamentar;cargo;periodo;fonte;url"];
  const destino = join(config.dataDir, "gabinete", "servidores.csv");
  await mkdir(join(config.dataDir, "gabinete"), { recursive: true });

  let requisicoes = 0;
  for (const ano of args.anos) {
    const alvo = deputados.filter((d) => {
      const id = d.uri.split("/").pop() ?? "";
      return args.ids ? args.ids.has(id) : exerceuNoAno(d, ano);
    });
    logger.info(`${ano}: ${alvo.length} deputados`);

    for (const d of alvo) {
      const id = d.uri.split("/").pop();
      const url = `https://www.camara.leg.br/deputados/${id}/pessoal-gabinete?ano=${ano}`;
      try {
        const html = await fetchText(url, `Gabinete ${d.nome} ${ano}`);
        for (const l of parsePessoalGabinete(html)) {
          linhas.push([l.nome, d.nome, l.cargo, l.periodo, FONTE, url].map(csvCampo).join(";"));
        }
      } catch (error) {
        logger.warn(`Falhou ${d.nome} ${ano}: ${String(error)}`);
      }
      requisicoes++;
      if (requisicoes % 50 === 0) {
        await writeFile(destino, linhas.join("\n"), "utf-8");
        logger.info(`${requisicoes} páginas, ${linhas.length - 1} registros (parcial salvo)`);
      }
      await new Promise((r) => setTimeout(r, args.pausaMs));
    }
  }

  await writeFile(destino, linhas.join("\n"), "utf-8");
  logger.info(`Concluído: ${linhas.length - 1} registros em ${destino}`);
}

if (process.argv[1]?.includes("coletar-gabinete")) {
  main().catch((error) => {
    logger.error(String(error));
    process.exit(1);
  });
}
