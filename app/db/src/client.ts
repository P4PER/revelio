import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type ClientOptions = {
  max?: number
}

// Matches postgres.js's own default. Do not drop this to 1: one connection
// serializes every query in the process, so a Promise.all of independent reads
// runs one after another and concurrent requests queue behind each other.
// Connections are opened lazily, so the one-shot jobs (ingest, migrate-cli)
// still use exactly one.
const DEFAULT_MAX_CONNECTIONS = 10

export function createClient(databaseUrl: string, options: ClientOptions = {}) {
  const sql = postgres(databaseUrl, { max: options.max ?? DEFAULT_MAX_CONNECTIONS })
  const db = drizzle(sql, { schema })
  return { db, sql }
}

export type DB = ReturnType<typeof createClient>['db']
