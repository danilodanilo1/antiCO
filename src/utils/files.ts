import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config/env.js";

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function saveJson(subdir: string, filename: string, data: unknown): Promise<string> {
  const dir = join(config.dataDir, subdir);
  await ensureDir(dir);
  const filepath = join(dir, filename);
  await writeFile(filepath, JSON.stringify(data, null, 2), "utf-8");
  return filepath;
}

export async function saveReport(filename: string, content: string): Promise<string> {
  const dir = join(config.dataDir, "reports");
  await ensureDir(dir);
  const filepath = join(dir, filename);
  await writeFile(filepath, content, "utf-8");
  return filepath;
}
