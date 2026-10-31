# antiCO

Ferramenta de auditoria cívica que cruza a cota parlamentar (CEAP da Câmara e CEAPS do Senado) com dados públicos de empresas para apontar fornecedores que merecem investigação.

> O antiCO aponta **indícios a verificar**, não prova de ilícito. Cada sinal mostra a fonte oficial para conferência.

## O que faz

- **Investigar político:** busca deputado ou senador, agrupa as despesas por fornecedor e avalia cada CNPJ.
- **Investigar empresa:** mostra quais parlamentares pagaram um CNPJ, os sócios, o site e as avaliações no Google Maps.
- **Classificação por regras** (ver abaixo), com categoria e fonte em cada sinal.

## Como rodar

Requer Node 18+.

```bash
npm install            # também instala o Chromium do Playwright (usado no Google Maps)
npm run dev            # API em http://localhost:3001 e interface em http://localhost:5173
```

Na primeira execução a API baixa os arquivos da cota (vários GB) para `data/raw/`. Isso demora.

Outros comandos:

| Comando | O que faz |
| --- | --- |
| `npm run investigar -- --politico "Nome"` | Dossiê pela linha de comando |
| `npm run coletar:gabinete -- --anos 2019-2026` | Coleta o pessoal de gabinete da Câmara (ver abaixo) |
| `npm test` | Testes (Vitest) |
| `npm run typecheck` | Checagem de tipos |
| `npm run build && npm run build:ui && npm start` | Produção: a API serve a interface compilada |
| `docker build -t antico . && docker run -p 3001:3001 -v $PWD/data:/app/data antico` | Produção em Docker |

Variáveis de ambiente opcionais estão em `.env.example`.

## Pessoal de gabinete

O sinal mais forte do antiCO é **sócio do fornecedor com o mesmo nome completo de um servidor de gabinete**. Ele depende de `data/gabinete/servidores.csv`, gerado por:

```bash
npm run coletar:gabinete -- --anos 2019-2026
```

O coletor lê a página "Pessoal de gabinete" de cada deputado no portal da Câmara, com pausa de 1,5 s entre requisições. A coleta completa leva horas; use `--ids` para deputados específicos. Sem esse arquivo, o sinal simplesmente não aparece.

O casamento exige o **nome completo idêntico** (sem acentos) com pelo menos 3 palavras. Mesmo assim pode haver homônimos: confira sempre o link da fonte.

## Como a classificação funciona

Cada sinal tem uma categoria:

| Categoria | Exemplos | Peso |
| --- | --- | --- |
| **Fato** | Sócio com nome de servidor de gabinete; CNPJ baixado ou inapto | Forte |
| **Indício** | Site abre página de apostas; CNAE incompatível; empresa aberta menos de 180 dias antes do primeiro pagamento; avaliadores do Google Maps em comum com outras empresas investigadas; mesmo endereço de outro CNPJ investigado; um parlamentar responde por 80%+ do que a empresa recebeu | Médio |
| **Contexto** | Sem site, fora do Google Maps, nota fiscal alta, muitos parlamentares clientes, reviews genéricos | Não pontua |

| Classificação | Regra |
| --- | --- |
| CRÍTICO | 1 fato e 2 indícios |
| ALTO | 1 fato, ou 3 indícios |
| MÉDIO | 2 indícios |
| BAIXO | o resto |

Sinais de contexto aparecem no dossiê para o investigador, mas não mudam a classificação: são comuns em empresas legítimas.

## Testes

`test/fixtures/casos.ts` tem três casos fictícios:

- **Empresa de fachada** (padrão do caso que originou o projeto): deve sair CRÍTICO.
- **Grande locadora** paga por 40 parlamentares: deve sair BAIXO.
- **Pequena empresa honesta** sem site e fora do Maps: deve sair BAIXO.

Qualquer mudança nas regras precisa manter esses resultados.

## Fontes

- Câmara dos Deputados: [Dados Abertos](https://dadosabertos.camara.leg.br) e cota parlamentar
- Senado Federal: CEAPS e Dados Abertos
- Receita Federal via [BrasilAPI](https://brasilapi.com.br) e [Minha Receita](https://minhareceita.org)
- Google Maps (raspagem com Playwright; frágil e sujeita aos termos do Google)
