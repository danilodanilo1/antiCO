import { describe, expect, it } from "vitest";
import { calcularRisco, calcularRiscoEmpresa } from "../src/scoring/risk-engine.js";
import type { FornecedorAgrupado } from "../src/types/despesa.js";
import { casoFachada, casoGrandeLocadora, casoPequenaHonesta } from "./fixtures/casos.js";

const tipos = (r: { sinais: { tipo: string }[] }) => r.sinais.map((s) => s.tipo);

describe("calcularRiscoEmpresa: caso de referência (empresa de fachada)", () => {
  const r = calcularRiscoEmpresa(casoFachada);

  it("classifica como CRÍTICO", () => {
    expect(r.classificacao).toBe("CRITICO");
  });

  it("aponta o sócio que trabalhou em gabinete como fato, com fonte e link", () => {
    const s = r.sinais.find((x) => x.tipo === "SOCIO_SERVIDOR_GABINETE");
    expect(s?.categoria).toBe("FATO");
    expect(s?.fonte).toContain("pessoal de gabinete");
    expect(s?.url).toMatch(/^https:\/\/www\.camara\.leg\.br/);
  });

  it("encontra os indícios do padrão", () => {
    expect(tipos(r)).toEqual(
      expect.arrayContaining(["SITE_DOMINIO_APOSTAS", "AVALIADOR_COMPARTILHADO", "EMPRESA_RECENTE", "CLIENTES_POLITICOS_CONCENTRADOS"]),
    );
  });

  it("não acusa CNAE incompatível: locação com motorista (49.23-0-02) é compatível", () => {
    expect(tipos(r)).not.toContain("CNAE_INCOMPATIVEL");
  });

  it("todo sinal tem categoria", () => {
    expect(r.sinais.every((s) => s.categoria)).toBe(true);
  });
});

describe("calcularRiscoEmpresa: grupo de controle", () => {
  it("grande locadora paga por 40 parlamentares fica BAIXO", () => {
    const r = calcularRiscoEmpresa(casoGrandeLocadora);
    expect(r.classificacao).toBe("BAIXO");
    expect(r.sinais.find((s) => s.tipo === "MULTIPLOS_PARLAMENTARES")?.categoria).toBe("CONTEXTO");
  });

  it("pequena empresa sem site e fora do Maps fica BAIXO", () => {
    const r = calcularRiscoEmpresa(casoPequenaHonesta);
    expect(r.classificacao).toBe("BAIXO");
    expect(tipos(r)).toEqual(expect.arrayContaining(["SEM_PRESENCA_DIGITAL", "MAPS_AUSENTE"]));
  });

  it("CNAE de outro ramo em despesa de locação vira indício, não fato", () => {
    const r = calcularRiscoEmpresa({
      ...casoPequenaHonesta,
      cnpjData: { ...casoPequenaHonesta.cnpjData!, cnaeFiscal: 6201501, cnaeFiscalDescricao: "Desenvolvimento de software" },
    });
    const s = r.sinais.find((x) => x.tipo === "CNAE_INCOMPATIVEL");
    expect(s?.categoria).toBe("INDICIO");
  });
});

describe("calcularRisco (fornecedor de um político)", () => {
  const fornecedor: FornecedorAgrupado = {
    cnpjCpf: "11222333000181",
    nomeFornecedor: "EXEMPLO",
    totalGasto: 162_000,
    quantidadeNotas: 12,
    valorMedio: 13_500,
    valorMaximo: 13_500,
    despesas: [],
  };

  it("nota alta e recorrente sozinha não passa de BAIXO", () => {
    const r = calcularRisco(fornecedor, casoGrandeLocadora.cnpjData, casoGrandeLocadora.siteCheck, "LOCAÇÃO OU FRETAMENTO DE VEÍCULOS AUTOMOTORES", true);
    expect(tipos(r)).toEqual(expect.arrayContaining(["VALOR_ALTO", "CONCENTRACAO_FORNECEDOR"]));
    expect(r.classificacao).toBe("BAIXO");
  });

  it("CNPJ baixado é fato e leva a ALTO", () => {
    const r = calcularRisco(
      fornecedor,
      { ...casoGrandeLocadora.cnpjData!, situacaoCadastral: "BAIXADA" },
      casoGrandeLocadora.siteCheck,
      undefined,
      true,
    );
    expect(r.classificacao).toBe("ALTO");
  });
});
