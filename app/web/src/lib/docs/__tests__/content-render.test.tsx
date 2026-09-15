import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import type { MDXComponents } from 'mdx/types'
import { NextIntlClientProvider } from 'next-intl'
import type { ComponentType } from 'react'
import { describe, it, expect } from 'vitest'
import { BOT_COMMANDS } from '@revelio/core'
import en from '@/../messages/en.json'
import { DOCS_NAV, docId } from '@/lib/docs/nav'
import { loadDoc } from '@/lib/docs/registry'
import { useMDXComponents } from '@/mdx-components'

const CONTENT = join(process.cwd(), 'content/docs')
const slugs = DOCS_NAV.flatMap((section) => section.pages)

function source(slug: (typeof slugs)[number], locale: 'en' | 'de'): string {
  return readFileSync(join(CONTENT, `${docId(slug)}.${locale}.mdx`), 'utf8')
}

// useMDXComponents is a hook by name only, but calling it outside a component
// is still a lint error - and rendering through it is the point, since that is
// the map the App Router hands every compiled page.
function Page({ Component }: { Component: ComponentType<{ components?: MDXComponents }> }) {
  return <Component components={useMDXComponents({})} />
}

// A content file is never type-checked: tsc does not see content/**/*.mdx, so
// `<CommandTable name="mydeck" />` compiles, renders null, and silently removes
// a whole reference table from a published page.
describe('every CommandTable in the content names a real command', () => {
  const names = BOT_COMMANDS.map((command) => command.name)
  it.each(slugs.flatMap((slug) => (['en', 'de'] as const).map((l) => [slug, l] as const)))(
    '%s.%s',
    (slug, locale) => {
      for (const [, name] of source(slug, locale).matchAll(/<CommandTable name="([^"]*)"/g)) {
        expect(names, `${docId(slug)}.${locale}.mdx`).toContain(name)
      }
    },
  )
})

describe('the commands page renders through the real component map', () => {
  it('draws a table for every command the page references', async () => {
    const { default: Component } = await loadDoc('discord/commands', 'en')
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <Page Component={Component} />
      </NextIntlClientProvider>,
    )

    const referenced = [...source('discord/commands', 'en').matchAll(/<CommandTable name="([^"]*)"/g)]
    expect(referenced.length).toBeGreaterThan(0)
    for (const [, name] of referenced) {
      // getAllBy: a command named in a table is often also shown as an
      // invocation example further down the same page.
      expect(screen.getAllByText(`/${name}`).length, name).toBeGreaterThan(0)
    }
    // The other two MDX-only components are on the same page, so this covers
    // the whole provider chain in one render.
    expect(screen.getByRole('note')).toBeInTheDocument()
    expect(screen.getByText('Takes no options.')).toBeInTheDocument()
  })
})
