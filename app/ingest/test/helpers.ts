import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { createClient, runMigrations } from '@revelio/db'

// Provisions an isolated Postgres for a test. Prefers an external server via
// TEST_DATABASE_URL (a fresh database is created per call, then dropped) — fast
// and reliable in CI/sandboxes. Falls back to a throwaway Testcontainers
// instance (image via TEST_POSTGRES_IMAGE, default postgres:16-alpine).

async function createFreshDatabase(adminUrl: string): Promise<{
  url: string
  drop: () => Promise<void>
}> {
  const name = `test_${randomUUID().replace(/-/g, '')}`
  const admin = postgres(adminUrl, { max: 1 })
  await admin.unsafe(`CREATE DATABASE "${name}"`)
  await admin.end()
  const url = new URL(adminUrl)
  url.pathname = `/${name}`
  return {
    url: url.toString(),
    async drop() {
      const a = postgres(adminUrl, { max: 1 })
      await a.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
      await a.end()
    },
  }
}

/** A migrated Drizzle client on an isolated database. */
export async function withMigratedDb() {
  const external = process.env.TEST_DATABASE_URL
  if (external) {
    const { url, drop } = await createFreshDatabase(external)
    const { db, sql } = createClient(url)
    await runMigrations(db)
    return {
      db,
      sql,
      async stop() {
        await sql.end()
        await drop()
      },
    }
  }

  const image = process.env.TEST_POSTGRES_IMAGE ?? 'postgres:16-alpine'
  const container = await new PostgreSqlContainer(image).start()
  const { db, sql } = createClient(container.getConnectionUri())
  await runMigrations(db)
  return {
    db,
    sql,
    async stop() {
      await sql.end()
      await container.stop()
    },
  }
}

/** An empty, un-migrated database URL (for code that runs its own migrations). */
export async function withFreshDatabase() {
  const external = process.env.TEST_DATABASE_URL
  if (external) {
    const { url, drop } = await createFreshDatabase(external)
    return { url, stop: drop }
  }
  const image = process.env.TEST_POSTGRES_IMAGE ?? 'postgres:16-alpine'
  const container = await new PostgreSqlContainer(image).start()
  return {
    url: container.getConnectionUri(),
    async stop() {
      await container.stop()
    },
  }
}
