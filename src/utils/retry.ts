import { logger } from "./logger.js";

export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  backoffFactor?: number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const delayMs = options.delayMs ?? 1_000;
  const backoffFactor = options.backoffFactor ?? 2;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) break;
      const wait = delayMs * Math.pow(backoffFactor, attempt - 1);
      logger.warn(`${label} falhou (tentativa ${attempt}/${maxAttempts}). Retry em ${wait}ms...`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  throw lastError;
}
