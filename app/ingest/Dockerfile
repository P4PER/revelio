FROM node:20-alpine
WORKDIR /app

# Workspace manifests first for layer caching
COPY package.json package-lock.json ./
COPY core/package.json ./core/package.json
COPY db/package.json ./db/package.json
COPY ingest/package.json ./ingest/package.json
RUN npm install

# Source
COPY tsconfig.base.json ./
COPY core ./core
COPY db ./db
COPY ingest ./ingest

ENV DATA_DIR=/data
ENV I18N_DIR=/i18n
CMD ["npx", "tsx", "ingest/src/main.ts"]
