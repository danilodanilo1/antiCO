import { describe, expect, it } from "vitest";
import { cnpjMatchesQuery, parseCnpjCeap } from "../src/utils/cnpj.js";
import { anosCeap, anosCeapDownload, anosCeaps } from "../src/services/index/anos.js";

describe("cnpjMatchesQuery", () => {
  it("casa o mesmo CNPJ", () => {
    expect(cnpjMatchesQuery("11.222.333/0001-81", "11222333000181")).toBe(true);
  });
  it("casa quando só o dígito verificador difere (CEAP trunca o DV)", () => {
    expect(cnpjMatchesQuery("11222333000181", "11222333000105")).toBe(true);
  });
  it("não junta filiais por padrão", () => {
    expect(cnpjMatchesQuery("11222333000181", "11222333001500")).toBe(false);
  });
  it("junta filiais quando pedido", () => {
    expect(cnpjMatchesQuery("11222333000181", "11222333001500", true)).toBe(true);
  });
});

describe("parseCnpjCeap", () => {
  it("completa filial e DV truncados", () => {
    expect(parseCnpjCeap("11.722.475/0015-5")).toBe("11722475001505");
  });
});

describe("anos das bases", () => {
  const hoje = new Date("2026-10-31");
  it("vão até o ano atual", () => {
    expect(anosCeap(hoje).at(-1)).toBe(2026);
    expect(anosCeaps(hoje).at(-1)).toBe(2026);
    expect(anosCeapDownload(hoje)).toEqual([2021, 2022, 2023, 2024, 2025, 2026]);
  });
});
