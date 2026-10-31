import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GabineteIndexService } from "../src/services/vinculos/gabinete-index.service.js";
import { normalizarNomeCompleto, parsePessoalGabinete } from "../src/services/vinculos/gabinete-parser.js";
import { anosDaLegislatura } from "../scripts/coletar-gabinete.js";

const html = readFileSync(join(__dirname, "fixtures", "pessoal-gabinete.html"), "utf-8");

describe("parsePessoalGabinete", () => {
  it("lê nome, cargo e período de cada linha, ignorando o cabeçalho", () => {
    const linhas = parsePessoalGabinete(html);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({ nome: "MARIA EXEMPLO DE SOUZA", cargo: "SP22", periodo: "De 16/02/2023 a 16/03/2023" });
    expect(linhas[1]!.nome).toBe("JOÃO TESTE PEREIRA");
  });
});

describe("GabineteIndexService.buscarVinculos", () => {
  const idx = new GabineteIndexService("/nao/existe.csv");
  idx.carregarLista([
    { nomeServidor: "MARIA EXEMPLO DE SOUZA", parlamentar: "DEPUTADO A", fonte: "Câmara" },
    { nomeServidor: "Luís Fernando Exemplo Araújo", parlamentar: "DEPUTADO B", fonte: "Câmara" },
  ]);

  it("encontra pelo nome completo, ignorando acentos e caixa", async () => {
    expect(await idx.buscarVinculos("Maria Exemplo de Souza")).toHaveLength(1);
    expect(await idx.buscarVinculos("LUIS FERNANDO EXEMPLO ARAUJO")).toHaveLength(1);
  });

  it("não casa por primeiro nome nem por parte do nome", async () => {
    expect(await idx.buscarVinculos("Luis Fernando")).toHaveLength(0);
    expect(await idx.buscarVinculos("Luis Fernando Silva")).toHaveLength(0);
    expect(await idx.buscarVinculos("Maria Exemplo")).toHaveLength(0);
  });

  it("sem arquivo de gabinetes, não aponta vínculo nenhum", async () => {
    const vazio = new GabineteIndexService("/nao/existe.csv");
    expect(await vazio.buscarVinculos("Maria Exemplo de Souza")).toEqual([]);
  });
});

describe("normalizarNomeCompleto", () => {
  it("remove acentos, pontuação e espaços extras", () => {
    expect(normalizarNomeCompleto("  José   D'Ávila ")).toBe("jose d avila");
  });
});

describe("anosDaLegislatura", () => {
  it("56 = 2019–2022, 57 = 2023–2026", () => {
    expect(anosDaLegislatura(56)).toEqual([2019, 2022]);
    expect(anosDaLegislatura(57)).toEqual([2023, 2026]);
  });
});
