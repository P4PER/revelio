# syntax=docker/dockerfile:1

# --- deps: reproducible install of the workspace (tsx is a root dev dep) ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY core/package.json ./core/package.json
COPY db/package.json ./db/package.json
COPY search/package.json ./search/package.json
COPY ingest/package.json ./ingest/package.json
COPY web/package.json ./web/package.json
COPY bot/package.json ./bot/package.json
RUN npm ci

# --- runtime: long-running gateway process, no mounted data ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json ./
COPY core ./core
COPY db ./db
COPY search ./search
COPY bot ./bot

CMD ["npx", "tsx", "bot/src/main.ts"]
