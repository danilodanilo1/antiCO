import { copyFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CamaraClient } from "../src/services/camara/client.js";
import { despesasCeapLocal } from "../src/services/camara/ceap-arquivo.js";
import { CamaraSource, anosLegislaturaAtual, legislaturaDoAno } from "../src/services/sources/camara.source.js";
import { HttpError, erroTemporario, withRetry } from "../src/utils/retry.js";
import type { Politico } from "../src/types/politico.js";

const semEspera = { sleep: async () => undefined };

describe("withRetry com política de erro temporário", () => {
  it("repete em 504 e devolve quando a API volta", async () => {
    let chamadas = 0;
    const r = await withRetry(
      async () => {
        chamadas++;
        if (chamadas < 3) throw new HttpError("Câmara API 504", 504);
        return "ok";
      },
      "teste",
      { maxAttempts: 4, shouldRetry: erroTemporario, ...semEspera },
    );
    expect(r).toBe("ok");
    expect(chamadas).toBe(3);
  });

  it("não repete em 404", async () => {
    let chamadas = 0;
    await expect(
      withRetry(
        async () => {
          chamadas++;
          throw new HttpError("Câmara API 404", 404);
        },
        "teste",
        { maxAttempts: 4, shouldRetry: erroTemporario, ...semEspera },
      ),
    ).rejects.toThrow("404");
    expect(chamadas).toBe(1);
  });

  it("respeita o Retry-After do servidor", async () => {
    const esperas: number[] = [];
    let chamadas = 0;
    await withRetry(
      async () => {
        if (chamadas++ === 0) throw new HttpError("429", 429, 5_000);
        return 1;
      },
      "teste",
      {
        delayMs: 100,
        shouldRetry: erroTemporario,
        retryAfterMs: (e) => (e instanceof HttpError ? e.retryAfterMs : undefined),
        sleep: async (ms) => void esperas.push(ms),
      },
    );
    expect(esperas).toEqual([5_000]);
  });
});

