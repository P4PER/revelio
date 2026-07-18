# syntax=docker/dockerfile:1
# The build stage sets placeholder (non-secret) env so `next build` can
# evaluate server modules; these never reach the runtime image.
# check=skip=SecretsUsedInArgOrEnv

# --- deps: install the full workspace (incl. dev deps for the build) ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY core/package.json ./core/package.json
COPY db/package.json ./db/package.json
COPY search/package.json ./search/package.json
COPY ingest/package.json ./ingest/package.json
COPY web/package.json ./web/package.json
RUN npm ci

# --- build: compile the Next.js app in standalone mode ---
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json ./
# ingest is a workspace in the root package.json; its manifest must exist so
# npm can resolve the workspace map (its source is not needed for the web build).
COPY ingest/package.json ./ingest/package.json
COPY core ./core
COPY db ./db
COPY search ./search
COPY web ./web

# NEXT_PUBLIC_* are inlined into the client bundle at build time.
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_IMAGE_BASE_URL
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
ENV NEXT_PUBLIC_IMAGE_BASE_URL=$NEXT_PUBLIC_IMAGE_BASE_URL

# Placeholder server env so `next build` can evaluate server modules
# (mirrors the CI build job). NOT inlined into the client bundle.
ENV DATABASE_URL=postgres://user:pass@localhost:5432/db \
    MEILI_HOST=http://localhost:7700 \
    MEILI_SEARCH_KEY=build-placeholder \
    BETTER_AUTH_SECRET=build-placeholder-secret \
    BETTER_AUTH_URL=http://localhost:3000 \
    ADMIN_EMAILS=admin@example.com

RUN npm run build -w web

# --- runtime: minimal standalone server ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Standalone output preserves the monorepo layout: server.js lives under web/.
COPY --from=build --chown=nextjs:nodejs /app/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/web/.next/static ./web/.next/static
COPY --from=build --chown=nextjs:nodejs /app/web/public ./web/public

USER nextjs
EXPOSE 3000
CMD ["node", "web/server.js"]
