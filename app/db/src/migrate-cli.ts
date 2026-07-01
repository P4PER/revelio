import { createClient } from './client.js'
import { runMigrations } from './migrate.js'

// Standalone migration runner: apply all pending migrations to the database at
// DATABASE_URL, then exit. Uses the same runMigrations() the ingest job uses, so
// there is no drift between "migrate only" and "migrate then seed".
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const { db, sql } = createClient(databaseUrl)
try {
  await runMigrations(db)
  console.log('migrations applied')
} catch (err) {
  console.error('migration failed:', err)
  process.exitCode = 1
} finally {
  await sql.end()
}
