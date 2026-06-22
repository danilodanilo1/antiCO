import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../../config/env.js";
import type { AstroturfingResult, AvaliacaoMaps, MapsResult } from "../../types/empresa.js";

const GENERIC_PATTERNS = [
  /^excelente$/i,
  /^ótimo$/i,
  /^otimo$/i,
  /^muito bom$/i,
  /^recomendo$/i,
  /^atendimento (excelente|ótimo|otimo)$/i,
  /^5 estrelas$/i,
  /^maravilhoso$/i,
];

function textoGenerico(texto: string): boolean {
  const t = texto.trim();
  if (t.length < 15) return GENERIC_PATTERNS.some((p) => p.test(t));
  return false;
}

function similaridadeSimples(a: string, b: string): number {
  const wa = a.toLowerCase().split(/\s+/);
  const wb = b.toLowerCase().split(/\s+/);
  const inter = wa.filter((w) => wb.includes(w)).length;
  return inter / Math.max(wa.length, wb.length, 1);
}

export function analisarAstroturfing(
  maps: MapsResult | undefined,
  avaliadoresCompartilhados: string[] = [],
  empresasRelacionadas: string[] = [],
): AstroturfingResult {
  const detalhes: string[] = [];
  let suspeitos = 0;

  if (!maps?.encontrado) {
    return {
      suspeito: false,
      confianca: 0,
      avaliadoresSuspeitos: 0,
      avaliadoresCompartilhados: [],
      empresasRelacionadas: [],
      detalhes: ["Sem dados do Google Maps para análise"],
    };
  }

  const avaliacoes = maps.avaliacoes ?? [];

  for (const av of avaliacoes) {
    if (av.estrelas === 5 && textoGenerico(av.texto)) {
      suspeitos++;
      detalhes.push(`Review genérico de 5 estrelas: "${av.texto.slice(0, 60)}"`);
    }
  }

  const textos = avaliacoes.map((a) => a.texto).filter(Boolean);
  for (let i = 0; i < textos.length; i++) {
    for (let j = i + 1; j < textos.length; j++) {
      if (similaridadeSimples(textos[i]!, textos[j]!) > 0.8) {
        suspeitos++;
        detalhes.push("Textos de avaliações muito similares detectados");
        break;
      }
    }
  }

  const cincoEstrelas = avaliacoes.filter((a) => a.estrelas === 5).length;
  const proporcaoCinco = avaliacoes.length > 0 ? cincoEstrelas / avaliacoes.length : 0;
  if (avaliacoes.length >= 3 && proporcaoCinco >= 0.9 && maps.notaMedia && maps.notaMedia >= 4.8) {
    suspeitos++;
    detalhes.push(`${Math.round(proporcaoCinco * 100)}% das reviews são 5 estrelas com nota ${maps.notaMedia}`);
  }

  if (avaliadoresCompartilhados.length > 0) {
    suspeitos += avaliadoresCompartilhados.length;
    detalhes.push(
      `${avaliadoresCompartilhados.length} avaliador(es) também reviewaram outras empresas: ${empresasRelacionadas.slice(0, 3).join(", ")}`,
    );
  }

  const suspeito = suspeitos >= 2 || avaliadoresCompartilhados.length > 0;
  const confianca = Math.min(0.95, 0.3 + suspeitos * 0.15 + avaliadoresCompartilhados.length * 0.2);

  return {
    suspeito,
    confianca,
    avaliadoresSuspeitos: suspeitos,
    avaliadoresCompartilhados,
    empresasRelacionadas,
    detalhes,
  };
}

export async function carregarAvaliadoresCompartilhados(cnpj: string): Promise<{
  avaliadores: string[];
  empresas: string[];
}> {
  const indexPath = join(config.dataDir, "snapshots", "maps", "avaliadores-index.json");
  const key = cnpj.replace(/\D/g, "");
  try {
    const index = JSON.parse(await readFile(indexPath, "utf-8")) as Record<
      string,
      Array<{ cnpj: string; nomeEmpresa?: string }>
    >;
    const avaliadores: string[] = [];
    const empresas: string[] = [];
    for (const [avaliador, entries] of Object.entries(index)) {
      if (entries.some((e) => e.cnpj === key) && entries.some((e) => e.cnpj !== key)) {
        avaliadores.push(avaliador);
        empresas.push(...entries.filter((e) => e.cnpj !== key).map((e) => e.nomeEmpresa ?? e.cnpj));
      }
    }
    return { avaliadores, empresas: [...new Set(empresas)] };
  } catch {
    return { avaliadores: [], empresas: [] };
  }
}

export function avaliacoesSuspeitasPorHistorico(avaliacoes: AvaliacaoMaps[]): number {
  return avaliacoes.filter((a) => a.estrelas === 5 && textoGenerico(a.texto)).length;
}
