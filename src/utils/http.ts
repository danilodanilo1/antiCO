import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);

export async function fetchJson<T>(url: string, label = "HTTP"): Promise<T> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`${label} ${response.status}: ${response.statusText}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (shouldTryCurlFallback(error)) {
      logger.debug(`${label} fetch falhou (${String(error)}), tentando curl...`);
      return fetchJsonViaCurl<T>(url, label);
    }
    throw error;
  }
}

export async function fetchText(url: string, label = "HTTP"): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${label} ${response.status}: ${response.statusText}`);
    }
    return response.text();
  } catch (error) {
    if (shouldTryCurlFallback(error)) {
      logger.debug(`${label} fetch falhou (${String(error)}), tentando curl...`);
      return fetchTextViaCurl(url, label);
    }
    throw error;
  }
}

function shouldTryCurlFallback(error: unknown): boolean {
  const message = String(error);
  return (
    message.includes("fetch failed") ||
    message.includes("ERR_SSL") ||
    message.includes("certificate")
  );
}

async function fetchJsonViaCurl<T>(url: string, label: string): Promise<T> {
  const body = await fetchTextViaCurl(url, label);
  return JSON.parse(body) as T;
}

async function fetchTextViaCurl(url: string, label: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "curl.exe",
      ["-sL", "-H", "Accept: application/json", url],
      { maxBuffer: 50 * 1024 * 1024, encoding: "utf8" },
    );
    return stdout;
  } catch (error) {
    throw new Error(`${label} indisponível (fetch e curl falharam): ${String(error)}`);
  }
}
