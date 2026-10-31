/**
 * Casos fictícios para testar o motor de risco. Nomes e CNPJs são inventados.
 * O "caso fachada" reproduz o padrão do caso que originou o projeto: locadora pequena,
 * sócia que trabalhou em gabinete, site que abre página de apostas, avaliadores em comum
 * com outra empresa dos mesmos sócios e abertura pouco antes de receber da cota.
 */
import type { CnpjData } from "../../src/types/cnpj.js";
import type { PagadorPolitico, SocioEnriquecido } from "../../src/types/empresa.js";
import type { RiscoEmpresaInput } from "../../src/scoring/risk-engine.js";

const LOCACAO = "LOCAÇÃO OU FRETAMENTO DE VEÍCULOS AUTOMOTORES";

const cnpjFachada: CnpjData = {
  cnpj: "11222333000181",
  razaoSocial: "EXEMPLO MOBILIDADE LTDA",
  nomeFantasia: "EXEMPLO RENT A CAR",
  situacaoCadastral: "ATIVA",
  dataInicioAtividade: "2022-12-29",
  cnaeFiscal: 4923002,
  cnaeFiscalDescricao: "Serviço de transporte de passageiros - locação de automóveis com motorista",
  cnaesSecundarios: [7711000],
  logradouro: "SHJB 3 EQ 09/10 BLOCO E",
  cep: "71681525",
  municipio: "BRASILIA",
  uf: "DF",
  email: "contato@exemplorentacar.com.br",
  socios: [
    { nome: "MARIA EXEMPLO DE SOUZA", qualificacao: "Sócio" },
    { nome: "CARLOS EXEMPLO DE SOUZA", qualificacao: "Sócio-Administrador" },
  ],
};

const pagadorUnico: PagadorPolitico[] = [{
  nome: "DEPUTADO FICTICIO",
  fonte: "camara",
  totalGasto: 13_500 * 12,
  quantidadeNotas: 12,
  tiposDespesa: [LOCACAO],
  primeiraDespesa: "2023-02-15",
  ultimaDespesa: "2026-01-06",
}];

const sociosFachada: SocioEnriquecido[] = [
  {
    nome: "MARIA EXEMPLO DE SOUZA",
    qualificacao: "Sócio",
    vinculosPoliticos: [{
      nomeServidor: "MARIA EXEMPLO DE SOUZA",
      parlamentar: "OUTRO DEPUTADO FICTICIO",
      cargo: "SP22",
      periodo: "De 16/02/2023 a 16/03/2023",
      fonte: "Câmara dos Deputados, pessoal de gabinete",
      url: "https://www.camara.leg.br/deputados/0/pessoal-gabinete?ano=2023",
    }],
    outrasEmpresas: ["44.555.666/0001-00 — EXEMPLO MARKETING LTDA"],
  },
  { nome: "CARLOS EXEMPLO DE SOUZA", qualificacao: "Sócio-Administrador", vinculosPoliticos: [], outrasEmpresas: [] },
];

export const casoFachada: RiscoEmpresaInput = {
  cnpjData: cnpjFachada,
  pagadores: pagadorUnico,
  siteCheck: {
    urlOriginal: "https://exemplorentacar.com.br",
    urlFinal: "https://exemplorentacar.com.br/",
    statusCode: 200,
    acessivel: true,
    redirectSuspeito: false,
    dominioApostas: true,
    motivoApostas: "página com termos de apostas: cassino, rodadas grátis, slots",
  },
  maps: { encontrado: true, notaMedia: 4.9, totalAvaliacoes: 55, avaliacoes: [] },
  astroturfing: {
    suspeito: true,
    confianca: 0.7,
    avaliadoresSuspeitos: 3,
    avaliadoresCompartilhados: ["Avaliador A", "Avaliador B"],
    empresasRelacionadas: ["EXEMPLO MARKETING LTDA"],
    detalhes: ["2 avaliador(es) também avaliaram EXEMPLO MARKETING LTDA"],
  },
  socios: sociosFachada,
  tinhaUrl: true,
};

/** Grande locadora real-típica: muitos parlamentares, notas altas, tudo em ordem. */
export const casoGrandeLocadora: RiscoEmpresaInput = {
  cnpjData: {
    cnpj: "99888777000155",
    razaoSocial: "GRANDE LOCADORA NACIONAL S.A.",
    situacaoCadastral: "ATIVA",
    dataInicioAtividade: "1990-05-10",
    cnaeFiscal: 7711000,
    cnaeFiscalDescricao: "Locação de automóveis sem condutor",
    logradouro: "AVENIDA CENTRAL",
    cep: "30000000",
    email: "ri@grandelocadora.com.br",
    socios: [{ nome: "CONSELHO ADMINISTRATIVO EXEMPLO", qualificacao: "Diretor" }],
  },
  pagadores: Array.from({ length: 40 }, (_, i) => ({
    nome: `PARLAMENTAR ${i}`,
    fonte: "camara" as const,
    totalGasto: 50_000,
    quantidadeNotas: 10,
    tiposDespesa: [LOCACAO],
    primeiraDespesa: "2015-01-10",
  })),
  siteCheck: {
    urlOriginal: "https://grandelocadora.com.br",
    urlFinal: "https://www.grandelocadora.com.br/",
    statusCode: 200,
    acessivel: true,
    redirectSuspeito: false,
    dominioApostas: false,
  },
  maps: { encontrado: true, notaMedia: 4.2, totalAvaliacoes: 3000, avaliacoes: [] },
  astroturfing: { suspeito: false, confianca: 0, avaliadoresSuspeitos: 0, avaliadoresCompartilhados: [], empresasRelacionadas: [], detalhes: [] },
  socios: [{ nome: "CONSELHO ADMINISTRATIVO EXEMPLO", qualificacao: "Diretor", vinculosPoliticos: [], outrasEmpresas: [] }],
  tinhaUrl: true,
};

/** Pequena empresa honesta: sem site, fora do Maps, um cliente parlamentar. */
export const casoPequenaHonesta: RiscoEmpresaInput = {
  cnpjData: {
    cnpj: "55444333000122",
    razaoSocial: "JOSE TESTE TRANSPORTES ME",
    situacaoCadastral: "ATIVA",
    dataInicioAtividade: "2012-03-01",
    cnaeFiscal: 4929901,
    cnaeFiscalDescricao: "Transporte rodoviário coletivo de passageiros, sob regime de fretamento",
    logradouro: "RUA DAS FLORES",
    cep: "60000000",
    socios: [{ nome: "JOSE TESTE DA SILVA", qualificacao: "Empresário" }],
  },
  pagadores: [{
    nome: "DEPUTADO FICTICIO",
    fonte: "camara",
    totalGasto: 30_000,
    quantidadeNotas: 6,
    tiposDespesa: [LOCACAO],
    primeiraDespesa: "2020-01-10",
  }],
  maps: { encontrado: false, avaliacoes: [] },
  socios: [{ nome: "JOSE TESTE DA SILVA", qualificacao: "Empresário", vinculosPoliticos: [], outrasEmpresas: [] }],
  tinhaUrl: false,
};
