import type { SiteCheckResult } from "../types/investigacao.js";
import { config } from "../config/env.js";
import { logger } from "../utils/logger.js";

const BET_KEYWORDS = [
  "bet",
  "aposta",
  "cassino",
  "casino",
  "jogo",
  "poker",
  "slots",
  "blaze",
  "pixbet",
  "sportingbet",
];

const SUSPICIOUS_TLDS = [".bet", ".casino", ".poker"];

function looksLikeBetDomain(url: string): boolean {
  const lower = url.toLowerCase();
  if (SUSPICIOUS_TLDS.some((tld) => lower.includes(tld))) return true;
  return BET_KEYWORDS.some((kw) => lower.includes(kw));
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

export async function checkSite(url?: string): Promise<SiteCheckResult> {
  if (!url) {
    return {
      acessivel: false,
      redirectSuspeito: false,
      dominioApostas: false,
      erro: "Nenhuma URL informada",
    };
  }

  const urlOriginal = normalizeUrl(url);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

    const response = await fetch(urlOriginal, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "antiCO-auditoria-civica/0.1 (+https://github.com/local)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    clearTimeout(timeout);

    const urlFinal = response.url;
    const dominioApostas = looksLikeBetDomain(urlFinal);
    const redirectSuspeito = urlFinal !== urlOriginal && dominioApostas;

    return {
      urlOriginal,
      urlFinal,
      statusCode: response.status,
      acessivel: response.status >= 200 && response.status < 400,
      redirectSuspeito,
      dominioApostas,
    };
  } catch (error) {
    logger.debug(`Site inacessível ${urlOriginal}: ${String(error)}`);
    return {
      urlOriginal,
      acessivel: false,
      redirectSuspeito: false,
      dominioApostas: false,
      erro: String(error),
    };
  }
}

export function inferSiteFromEmail(email?: string): string | undefined {
  if (!email || !email.includes("@")) return undefined;
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return undefined;
  const freeProviders = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "uol.com.br", "bol.com.br"];
  if (freeProviders.includes(domain)) return undefined;
  return `https://${domain}`;
}
