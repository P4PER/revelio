import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import type { DB } from './client'

const here = dirname(fileURLToPath(import.meta.url))

// Bundled builds break the import.meta.url derivation: from a single-file bundle at
// /app/ingest.mjs, '../drizzle' resolves to /drizzle instead of the package's own folder.
// MIGRATIONS_DIR lets the image state the path it actually copied the SQL to; running from
// source leaves it unset and keeps the relative default.
export function resolveMigrationsDir(env: Record<string, string | undefined> = process.env): string {
  return env.MIGRATIONS_DIR ? env.MIGRATIONS_DIR : resolve(here, '../drizzle')
}

export const migrationsDir = resolveMigrationsDir()

export async function runMigrations(db: DB): Promise<void> {
  await migrate(db, { migrationsFolder: migrationsDir })
}
