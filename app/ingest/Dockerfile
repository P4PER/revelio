# syntax=docker/dockerfile:1

# --- deps: reproducible install of the workspace (esbuild is a root dev dep) ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY core/package.json ./core/package.json
COPY db/package.json ./db/package.json
COPY search/package.json ./search/package.json
COPY ingest/package.json ./ingest/package.json
COPY web/package.json ./web/package.json
RUN npm ci

# --- build: bundle both entrypoints (the seed job and the migration runner) ---
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json ./
COPY core ./core
COPY db ./db
COPY search ./search
COPY ingest ./ingest
RUN npm run build -w @revelio/ingest

# Both bundles must load their whole module graph and reach their env guard.
RUN env -i node ingest/dist/ingest.mjs  2>&1 | grep -q 'DATABASE_URL is required' \
 && env -i node ingest/dist/migrate.mjs 2>&1 | grep -q 'DATABASE_URL is required'

# --- runtime: bundles + the migration SQL; dataset is mounted at run ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/ingest/dist/ingest.mjs ./ingest.mjs
COPY --from=build /app/ingest/dist/migrate.mjs ./migrate.mjs
# drizzle's migrator reads these at runtime, so they are data, not code, and cannot be
# bundled. MIGRATIONS_DIR tells db/src/migrate.ts where they landed: the bundle's own
# import.meta.url would resolve '../drizzle' to /drizzle from /app/ingest.mjs.
COPY --from=build /app/db/drizzle ./drizzle
ENV MIGRATIONS_DIR=/app/drizzle

ENV DATA_DIR=/data
ENV I18N_DIR=/i18n
ENV ASSETS_DIR=/assets
CMD ["node", "ingest.mjs"]
