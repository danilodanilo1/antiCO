import { config } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import { withRetry } from "../../utils/retry.js";

export interface CamaraListResponse<T> {
  dados: T[];
  links?: Array<{ rel: string; href: string }>;
}

export class CamaraClient {
  constructor(private readonly baseUrl = config.camaraBaseUrl) {}

  async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value));
      }
    }

    logger.debug(`GET ${url.toString()}`);

    return withRetry(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

      try {
        const response = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Câmara API ${response.status}: ${response.statusText} — ${url.pathname}`);
        }

        return (await response.json()) as T;
      } finally {
        clearTimeout(timeout);
      }
    }, `Câmara API ${path}`);
  }

  async getAllPages<T>(initialPath: string, params?: Record<string, string | number>): Promise<T[]> {
    const items: T[] = [];
    let path = initialPath;
    let query: Record<string, string | number> = { ...params, itens: 100 };

    for (let page = 0; page < 50; page++) {
      const response = await this.get<CamaraListResponse<T>>(path, query);
      items.push(...response.dados);

      const next = response.links?.find((l) => l.rel === "next");
      if (!next?.href) break;

      const nextUrl = new URL(next.href);
      path = nextUrl.pathname.replace("/api/v2", "");
      query = Object.fromEntries(nextUrl.searchParams.entries()) as Record<string, string | number>;
    }

    return items;
  }
}
