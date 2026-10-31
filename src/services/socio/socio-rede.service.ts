import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../../config/env.js";
import type { CnpjData, Socio } from "../../types/cnpj.js";
import type { SocioEnriquecido } from "../../types/empresa.js";
import { normalizeCnpj, isCnpj, formatCnpj } from "../../utils/cnpj.js";
import { ensureDir } from "../../utils/files.js";
import { logger } from "../../utils/logger.js";
import { normalizarNomePolitico } from "../shared/despesas-processor.js";
import { gabineteIndex } from "../vinculos/gabinete-index.service.js";
import { CnpjService } from "../brasilapi/cnpj.service.js";

interface QsaSnapshot {
  cnpj: string;
  data: string;
  socios: Socio[];
}

export class SocioRedeService {
  private cnpjService = new CnpjService();

  async enriquecerSocios(cnpjData: CnpjData): Promise<{
    socios: SocioEnriquecido[];
    socioAlteradoRecente: boolean;
  }> {
    await gabineteIndex.ensureLoaded();
    await this.salvarSnapshot(cnpjData);

    const snapshots = await this.listarSnapshots(cnpjData.cnpj);
    const socioAlteradoRecente = this.detectarAlteracaoRecente(snapshots);

    const socios: SocioEnriquecido[] = [];
    for (const s of cnpjData.socios) {
      const vinculosPoliticos = await gabineteIndex.buscarVinculos(s.nome);
      const outrasEmpresas = await this.buscarEmpresasPorSocio(s);

      socios.push({
        nome: s.nome,
        qualificacao: s.qualificacao,
        dataEntrada: s.dataEntrada,
        cpfCnpj: s.cpfCnpj,
        vinculosPoliticos,
        outrasEmpresas,
      });
    }

    return { socios, socioAlteradoRecente };
  }

  async buscarCnpjsPorEndereco(cep?: string, logradouro?: string): Promise<string[]> {
    if (!cep || !logradouro) return [];
    const dir = join(config.dataDir, "snapshots", "cnpj");
    const matches: string[] = [];

    try {
      const files = await readdir(dir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const raw = await readFile(join(dir, file), "utf-8");
        const snap = JSON.parse(raw) as { cnpj: string; cep?: string; logradouro?: string };
        // Exige CEP igual E logradouro igual: CEP sozinho cobre quarteirões inteiros
        // e os 8 primeiros caracteres do logradouro ("RUA DAS ") casavam com meio país.
        const cepIgual = Boolean(cep) && snap.cep?.replace(/\D/g, "") === cep!.replace(/\D/g, "");
        const logradouroIgual =
          Boolean(logradouro) &&
          Boolean(snap.logradouro) &&
          normalizarNomePolitico(snap.logradouro!) === normalizarNomePolitico(logradouro!);
        if (cepIgual && logradouroIgual) matches.push(snap.cnpj);
      }
    } catch {
      // sem snapshots
    }
    return matches;
  }

  private async salvarSnapshot(cnpjData: CnpjData): Promise<void> {
    const dir = join(config.dataDir, "snapshots", "cnpj");
    await ensureDir(dir);
    const date = new Date().toISOString().slice(0, 10);
    const path = join(dir, `${cnpjData.cnpj}-${date}.json`);
    const snap: QsaSnapshot & { cep?: string; logradouro?: string; razaoSocial: string } = {
      cnpj: cnpjData.cnpj,
      data: new Date().toISOString(),
      socios: cnpjData.socios,
      cep: cnpjData.cep,
      logradouro: cnpjData.logradouro,
      razaoSocial: cnpjData.razaoSocial,
    };
    await writeFile(path, JSON.stringify(snap, null, 2), "utf-8");
  }

  private async listarSnapshots(cnpj: string): Promise<QsaSnapshot[]> {
    const dir = join(config.dataDir, "snapshots", "cnpj");
    const key = normalizeCnpj(cnpj);
    const snaps: QsaSnapshot[] = [];

    try {
      const files = (await readdir(dir)).filter((f) => f.startsWith(key)).sort();
      for (const file of files) {
        const raw = await readFile(join(dir, file), "utf-8");
        snaps.push(JSON.parse(raw) as QsaSnapshot);
      }
    } catch {
      // vazio
    }
    return snaps;
  }

  private detectarAlteracaoRecente(snapshots: QsaSnapshot[]): boolean {
    if (snapshots.length < 2) return false;
    const prev = snapshots[snapshots.length - 2]!;
    const curr = snapshots[snapshots.length - 1]!;
    const prevNomes = new Set(prev.socios.map((s) => normalizarNomePolitico(s.nome)));
    const currNomes = new Set(curr.socios.map((s) => normalizarNomePolitico(s.nome)));
    if (prevNomes.size !== currNomes.size) return true;
    for (const n of currNomes) {
      if (!prevNomes.has(n)) return true;
    }
    return false;
  }

  private async buscarEmpresasPorSocio(socio: Socio): Promise<string[]> {
    const empresas: string[] = [];
    const cpfCnpj = socio.cpfCnpj?.replace(/\D/g, "") ?? "";

    if (isCnpj(cpfCnpj)) {
      const data = await this.cnpjService.consultar(cpfCnpj);
      if (data) empresas.push(`${formatCnpj(data.cnpj)} — ${data.razaoSocial}`);
    }

    const dir = join(config.dataDir, "snapshots", "cnpj");
    const nomeNorm = normalizarNomePolitico(socio.nome);
    try {
      const files = await readdir(dir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const raw = await readFile(join(dir, file), "utf-8");
        const snap = JSON.parse(raw) as QsaSnapshot & { razaoSocial?: string };
        const temSocio = snap.socios.some((s) => normalizarNomePolitico(s.nome) === nomeNorm);
        if (temSocio && snap.cnpj) {
          empresas.push(`${formatCnpj(snap.cnpj)} — ${snap.razaoSocial ?? "?"}`);
        }
      }
    } catch {
      // sem snapshots
    }

    return [...new Set(empresas)].slice(0, 5);
  }
}

export const socioRede = new SocioRedeService();
