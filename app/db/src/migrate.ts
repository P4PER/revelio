import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import type { DB } from './client.js'

const here = dirname(fileURLToPath(import.meta.url))
export const migrationsDir = resolve(here, '../drizzle')

export async function runMigrations(db: DB): Promise<void> {
  await migrate(db, { migrationsFolder: migrationsDir })
}
