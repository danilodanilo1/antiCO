import { describe, expect, it } from "vitest";
import { pontuar } from "../src/scoring/pontuacao.js";
import type { SinalEmpresaTipo } from "../src/types/empresa.js";

const s = (...tipos: SinalEmpresaTipo[]) => tipos.map((tipo) => ({ tipo }));

describe("pontuar", () => {
  it("só contexto fica BAIXO e score 0, não importa quantos", () => {
    const r = pontuar(s("SEM_PRESENCA_DIGITAL", "MAPS_AUSENTE", "VALOR_ALTO", "MULTIPLOS_PARLAMENTARES", "ASTROTURFING_REVIEWS"));
    expect(r).toMatchObject({ classificacao: "BAIXO", score: 0 });
  });

  it("um indício fica BAIXO, dois ficam MEDIO, três ficam ALTO", () => {
    expect(pontuar(s("EMPRESA_RECENTE")).classificacao).toBe("BAIXO");
    expect(pontuar(s("EMPRESA_RECENTE", "CNAE_INCOMPATIVEL")).classificacao).toBe("MEDIO");
    expect(pontuar(s("EMPRESA_RECENTE", "CNAE_INCOMPATIVEL", "ENDERECO_COMPARTILHADO")).classificacao).toBe("ALTO");
  });

  it("um fato fica ALTO; fato + 2 indícios fica CRITICO", () => {
    expect(pontuar(s("SOCIO_SERVIDOR_GABINETE")).classificacao).toBe("ALTO");
    expect(pontuar(s("SOCIO_SERVIDOR_GABINETE", "EMPRESA_RECENTE", "SITE_DOMINIO_APOSTAS")).classificacao).toBe("CRITICO");
  });

  it("sinal repetido do mesmo tipo conta uma vez", () => {
    expect(pontuar(s("EMPRESA_RECENTE", "EMPRESA_RECENTE", "EMPRESA_RECENTE")).classificacao).toBe("BAIXO");
  });

  it("adicionar contexto nunca reduz o score", () => {
    const base = pontuar(s("SOCIO_SERVIDOR_GABINETE", "EMPRESA_RECENTE"));
    const comContexto = pontuar(s("SOCIO_SERVIDOR_GABINETE", "EMPRESA_RECENTE", "SEM_PRESENCA_DIGITAL"));
    expect(comContexto.score).toBe(base.score);
  });
});
