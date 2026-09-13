import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const registerSrc = readFileSync(
  fileURLToPath(new URL('../src/discord/register.ts', import.meta.url)),
  'utf8',
)

describe('register.ts module shape', () => {
  // main.ts imports registerCommands, so esbuild inlines this whole file into the bot bundle.
  // Inside a bundle, import.meta.url and process.argv[1] both point at the bundle, so an
  // argv-based "am I the entry script?" guard fires and exits the process before main() runs.
  it('has no entry-script guard that a bundle would mistake for the entrypoint', () => {
    expect(registerSrc).not.toContain('process.argv')
  })

  it('does not exit the process at module scope', () => {
    expect(registerSrc).not.toContain('process.exit')
  })
})
