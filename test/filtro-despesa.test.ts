import { describe, expect, it } from "vitest";
import { filtrarDespesasPorTipo, radicaisFiltroDespesa } from "../src/services/shared/despesas-processor.js";
import { parseValorBr } from "../src/utils/csv.js";
import type { Despesa } from "../src/types/despesa.js";

const d = (tipoDespesa: string) => ({ tipoDespesa }) as Despesa;
const despesas = [
  d("LOCAÇÃO OU FRETAMENTO DE VEÍCULOS AUTOMOTORES"),
  d("COMBUSTÍVEIS E LUBRIFICANTES."),
  d("PASSAGEM AÉREA - SIGEPA"),
  d("DIVULGAÇÃO DA ATIVIDADE PARLAMENTAR."),
  d("LOCAÇÃO OU FRETAMENTO DE AERONAVES"),
];

describe("filtrarDespesasPorTipo", () => {
  it('"aluguel de carro" encontra locação de veículos (e não de aeronaves)', () => {
    expect(radicaisFiltroDespesa("aluguel de carro")).toEqual(["locac", "veicul"]);
    expect(filtrarDespesasPorTipo(despesas, "aluguel de carro").map((x) => x.tipoDespesa)).toEqual([
      "LOCAÇÃO OU FRETAMENTO DE VEÍCULOS AUTOMOTORES",
    ]);
  });

  it("nome oficial continua funcionando, sem diferença de acento", () => {
    expect(filtrarDespesasPorTipo(despesas, "LOCAÇÃO")).toHaveLength(2);
    expect(filtrarDespesasPorTipo(despesas, "locacao")).toHaveLength(2);
  });

  it("palavras comuns de outros tipos", () => {
    expect(filtrarDespesasPorTipo(despesas, "gasolina")).toHaveLength(1);
    expect(filtrarDespesasPorTipo(despesas, "passagem aérea")).toHaveLength(1);
    expect(filtrarDespesasPorTipo(despesas, "propaganda")).toHaveLength(1);
  });
});

describe("parseValorBr", () => {
  it.each([
    ["1.500,00", 1500],
    ["13500,5", 13500.5],
    ["165.65", 165.65],
    ["13500.00", 13500],
    ["1.500", 1500],
    ["1500", 1500],
    ["", 0],
  ])("%s → %d", (entrada, esperado) => {
    expect(parseValorBr(entrada)).toBeCloseTo(esperado);
  });
});
