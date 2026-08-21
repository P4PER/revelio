import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, it, expect } from 'vitest'

// Every module in lib/server runs only on the server: it holds secrets, opens a
// DB or S3 connection, reads next/headers, or pulls in a native Node addon.
// Importing one from a client component must fail the build, which is what the
// 'server-only' package does. Reading the directory rather than a fixed list
// means a module dropped in here without the guard fails this test.
const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const modules = readdirSync(serverDir).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))

describe('lib/server', () => {
  it('is not empty', () => {
    expect(modules.length).toBe(15)
  })

  it.each(modules)('%s imports server-only', (file) => {
    const source = readFileSync(join(serverDir, file), 'utf8')
    expect(source).toMatch(/^import 'server-only'$/m)
  })
})
