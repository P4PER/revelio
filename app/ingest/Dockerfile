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
RUN npm ci

# --- runtime: code-only; dataset (DATA_DIR/I18N_DIR/ASSETS_DIR) mounted at run ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json ./
COPY core ./core
COPY db ./db
COPY search ./search
COPY ingest ./ingest

ENV DATA_DIR=/data
ENV I18N_DIR=/i18n
ENV ASSETS_DIR=/assets
CMD ["npx", "tsx", "ingest/src/main.ts"]
