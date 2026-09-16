import { createElement, Fragment, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { MDXContent } from 'mdx/types'
import { describe, it, expect, vi } from 'vitest'

// legal-mdx imports next-intl's navigation Link, which needs the Next router
// that jsdom lacks. The recorders below replace every component that matters.
vi.mock('@/../i18n/navigation', () => ({ Link: () => null }))

import { LEGAL_COMPONENTS } from '@/components/legal/legal-mdx'
import { LEGAL_DOCUMENTS } from '@/lib/legal/documents'

type ComponentCall = [name: string, props: Record<string, unknown>]

const names = Object.keys(LEGAL_DOCUMENTS) as (keyof typeof LEGAL_DOCUMENTS)[]

// Every setting a legal page passes in, each set to its own name, so a
// recorded prop says which setting a document wired where.
const SETTING_PROPS = Object.fromEntries(
  ['operatorName', 'operatorAddress', 'contactEmail', 'hostingProvider', 'responsiblePerson'].map((key) => [key, key]),
)

// Renders a document with each custom component (the capitalized entries of
// LEGAL_COMPONENTS) swapped for a recorder, and returns the calls in order.
// Recorders render their children, so a component nested in <WhenSet> counts.
function componentCalls(Document: MDXContent): ComponentCall[] {
  const calls: ComponentCall[] = []
  const recorders = Object.fromEntries(
    Object.keys(LEGAL_COMPONENTS)
      .filter((name) => /^[A-Z]/.test(name))
      .map((name) => [
        name,
        ({ children, ...props }: { children?: ReactNode }) => {
          calls.push([name, props])
          return createElement(Fragment, null, children)
        },
      ]),
  )
  renderToStaticMarkup(createElement(Document, { components: recorders, ...SETTING_PROPS }))
  return calls
}

// The registry's `satisfies` clause proves a German file exists. It cannot
// prove the German file still says the same things: a heading, a site setting
// or a deep-link anchor dropped in translation leaves a legal page that looks
// complete and is not.
describe('legal documents have the same shape in both locales', () => {
  it.each(names)('%s has the same heading shape in en and de', async (name) => {
    const [en, de] = await Promise.all([LEGAL_DOCUMENTS[name].en(), LEGAL_DOCUMENTS[name].de()])
    expect(en.toc.length).toBeGreaterThan(0)
    expect(de.toc.map((entry) => entry.depth)).toEqual(en.toc.map((entry) => entry.depth))
  })

  it.each(names)('%s uses the same components with the same props in en and de', async (name) => {
    const [en, de] = await Promise.all([LEGAL_DOCUMENTS[name].en(), LEGAL_DOCUMENTS[name].de()])
    const enCalls = componentCalls(en.default)
    expect(enCalls.length).toBeGreaterThan(0)
    expect(componentCalls(de.default)).toEqual(enCalls)
  })

  // LastUpdated parses its date as UTC midnight; anything else renders
  // "Invalid Date" or a day off.
  it.each(names)('%s dates itself as YYYY-MM-DD', async (name) => {
    const { default: Document } = await LEGAL_DOCUMENTS[name].en()
    for (const [component, props] of componentCalls(Document)) {
      if (component === 'LastUpdated') expect(props.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})