describe("CamaraClient", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sobrevive a dois 504 seguidos", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 504, statusText: "Gateway Timeout" }))
      .mockResolvedValueOnce(new Response("", { status: 504, statusText: "Gateway Timeout" }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ dados: [{ id: 1 }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new CamaraClient("https://exemplo.test/api/v2", { maxAttempts: 4, shouldRetry: erroTemporario, ...semEspera });
    const r = await client.get<{ dados: unknown[] }>("/deputados/1/despesas");
    expect(r.dados).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("CamaraSource.buscarDespesas com falha parcial", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "antico-"));
  mkdirSync(join(dataDir, "raw"), { recursive: true });
  copyFileSync(join(__dirname, "fixtures", "ceap-2025.csv"), join(dataDir, "raw", "ceap-2025.csv"));

  const politico: Politico = {
    id: "camara:999001",
    nome: "DEPUTADO FICTICIO",
    siglaPartido: "XX",
    siglaUf: "DF",
    cargo: "deputado_federal",
    fonte: "camara",
  };

  /** API fora do ar em 2025 e 2024; 2026 responde. */
  const clientFalho = {
    getAllPages: async (_path: string, params?: Record<string, string | number>) => {
      if (params?.ano === 2026) {
        return [{
          ano: 2026, mes: 1, tipoDespesa: "LOCAÇÃO OU FRETAMENTO DE VEÍCULOS AUTOMOTORES", codTipoDespesa: 120,
          codDocumento: 1, tipoDocumento: "Recibos/Outros", dataDocumento: "2026-01-06", numDocumento: "232.2026",
          valorDocumento: 13500, nomeFornecedor: "EXEMPLO RENT A CAR LTDA", cnpjCpfFornecedor: "11222333000181",
        }];
      }
      throw new HttpError("Câmara API 504: Gateway Timeout — /api/v2/deputados/999001/despesas", 504);
    },
  } as unknown as CamaraClient;

  it("não lança; usa o arquivo local onde existe e avisa onde não existe", async () => {
    const source = new CamaraSource(clientFalho, dataDir);
    const r2026 = await source.buscarDespesas(politico, 2026);
    const r2025 = await source.buscarDespesas(politico, 2025);
    const r2024 = await source.buscarDespesas(politico, 2024);
    const r = {
      despesas: [...r2026.despesas, ...r2025.despesas, ...r2024.despesas],
      avisos: [...r2026.avisos, ...r2025.avisos, ...r2024.avisos],
    };

    const anos = new Set(r.despesas.map((d) => d.ano));
    expect(anos.has(2026)).toBe(true); // API
    expect(anos.has(2025)).toBe(true); // arquivo local
    expect(r2026.avisos).toEqual([]);

    const aviso2025 = r.avisos.find((a) => a.fonte.includes("2025"));
    expect(aviso2025?.alternativa).toContain("2025");
    expect(aviso2025?.mensagem).toContain("erro 504");

    const aviso2024 = r.avisos.find((a) => a.fonte.includes("2024"));
    expect(aviso2024?.alternativa).toBeUndefined();
    expect(aviso2024?.mensagem).toContain("ficaram de fora");
  });

  it("lê do CSV só o deputado pedido, com valores e CNPJ certos", async () => {
    const despesas = await despesasCeapLocal("999001", 2025, dataDir);
    expect(despesas).toHaveLength(2);
    expect(despesas![0]).toMatchObject({
      valorDocumento: 13500,
      cnpjCpfFornecedor: "11222333000181",
      tipoDocumento: "Recibos/Outros",
      numDocumento: "232.2025",
    });
    expect(despesas![1]!.valorDocumento).toBeCloseTo(165.65);
  });

  it("ano sem arquivo devolve null", async () => {
    expect(await despesasCeapLocal("999001", 2019, dataDir)).toBeNull();
  });
});

describe("CamaraSource.buscarDespesas com API vazia", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "antico-"));
  mkdirSync(join(dataDir, "raw"), { recursive: true });
  copyFileSync(join(__dirname, "fixtures", "ceap-2025.csv"), join(dataDir, "raw", "ceap-2025.csv"));
  const politico = { id: "camara:999001", nome: "DEPUTADO FICTICIO", siglaPartido: "XX", siglaUf: "DF", cargo: "deputado_federal", fonte: "camara" } as Politico;
  const clientVazio = { getAllPages: async () => [] } as unknown as CamaraClient;

  it("API responde vazio mas o arquivo tem despesas: usa o arquivo e avisa", async () => {
    const r = await new CamaraSource(clientVazio, dataDir).buscarDespesas(politico, 2025);
    expect(r.despesas).toHaveLength(2);
    expect(r.avisos[0]?.mensagem).toContain("sem nenhuma despesa");
  });

  it("API vazia e sem arquivo: resultado vazio, sem aviso", async () => {
    const r = await new CamaraSource(clientVazio, dataDir).buscarDespesas(politico, 2019);
    expect(r).toEqual({ despesas: [], avisos: [] });
  });
});

describe("parâmetros da API de despesas", () => {
  it("legislaturaDoAno", () => {
    expect(legislaturaDoAno(2019)).toBe(56);
    expect(legislaturaDoAno(2022)).toBe(56);
    expect(legislaturaDoAno(2023)).toBe(57);
    expect(legislaturaDoAno(2026)).toBe(57);
    expect(legislaturaDoAno(2027)).toBe(58);
  });

  it("envia idLegislatura junto com ano (sem ele a API devolve lista vazia)", async () => {
    const chamadas: Array<Record<string, string | number> | undefined> = [];
    const client = {
      getAllPages: async (_p: string, params?: Record<string, string | number>) => {
        chamadas.push(params);
        return [];
      },
    } as unknown as CamaraClient;
    const politico = { id: "camara:209787", nome: "X", siglaPartido: "", siglaUf: "", cargo: "deputado_federal", fonte: "camara" } as Politico;
    await new CamaraSource(client, mkdtempSync(join(tmpdir(), "antico-"))).buscarDespesas(politico, 2026);
    expect(chamadas[0]).toEqual({ idLegislatura: 57, ano: 2026 });
  });
});

describe("anosLegislaturaAtual", () => {
  it("2026 → 2023 a 2026; 2027 → só 2027", () => {
    expect(anosLegislaturaAtual(new Date("2026-10-31"))).toEqual([2023, 2024, 2025, 2026]);
    expect(anosLegislaturaAtual(new Date("2027-03-01"))).toEqual([2027]);
  });
});
