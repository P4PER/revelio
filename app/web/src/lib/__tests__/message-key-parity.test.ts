import { describe, expect, it } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

// A key present in one catalogue but not the other renders as the raw key path
// for the locale that lacks it, so every namespace the UI reads has to exist in
// both. Namespaces below are rendered through createTranslator pinned to 'en'
// (see src/lib/email/otp-template.tsx) and are deliberately untranslated.
const ENGLISH_ONLY = ['email']

type Catalogue = Record<string, unknown>

function leafPaths(node: unknown, prefix = ''): string[] {
  if (typeof node !== 'object' || node === null) return [prefix]
  return Object.entries(node as Catalogue).flatMap(([key, value]) =>
    leafPaths(value, prefix ? `${prefix}.${key}` : key),
  )
}

function translatedPaths(catalogue: Catalogue): string[] {
  return leafPaths(catalogue)
    .filter((path) => !ENGLISH_ONLY.some((ns) => path === ns || path.startsWith(`${ns}.`)))
    .sort()
}

// Named ICU arguments: {count}, {from}, and the argument of a plural or select
// block. The '#' inside a plural branch is not an argument and has no name.
function placeholders(message: string): string[] {
  return [...message.matchAll(/\{\s*([A-Za-z0-9_]+)/g)].map((m) => m[1]).sort()
}

function messageAt(catalogue: Catalogue, path: string): string {
  return path.split('.').reduce<unknown>((node, key) => (node as Catalogue)[key], catalogue) as string
}

describe('message catalogue parity', () => {
  it('defines the same keys in English and German', () => {
    expect(translatedPaths(de)).toEqual(translatedPaths(en))
  })

  it('leaves the English-only namespaces out of the German catalogue', () => {
    for (const ns of ENGLISH_ONLY) {
      expect(ns in en).toBe(true)
      expect(ns in de).toBe(false)
    }
  })

  it('carries the same ICU arguments through both translations', () => {
    for (const path of translatedPaths(en)) {
      expect({ path, args: placeholders(messageAt(de, path)) }).toEqual({
        path,
        args: placeholders(messageAt(en, path)),
      })
    }
  })
})
