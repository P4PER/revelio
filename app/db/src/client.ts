import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export function createClient(databaseUrl: string) {
  const sql = postgres(databaseUrl, { max: 1 })
  const db = drizzle(sql, { schema })
  return { db, sql }
}

export type DB = ReturnType<typeof createClient>['db']
