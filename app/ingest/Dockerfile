# syntax=docker/dockerfile:1

# --- deps: reproducible install of the workspace (esbuild is a root dev dep) ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY app/package.json app/package-lock.json ./
COPY app/core/package.json ./core/package.json
COPY app/db/package.json ./db/package.json
COPY app/search/package.json ./search/package.json
COPY app/ingest/package.json ./ingest/package.json
COPY app/web/package.json ./web/package.json
RUN npm ci

# --- build: bundle both entrypoints (the seed job and the migration runner) ---
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY app/package.json app/package-lock.json app/tsconfig.base.json ./
COPY app/core ./core
COPY app/db ./db
COPY app/search ./search
COPY app/ingest ./ingest
RUN npm run build -w @revelio/ingest

# Both bundles must load their whole module graph and reach their env guard.
RUN env -i node ingest/dist/ingest.mjs  2>&1 | grep -q 'DATABASE_URL is required' \
 && env -i node ingest/dist/migrate.mjs 2>&1 | grep -q 'DATABASE_URL is required'

# --- runtime: bundles, migration SQL and the card-data scripts that fill empty volumes ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# python3 + Pillow (WebP) + cairosvg (the QWF symbol is an SVG) + git run build_dataset.py
# and accio_images.py when /data or /assets are empty (see src/provision.ts). git clones hpjson; ca-certificates is for
# https to github.com and accio.cards.
RUN apk add --no-cache python3 py3-pillow py3-cairosvg git ca-certificates
COPY --from=build /app/ingest/dist/ingest.mjs ./ingest.mjs
COPY --from=build /app/ingest/dist/migrate.mjs ./migrate.mjs
# drizzle's migrator reads these at runtime, so they are data, not code, and cannot be
# bundled. MIGRATIONS_DIR tells db/src/migrate.ts where they landed: the bundle's own
# import.meta.url would resolve '../drizzle' to /drizzle from /app/ingest.mjs.
COPY --from=build /app/db/drizzle ./drizzle
ENV MIGRATIONS_DIR=/app/drizzle

# Script sources and their static inputs only, never dist/, assets/, hpjson/ or
# __pycache__: those are generated into the mounted volumes, not baked into the image.
COPY card-data/build_dataset.py card-data/accio_images.py card-data/transform_hpjson.py /app/card-data/
COPY card-data/card.schema.json card-data/sets.schema.json /app/card-data/
COPY card-data/card_overrides.json card-data/image_overrides.json /app/card-data/
COPY card-data/translations /app/card-data/translations
COPY card-data/i18n /i18n
ENV CARD_DATA_DIR=/app/card-data

# Fail the build, not the first deploy, if WebP support or a script import is missing.
RUN python3 -c "from PIL import features; assert features.check('webp')"
RUN python3 -c "import cairosvg"
RUN cd /app/card-data && python3 -c "import accio_images, build_dataset" && rm -rf __pycache__

ENV DATA_DIR=/data
ENV I18N_DIR=/i18n
ENV ASSETS_DIR=/assets
CMD ["node", "ingest.mjs"]
