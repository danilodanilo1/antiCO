#!/usr/bin/env node
import { investigarPolitico } from "../src/pipelines/investigar-politico.js";
import { gerarRelatorioMarkdown } from "../src/reports/markdown.js";
import type { CargoAlias } from "../src/services/sources/registry.js";
import { saveReport } from "../src/utils/files.js";
import { logger } from "../src/utils/logger.js";

interface CliArgs {
  politico?: string;
  cargo?: string;
  tipo?: string;
  ano?: number;
  limite?: number;
  apenasAnomalias: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { apenasAnomalias: false, help: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case "--politico":
      case "--deputado":
      case "-d":
      case "-p":
        args.politico = next;
        i++;
        break;
      case "--cargo":
      case "-c":
        args.cargo = next;
        i++;
        break;
      case "--tipo":
      case "-t":
        args.tipo = next;
        i++;
        break;
      case "--ano":
      case "-a":
        args.ano = Number(next);
        i++;
        break;
      case "--limite":
      case "-l":
        args.limite = Number(next);
        i++;
        break;
      case "--anomalias":
        args.apenasAnomalias = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
    }
  }

  return args;
}

function printHelp(): void {
  console.log(`
antiCO — Auditoria cívica OSINT (modo regras, sem IA)

Uso:
  npm run investigar -- --politico "Nikolas Ferreira" --tipo "Locação"
  npm run investigar -- --politico "Davi Alcolumbre" --cargo senador
  npm run investigar -- --cargo presidente-camara --anomalias
  npm run investigar -- --cargo presidente-senado --ano 2024

Fontes suportadas:
  Câmara dos Deputados (deputados + mesa diretora)
  Senado Federal (senadores + mesa diretora)

Opções:
  -p, --politico <nome>     Nome do político (busca automática Câmara + Senado)
  -d, --deputado <nome>     Alias de --politico (retrocompatível)
  -c, --cargo <cargo>       deputado | senador | presidente-camara | presidente-senado
                            | mesa-camara | mesa-senado | auto (padrão)
  -t, --tipo <texto>        Filtrar por tipo de despesa (parcial)
  -a, --ano <ano>           Filtrar por ano (ex: 2024)
  -l, --limite <n>          Máximo de fornecedores a investigar
  --anomalias               Investigar apenas fornecedores com valores anômalos
  -h, --help                Exibir ajuda

Exemplos:
  npm run investigar -- -p "Hugo Motta" -c deputado
  npm run investigar -- -c presidente-camara --anomalias
  npm run investigar -- -p "Alan Rick" -c senador -t "Aluguel"
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.politico && !args.cargo?.includes("presidente")) {
    printHelp();
    process.exit(1);
  }

  logger.info("Iniciando investigação...");

  const nome = args.politico ?? args.cargo ?? "";
  const resultado = await investigarPolitico({
    nome,
    cargo: args.cargo as CargoAlias | undefined,
    tipoDespesa: args.tipo,
    ano: args.ano,
    limiteFornecedores: args.limite,
    apenasAnomalias: args.apenasAnomalias,
  });

  const relatorio = gerarRelatorioMarkdown(resultado);
  const slug = (resultado.politico.nome || args.cargo || "politico")
    .toLowerCase()
    .replace(/\s+/g, "-");
  const filepath = await saveReport(`dossie-${slug}-${Date.now()}.md`, relatorio);

  logger.info(`Relatório salvo em: ${filepath}`);
  console.log("\n" + relatorio);
}

main().catch((error) => {
  logger.error(String(error));
  process.exit(1);
});
