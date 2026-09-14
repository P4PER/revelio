import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
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
    for (const tag of ['h2', 'h3', 'p', 'a', 'code', 'ul', 'ol', 'li', 'table']) {
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

  // Gold at full strength fails AA as text in light theme; primary-ink is the
  // token that passes. See the light-mode design spec.
  it('uses primary-ink for links and inline code, never bare primary', () => {
    const { container: link } = renderTag('a', 'a link')
    expect(link.querySelector('a')?.className).toContain('text-primary-ink')

    const { container: code } = renderTag('code', 'npm test')
    expect(code.querySelector('code')?.className).toContain('text-primary-ink')
  })
})
