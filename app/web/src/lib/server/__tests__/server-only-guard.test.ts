import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { describe, it, expect } from 'vitest'

// Every module in lib/server runs only on the server: it holds secrets, opens a
// DB or S3 connection, reads next/headers, or pulls in a native Node addon.
// Importing one from a client component must fail the build, which is what the
// 'server-only' package does. Reading the directory rather than a fixed list
// means a module dropped in here without the guard fails this test.
const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..')

// Recursive so a module parked in a future subfolder (lib/server/db/client.ts)
// is covered too: a shallow read would skip it and still report green, leaving
// a hole exactly where the boundary needs one least. Type declarations carry no
// runtime import and tests are not shipped to the browser, so both are exempt.
function serverModules(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : serverModules(full)
    if (entry.name.endsWith('.d.ts')) return []
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [full] : []
  })
}

const modules = serverModules(serverDir).map((f) => relative(serverDir, f))

describe('lib/server', () => {
  it('is not empty', () => {
    // Guards against a broken path yielding zero files, which would leave the
    // it.each below vacuously green rather than failing.
    expect(modules.length).toBeGreaterThan(0)
  })

  // Quotes and semicolons are both live styles in this repo (the generated
  // components/ui files use double quotes) and neither changes what the import
  // does, so accept either rather than failing correctly guarded code.
  it.each(modules)('%s imports server-only', (file) => {
    const source = readFileSync(join(serverDir, file), 'utf8')
    expect(source).toMatch(/^import ["']server-only["'];?$/m)
  })
})
