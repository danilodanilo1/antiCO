import { logger } from "./logger.js";

export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoffFactor?: number;
  /** Decide se vale tentar de novo. Padrão: sempre. */
  shouldRetry?: (error: unknown) => boolean;
  /** Espera mínima pedida pelo servidor (ex.: cabeçalho Retry-After), em ms. */
  retryAfterMs?: (error: unknown) => number | undefined;
  /** Substitui o setTimeout (usado nos testes). */
  sleep?: (ms: number) => Promise<void>;
}

/** Erro HTTP com status, para a política de retry decidir. */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Erros temporários: 5xx, 429, 408, timeout (abort) e falha de rede. 4xx comuns não adiantam repetir. */
export function erroTemporario(error: unknown): boolean {
  if (error instanceof HttpError) {
    return error.status >= 500 || error.status === 429 || error.status === 408;
  }
  const nome = (error as { name?: string })?.name;
  if (nome === "AbortError" || nome === "TimeoutError") return true;
  const msg = String(error);
  return msg.includes("fetch failed") || msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT") || msg.includes("aborted");
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const delayMs = options.delayMs ?? 1_000;
  const backoffFactor = options.backoffFactor ?? 2;
  const shouldRetry = options.shouldRetry ?? (() => true);
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !shouldRetry(error)) break;
      const backoff = delayMs * Math.pow(backoffFactor, attempt - 1);
      const wait = Math.max(backoff, options.retryAfterMs?.(error) ?? 0);
      logger.warn(`${label} falhou (tentativa ${attempt}/${maxAttempts}): ${String(error)}. Nova tentativa em ${wait}ms...`);
      await sleep(wait);
    }
  }

  throw lastError;
}
