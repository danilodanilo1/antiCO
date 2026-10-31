# Imagem com Chromium já instalado (usado pela verificação no Google Maps).
FROM mcr.microsoft.com/playwright:v1.61.0-noble

WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    DATA_DIR=/app/data \
    PORT=3001

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json vitest.config.ts ./
COPY src ./src
COPY scripts ./scripts
COPY web ./web
RUN npm run build && npm run build:ui
ENV NODE_ENV=production

VOLUME ["/app/data"]
EXPOSE 3001
CMD ["npm", "start"]
