import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ComponentType, ReactNode } from 'react'
import { useMDXComponents } from '@/mdx-components'

// Not a hook despite the name - it is the export name Next's MDX convention
// requires, and it is a plain factory that reads no React state.
// eslint-disable-next-line react-hooks/rules-of-hooks -- factory, not a hook
const components = useMDXComponents({})

function renderTag(tag: string, children: ReactNode) {
  const Component = components[tag as keyof typeof components] as ComponentType<{
    children: ReactNode
  }>
  return render(<Component>{children}</Component>)
}

describe('useMDXComponents', () => {
  it('maps every element a docs page uses', () => {
    for (const tag of ['h2', 'h3', 'p', 'a', 'code', 'pre', 'ul', 'ol', 'li', 'table']) {
      expect(components).toHaveProperty(tag)
    }
  })

  // The right rail links to headings by id, and rehype-slug puts the id on the
  // rendered element, so the component must not drop unknown props.
  it('keeps the id rehype-slug puts on a heading', () => {
    const Heading = components.h2 as ComponentType<{ id?: string; children: ReactNode }>
    const { container } = render(<Heading id="limits">Limits</Heading>)
    expect(container.querySelector('h2')?.id).toBe('limits')
  })

  // A long option table must scroll inside its own box; the reading column
  // itself must never scroll sideways.
  it('wraps a table in a horizontally scrollable container', () => {
    const { container } = renderTag(
      'table',
      <tbody>
        <tr>
          <td>cell</td>
        </tr>
      </tbody>,
    )
    expect(container.querySelector('.overflow-x-auto')).not.toBeNull()
  })

  it('renders body copy in the muted foreground, not the heading colour', () => {
    renderTag('p', 'Body copy.')
    expect(screen.getByText('Body copy.').className).toContain('text-muted-foreground')
  })

  // Routing is localePrefix 'as-needed', so a bare <a href="/discord"> sends a
  // German reader to the English page and lets the proxy reset their locale.
  // Internal routes must go through next-intl's Link; anchors and external
  // URLs must not, since Link would try to localize them.
  it('routes internal links through next-intl and leaves the rest alone', () => {
    const Anchor = components.a as ComponentType<{ href: string; children: ReactNode }>

    // Rendered as a German reader sees it: the prefix is what Link adds and a
    // bare <a> does not.
    const inDe = (href: string) =>
      render(
        <NextIntlClientProvider locale="de" messages={{}}>
          <Anchor href={href}>link</Anchor>
        </NextIntlClientProvider>,
      ).container.querySelector('a')

    expect(inDe('/discord')?.getAttribute('href')).toBe('/de/discord')
    expect(inDe('#limits')?.getAttribute('href')).toBe('#limits')
    expect(inDe('https://discord.com/')?.getAttribute('href')).toBe('https://discord.com/')
  })

  // MDX renders a fenced block as <pre><code class="language-x">. The inline
  // chrome must stay off it, and rehype's language class must survive so
  // syntax highlighting stays possible.
  it('keeps inline chrome off a fenced code block and preserves its language class', () => {
    const Code = components.code as ComponentType<{ className?: string; children: ReactNode }>
    const { container } = render(<Code className="language-bash">npm test</Code>)
    const code = container.querySelector('code')
    expect(code?.className).toContain('language-bash')
    expect(code?.className).not.toContain('bg-muted')
  })

  it('scrolls a code block inside its own box, not the page body', () => {
    const { container } = renderTag('pre', <code>a very long command</code>)
    expect(container.querySelector('pre')?.className).toContain('overflow-x-auto')
  })

  // Gold at full strength fails AA as text in light theme; primary-ink is the
  // token that passes. See the light-mode design spec.
  it('uses primary-ink for links and inline code, never bare primary', () => {
    const { container: link } = renderTag('a', 'a link')
    expect(link.querySelector('a')?.className).toContain('text-primary-ink')

    const { container: code } = renderTag('code', 'npm test')
    expect(code.querySelector('code')?.className).toContain('text-primary-ink')
  })
})
