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
COPY bot/package.json ./bot/package.json
RUN npm ci

# --- build: bundle the gateway into a single file ---
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json ./
COPY core ./core
COPY db ./db
COPY search ./search
COPY bot ./bot
RUN npm run build -w @revelio/bot

# A bundle inlines every imported module, so a module-level "am I the entry script?"
# guard sees the bundle as itself and can exit before main() runs. The 'bot failed to
# start:' prefix is printed only by main()'s catch handler, so requiring it here fails
# the build if that ever regresses. Empty env, no network: the run dies at env parsing.
RUN env -i node bot/dist/bot.mjs 2>&1 | grep -q 'bot failed to start:'

# --- runtime: the bundle and nothing else ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S bot -u 1001
COPY --from=build --chown=bot:nodejs /app/bot/dist/bot.mjs ./bot.mjs
USER bot
CMD ["node", "bot.mjs"]
