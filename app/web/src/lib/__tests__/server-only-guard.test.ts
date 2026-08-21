import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, it, expect } from 'vitest'

// Modules that run only on the server: they hold secrets, open a DB or S3
// connection, read next/headers, or pull in a native Node addon. Importing any
// of them from a client component must fail the build, which is what the
// 'server-only' package does. This list is the contract; Task 2 replaces it
// with a read of the lib/server directory.
const SERVER_MODULES = [
  'account-codes.ts',
  'auth.ts',
  'collection-page-data.ts',
  'db.ts',
  'deck-og.ts',
  'rate-limit.ts',
  'reindex.ts',
  'require-user.ts',
  's3.ts',
  'search-client.ts',
  'session.ts',
  'settings-user.ts',
  'showcase.ts',
  'site-settings.ts',
  'subtype-labels.ts',
]

const libDir = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('server-only guard', () => {
  it.each(SERVER_MODULES)('%s imports server-only', (file) => {
    const source = readFileSync(join(libDir, file), 'utf8')
    expect(source).toMatch(/^import 'server-only'$/m)
  })
})
