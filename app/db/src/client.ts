import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type ClientOptions = {
  max?: number
}

// Matches postgres.js's own default. Do not drop this to 1: one connection
// serializes every query in the process, so a Promise.all of independent reads
// runs one after another and concurrent requests queue behind each other.
// Connections open on demand, so a caller only ever holds as many as it has
// queries in flight: one for migrate-cli, up to five for ingest's parallel reads
// in build-documents.ts, and up to this ceiling for the long-lived servers.
const DEFAULT_MAX_CONNECTIONS = 10

// postgres.js never releases an idle connection on its own, so without this a
// process would hold its peak count for as long as it runs. Thirty seconds keeps
// a busy server's pool warm and lets an idle one fall back to no connections.
const IDLE_TIMEOUT_SECONDS = 30

export function createClient(databaseUrl: string, options: ClientOptions = {}) {
  const sql = postgres(databaseUrl, {
    max: options.max ?? DEFAULT_MAX_CONNECTIONS,
    idle_timeout: IDLE_TIMEOUT_SECONDS,
  })
  const db = drizzle(sql, { schema })
  return { db, sql }
}

export type DB = ReturnType<typeof createClient>['db']
