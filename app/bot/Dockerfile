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

# sharp is the one dependency the bundle cannot inline (native .node + libvips).
# Install it alone, at the exact version the workspace resolved, so the runtime
# image carries sharp and its musl libvips and nothing else from the toolchain.
RUN npm install --prefix /sharp --omit=dev --no-package-lock \
      sharp@$(node -p "require('/app/node_modules/sharp/package.json').version")

# --- runtime: the bundle and nothing else ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S bot -u 1001
COPY --from=build --chown=bot:nodejs /sharp/node_modules ./node_modules
COPY --from=build --chown=bot:nodejs /app/bot/dist/bot.mjs ./bot.mjs
COPY --from=build --chown=bot:nodejs /app/bot/dist/Poppins-SemiBold.ttf /app/bot/dist/fonts.conf ./

# fontconfig writes a cache on its first text render and warns on every boot
# without somewhere to put it. One font makes the cache tiny; the warning is
# what it would cost.
RUN mkdir -p /var/cache/fontconfig && chown bot:nodejs /var/cache/fontconfig

# The deck sheet is drawn with sharp text and a bundled font, and both would
# build clean and fail on the first /deck: require() catches a missing native
# binary, and the comparison catches a missing font. fonts.conf leaves Poppins
# the only family fontconfig knows, so an unmatched family has to resolve to it
# - unless the font is not there, when both fall back to tofu and differ.
RUN node -e "const s=require('sharp');process.env.FONTCONFIG_FILE='/app/fonts.conf';\
const d=f=>s({text:{text:'revelio',font:f,fontfile:'/app/Poppins-SemiBold.ttf',rgba:true}}).raw().toBuffer();\
Promise.all([d('Poppins SemiBold 24'),d('Nonexistent SemiBold 24')])\
.then(([a,b])=>{if(!a.equals(b))throw new Error('bundled Poppins did not render')})"

USER bot
CMD ["node", "bot.mjs"]
