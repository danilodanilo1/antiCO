import { describe, expect, it } from "vitest";
import { inferSiteFromEmail, motivoConteudoApostas, motivoDominioApostas } from "../src/services/site-checker.js";

describe("motivoDominioApostas", () => {
  it.each([
    "https://abc.xyz",
    "https://alphabet.com",
    "https://elizabethmodas.com.br",
    "https://www.betumeengenharia.com.br",
    "https://tibet-turismo.com",
    "https://jogosinfantis.com.br",
    "https://locadoraexemplo.com.br",
  ])("não marca %s", (url) => {
    expect(motivoDominioApostas(url)).toBeUndefined();
  });

  it.each([
    "https://www.betano.com",
    "https://bet7k.com",
    "https://1xbet.com",
    "https://cassino-online.com.br",
    "https://algo.bet",
    "https://vai-de-bet.com",
  ])("marca %s", (url) => {
    expect(motivoDominioApostas(url)).toBeTruthy();
  });
});

describe("motivoConteudoApostas", () => {
  it("marca página com vários termos de apostas", () => {
    const html = "<h1>Entre hoje e aproveite bônus</h1><p>Cassino ao vivo, rodadas grátis e slots. Jogue agora!</p>";
    expect(motivoConteudoApostas(html)).toContain("cassino");
  });

  it("não marca página de locadora que cita apostas uma vez", () => {
    const html = "<h1>Aluguel de carros em Brasília</h1><p>Não aceitamos pagamento de apostas.</p>";
    expect(motivoConteudoApostas(html)).toBeUndefined();
  });
});

describe("inferSiteFromEmail", () => {
  it("ignora provedores gratuitos", () => {
    expect(inferSiteFromEmail("fulano@gmail.com")).toBeUndefined();
    expect(inferSiteFromEmail("fulano@yahoo.com.br")).toBeUndefined();
  });
  it("usa o domínio corporativo", () => {
    expect(inferSiteFromEmail("contato@empresa.com.br")).toBe("https://empresa.com.br");
  });
});
