import { createApp } from "./app.js";
import { deputadosIndex } from "../services/camara/deputados-index.service.js";
import { senadoresIndex } from "../services/senado/senadores-index.service.js";
import { cnpjIndex } from "../services/index/cnpj-index.service.js";
import { gabineteIndex } from "../services/vinculos/gabinete-index.service.js";

const PORT = Number(process.env.PORT ?? 3001);

const app = createApp();

app.listen(PORT, () => {
  console.log(`antiCO API rodando em http://localhost:${PORT}`);
  console.log("Carregando índices (políticos + CNPJ)...");

  Promise.all([
    deputadosIndex.ensureLoaded(),
    senadoresIndex.ensureLoaded(),
    cnpjIndex.ensureLoaded(),
    gabineteIndex.ensureLoaded(),
  ])
    .then(() => console.log("Índices prontos — busca histórica e CNPJ ativos."))
    .catch((error) => console.error("Falha ao carregar índices:", error));
});
