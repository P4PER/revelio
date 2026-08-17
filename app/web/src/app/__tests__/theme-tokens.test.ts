import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it, expect, beforeAll } from 'vitest'

let css = ''
beforeAll(async () => {
  css = await readFile(resolve(process.cwd(), 'src/app/globals.css'), 'utf8')
})

/**
 * Declarations of the block whose opening selector matches `opener`.
 * The selector must be matched as a rule opener, NOT by plain substring search:
 * `@custom-variant dark` mentions both `:root` and `:root:not([data-theme='light'])`
 * inside `&:where(...)`, and it appears earlier in the file.
 */
function block(opener: RegExp): string {
  const m = css.match(opener)
  expect(m, `no rule opener matched ${opener}`).not.toBeNull()
  const open = css.indexOf('{', m!.index!)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i)
  }
  throw new Error(`unbalanced braces after ${opener}`)
}

const LIGHT_DEFAULTS = /^:root\s*\{/m
const OS_DARK = /^\s+:root:not\(\[data-theme='light'\]\)\s*\{/m
const EXPLICIT_DARK = /^:root\[data-theme='dark'\]\s*\{/m

/** Token names assigned in a block, e.g. `--background` from `--background: var(...)`. */
function assigned(source: string): string[] {
  return [...source.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]).sort()
}

/** The alias names: everything except the value sets and the non-colour --radius. */
function aliases(source: string): string[] {
  return assigned(source).filter(
    (t) => !t.startsWith('--light-') && !t.startsWith('--dark-') && t !== '--radius',
  )
}

describe('theme tokens', () => {
  it('declares a --dark-* counterpart for every --light-* value', () => {
    const root = block(LIGHT_DEFAULTS)
    const light = assigned(root).filter((t) => t.startsWith('--light-'))
    const dark = assigned(root).filter((t) => t.startsWith('--dark-'))
    expect(light.length).toBeGreaterThan(20)
    expect(light.map((t) => t.replace('--light-', ''))).toEqual(
      dark.map((t) => t.replace('--dark-', '')),
    )
  })

  it('aliases the same token names in the light default and both dark blocks', () => {
    const osDark = aliases(block(OS_DARK))
    const explicitDark = aliases(block(EXPLICIT_DARK))
    expect(osDark.length).toBeGreaterThan(20)
    expect(osDark).toEqual(explicitDark)
    expect(aliases(block(LIGHT_DEFAULTS))).toEqual(osDark)
  })

  it('resolves every alias through a --light-*/--dark-* value, never a raw hex', () => {
    expect(block(EXPLICIT_DARK)).not.toMatch(/:\s*#[0-9a-f]{3,8}/i)
    expect(block(OS_DARK)).not.toMatch(/:\s*#[0-9a-f]{3,8}/i)
  })
})
