import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// core's schemas are composed into web's and the bot's z.object()s, so every
// workspace must resolve the same zod. shadcn pins zod 3, and without the
// root devDependency in app/package.json npm hoists 3.x and nests a 4.x
// under each workspace: nothing else fails, but two copies ship.
const WORKSPACES = ['core', 'web', 'bot', 'sheet']

const appRoot = fileURLToPath(new URL('../../', import.meta.url))
const resolveZod = (ws: string) =>
  createRequire(`${appRoot}${ws}/package.json`).resolve('zod/package.json')

describe('zod installation', () => {
  it('resolves one zod 4 copy, hoisted to the root, from every workspace', () => {
    const paths = WORKSPACES.map(resolveZod)
    expect(new Set(paths).size).toBe(1)
    expect(paths[0]).toBe(`${appRoot}node_modules/zod/package.json`)
    const { version } = createRequire(import.meta.url)(paths[0]) as { version: string }
    expect(version).toMatch(/^4\./)
  })
})
