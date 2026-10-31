import express from "express";
import cors from "cors";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { investigarPolitico } from "../pipelines/investigar-politico.js";
import { investigarEmpresa } from "../pipelines/investigar-empresa.js";
import { gerarRelatorioMarkdown } from "../reports/markdown.js";
import type { CargoAlias } from "../services/sources/registry.js";
import { CamaraSource } from "../services/sources/camara.source.js";
import { SenadoSource } from "../services/sources/senado.source.js";
import { labelCargo, labelFonte } from "../types/politico.js";
import { config } from "../config/env.js";
import { saveReport } from "../utils/files.js";
import { cnpjIndex } from "../services/index/cnpj-index.service.js";
import { cnpjNotas } from "../services/index/cnpj-notas.service.js";
import { normalizeCnpj, isCnpj, formatCnpj } from "../utils/cnpj.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, version: "0.3.0" });
  });

  app.get("/api/cargos", (_req, res) => {
    res.json([
      { id: "auto", label: "Detectar automaticamente" },
      { id: "deputado", label: "Deputado Federal" },
      { id: "senador", label: "Senador" },
      { id: "presidente-camara", label: "Presidente da Câmara" },
      { id: "presidente-senado", label: "Presidente do Senado" },
      { id: "mesa-camara", label: "Mesa diretora — Câmara" },
      { id: "mesa-senado", label: "Mesa diretora — Senado" },
    ]);
  });

  app.get("/api/buscar", async (req, res, next) => {
    try {
      const nome = String(req.query.nome ?? "").trim();
      if (nome.length < 2) {
        res.json([]);
        return;
      }

      const camara = new CamaraSource();
      const senado = new SenadoSource();

      const [depResult, senResult] = await Promise.allSettled([
        camara.buscarPorNome(nome),
        senado.buscarPorNome(nome),
      ]);

      const dep = depResult.status === "fulfilled" ? depResult.value : [];
      const sen = senResult.status === "fulfilled" ? senResult.value : [];

      if (depResult.status === "rejected") {
        console.error("[buscar] Câmara:", depResult.reason);
      }
      if (senResult.status === "rejected") {
        console.error("[buscar] Senado:", senResult.reason);
      }

      const resultados = [...dep, ...sen]
        .slice(0, 25)
        .map((p) => ({
        id: p.id,
        nome: p.nome,
        cargo: labelCargo(p),
        titulo: p.titulo,
        partido: p.siglaPartido,
        uf: p.siglaUf,
        fonte: labelFonte(p.fonte),
      }));

      res.json(resultados);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/investigar", async (req, res, next) => {
    try {
      const {
        nome,
        cargo,
        tipoDespesa,
        ano,
        limiteFornecedores = 10,
        apenasAnomalias = false,
      } = req.body as {
        nome?: string;
        cargo?: CargoAlias;
        tipoDespesa?: string;
        ano?: number;
        limiteFornecedores?: number;
        apenasAnomalias?: boolean;
      };

      if (!nome && !cargo?.includes("presidente")) {
        res.status(400).json({ error: "Informe o nome do político ou um cargo especial." });
        return;
      }

      const resultado = await investigarPolitico({
        nome: nome ?? cargo ?? "",
        cargo,
        tipoDespesa: tipoDespesa || undefined,
        ano: ano ? Number(ano) : undefined,
        limiteFornecedores: Number(limiteFornecedores) || 10,
        apenasAnomalias,
      });

      const markdown = gerarRelatorioMarkdown(resultado);
      const slug = resultado.politico.nome.toLowerCase().replace(/\s+/g, "-");
      const reportPath = await saveReport(`dossie-${slug}-${Date.now()}.md`, markdown);

      res.json({ ...resultado, reportPath });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/investigar-empresa", async (req, res, next) => {
    try {
      const { cnpj, incluirMaps = true } = req.body as { cnpj?: string; incluirMaps?: boolean };

      if (!cnpj) {
        res.status(400).json({ error: "Informe o CNPJ da empresa." });
        return;
      }

      const digits = normalizeCnpj(cnpj);
      if (!isCnpj(digits)) {
        res.status(400).json({ error: `CNPJ inválido: ${cnpj}` });
        return;
      }

      const resultado = await investigarEmpresa({ cnpj: digits, incluirMaps });
      res.json(resultado);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cnpj/:cnpj/pagadores", async (req, res, next) => {
    try {
      const digits = normalizeCnpj(req.params.cnpj);
      if (!isCnpj(digits)) {
        res.status(400).json({ error: `CNPJ inválido: ${req.params.cnpj}` });
        return;
      }

      await cnpjIndex.ensureLoaded();
      const pagadores = await cnpjIndex.buscarPagadores(digits);
      res.json({
        cnpj: digits,
        cnpjFormatado: formatCnpj(digits),
        pagadores,
        totalRecebido: pagadores.reduce((s, p) => s + p.totalGasto, 0),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cnpj/:cnpj/pagadores/:politico/notas", async (req, res, next) => {
    try {
      const digits = normalizeCnpj(req.params.cnpj);
      if (!isCnpj(digits)) {
        res.status(400).json({ error: `CNPJ inválido: ${req.params.cnpj}` });
        return;
      }

      const politico = decodeURIComponent(req.params.politico);
      const fonte = req.query.fonte as "camara" | "senado" | undefined;

      const notas = await cnpjNotas.buscarNotas(digits, politico, fonte);
      res.json({ cnpj: digits, politico, notas, total: notas.length });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/reports", async (_req, res, next) => {
    try {
      const dir = join(config.dataDir, "reports");
      const files = await readdir(dir).catch(() => []);
      const mdFiles = files.filter((f) => f.endsWith(".md")).sort().reverse().slice(0, 20);
      res.json(mdFiles);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/reports/:filename", async (req, res, next) => {
    try {
      const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, "");
      const content = await readFile(join(config.dataDir, "reports", filename), "utf-8");
      res.type("text/markdown").send(content);
    } catch (error) {
      next(error);
    }
  });

  // Em produção, a API também serve a interface compilada (npm run build:ui).
  const uiDir = resolve(process.env.UI_DIR ?? "dist-ui");
  if (existsSync(join(uiDir, "index.html"))) {
    app.use(express.static(uiDir));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(uiDir, "index.html")));
  }

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  });

  return app;
}
