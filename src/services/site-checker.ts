import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { SiteCheckResult } from "../types/investigacao.js";
import { config } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * Partes de domínio que indicam apostas. A comparação é por parte inteira do domínio
 * (separada por "." ou "-"), nunca por substring: "alphabet.com" ou "elizabeth.com.br"
 * não casam com "bet".
 */
const TOKENS_APOSTAS = new Set([
  "bet", "bets", "aposta", "apostas", "cassino", "casino", "poker", "slots", "slot",
  "blaze", "pixbet", "sportingbet", "betano", "bet365", "betnacional", "estrelabet",
  "superbet", "betfair", "kto", "novibet", "parimatch", "stake", "vaidebet", "esportesdasorte",
  "tigrinho", "fortunetiger", "roleta", "bingo",
]);

const TLDS_APOSTAS = new Set(["bet", "casino", "poker", "bingo"]);

/**
 * "bet" colado a números, padrão comum de casas de aposta ("bet7k", "1xbet", "777bet").
 * Não tenta adivinhar "bet" colado a letras: "tibet", "sorbet" e "beta" são palavras comuns.
 */
const PADRAO_TOKEN_APOSTA = /^(bet\d+[a-z]*|\d+x?bet)$/;

/** Termos de página de apostas. Precisa de vários para não pegar uma notícia sobre bets. */
const TERMOS_CONTEUDO_APOSTAS = [
  "cassino", "casino", "apostas esportivas", "aposte", "rodadas grátis", "rodadas gratis",
  "bônus de boas-vindas", "bonus de boas-vindas", "slots", "jogue agora", "odds", "depósito mínimo",
  "deposito minimo", "fortune tiger", "jogo do tigrinho", "roleta", "jogo responsável", "jogo responsavel",
];
const MIN_TERMOS_CONTEUDO = 3;

const MAX_REDIRECTS = 5;
const MAX_BYTES_HTML = 300_000;

export function motivoDominioApostas(url: string): string | undefined {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
  const partes = host.split(".");
  const tld = partes[partes.length - 1] ?? "";
  if (TLDS_APOSTAS.has(tld)) return `domínio .${tld}`;

  const tokens = partes.flatMap((p) => p.split("-")).filter(Boolean);
  const token = tokens.find((t) => TOKENS_APOSTAS.has(t) || PADRAO_TOKEN_APOSTA.test(t));
  return token ? `domínio contém "${token}"` : undefined;
}

export function motivoConteudoApostas(html: string): string | undefined {
  const texto = html.toLowerCase();
  const achados = TERMOS_CONTEUDO_APOSTAS.filter((t) => texto.includes(t));
  return achados.length >= MIN_TERMOS_CONTEUDO
    ? `página com termos de apostas: ${achados.slice(0, 4).join(", ")}`
    : undefined;
}

/** @deprecated mantido por compatibilidade; use motivoDominioApostas */
export function looksLikeBetDomain(url: string): boolean {
  return Boolean(motivoDominioApostas(url));
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

function ipPrivado(ip: string): boolean {
  if (ip === "::1" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  const p = v4.split(".").map(Number);
  if (p.length !== 4 || p.some(Number.isNaN)) return false;
  const [a, b] = p as [number, number, number, number];
  return (
    a === 10 || a === 127 || a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/** Evita que um site do cadastro faça o servidor acessar a rede interna (SSRF). */
async function urlPermitida(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = parsed.hostname;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (isIP(host)) return !ipPrivado(host);
  try {
    const enderecos = await lookup(host, { all: true });
    return enderecos.every((e) => !ipPrivado(e.address));
  } catch {
    return false;
  }
}

async function lerHtml(response: Response): Promise<string> {
  const tipo = response.headers.get("content-type") ?? "";
  if (!tipo.includes("html") || !response.body) return "";
  const reader = response.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES_HTML) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    partes.push(value);
    total += value.length;
  }
  await reader.cancel().catch(() => undefined);
  return Buffer.concat(partes).toString("utf-8");
}

export async function checkSite(url?: string): Promise<SiteCheckResult> {
  if (!url) {
    return { acessivel: false, redirectSuspeito: false, dominioApostas: false, erro: "Nenhuma URL informada" };
  }

  const urlOriginal = normalizeUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    let atual = urlOriginal;
    let response: Response | undefined;

    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      if (!(await urlPermitida(atual))) {
        return { urlOriginal, urlFinal: atual, acessivel: false, redirectSuspeito: false, dominioApostas: false, erro: "URL bloqueada (endereço interno ou inválido)" };
      }
      response = await fetch(atual, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "antiCO-auditoria-civica/0.3 (+https://github.com/danilodanilo1/antiCO)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        atual = new URL(location, atual).toString();
        continue;
      }
      break;
    }

    if (!response) throw new Error("Sem resposta");

    const urlFinal = atual;
    const html = response.status < 400 ? await lerHtml(response) : "";
    const motivoApostas = motivoDominioApostas(urlFinal) ?? motivoConteudoApostas(html);
    const hostOriginal = new URL(urlOriginal).hostname.replace(/^www\./, "");
    const hostFinal = new URL(urlFinal).hostname.replace(/^www\./, "");

    return {
      urlOriginal,
      urlFinal,
      statusCode: response.status,
      acessivel: response.status >= 200 && response.status < 400,
      redirectSuspeito: hostOriginal !== hostFinal,
      dominioApostas: Boolean(motivoApostas),
      motivoApostas,
    };
  } catch (error) {
    logger.debug(`Site inacessível ${urlOriginal}: ${String(error)}`);
    return { urlOriginal, acessivel: false, redirectSuspeito: false, dominioApostas: false, erro: String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

export function inferSiteFromEmail(email?: string): string | undefined {
  if (!email || !email.includes("@")) return undefined;
  const domain = email.split("@")[1]?.toLowerCase().trim();
  if (!domain) return undefined;
  const freeProviders = [
    "gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.com.br", "uol.com.br", "bol.com.br",
    "live.com", "icloud.com", "terra.com.br", "ig.com.br", "globo.com", "msn.com", "protonmail.com",
  ];
  if (freeProviders.includes(domain)) return undefined;
  return `https://${domain}`;
}
