import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import { ThemePreview } from '@/components/settings/theme-preview'

// Read off this file's own location rather than the cwd, so the test does not
// depend on which directory vitest was launched from. Note fileURLToPath on the
// string: jsdom replaces the global URL class, and node:fs rejects those.
const GLOBALS_CSS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../app/globals.css'),
  'utf8',
)

afterEach(() => {
  delete document.documentElement.dataset.theme
})

describe('ThemePreview', () => {
  // The load-bearing constraint: a light swatch has to stay light while the
  // page is dark, or all three tiles render the same and the tile is pointless.
  it('paints from the fixed value sets, not the live theme aliases', () => {
    document.documentElement.dataset.theme = 'dark'
    const { container } = render(<ThemePreview choice="light" />)
    const pane = container.querySelector('[data-tone="light"]') as HTMLElement
    expect(pane.style.getPropertyValue('--p-bg')).toBe('var(--light-background)')
    expect(pane.style.getPropertyValue('--p-card')).toBe('var(--light-card)')
  })

  it('paints the dark preview from the dark value set', () => {
    const { container } = render(<ThemePreview choice="dark" />)
    const pane = container.querySelector('[data-tone="dark"]') as HTMLElement
    expect(pane.style.getPropertyValue('--p-bg')).toBe('var(--dark-background)')
  })

  // "Follow your device setting" means both, so the system tile shows both.
  it('renders both tones for system, with the dark half clipped', () => {
    const { container } = render(<ThemePreview choice="system" />)
    expect(container.querySelector('[data-tone="light"]')).not.toBeNull()
    const dark = container.querySelector('[data-tone="dark"]') as HTMLElement
    expect(dark.style.clipPath).toContain('polygon')
  })

  it('is hidden from assistive tech, so it cannot leak into a radio name', () => {
    const { container } = render(<ThemePreview choice="dark" />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  })

  // jsdom resolves no CSS, so the assertions above would still pass if a
  // --light-*/--dark-* name were misspelled or renamed out from under us; the
  // swatch would just paint transparent in the browser. Check the names the
  // panes actually reference against the file that declares them.
  it('references only value-set variables that globals.css declares', () => {
    const { container } = render(<ThemePreview choice="system" />)
    const panes = container.querySelectorAll('[data-tone]')
    expect(panes).toHaveLength(2)

    const referenced = new Set<string>()
    for (const pane of panes) {
      for (const [, name] of (pane.getAttribute('style') ?? '').matchAll(/var\((--[\w-]+)\)/g)) {
        referenced.add(name)
      }
    }
    expect(referenced.size).toBeGreaterThan(0)

    const undeclared = [...referenced].filter(
      (name) => !new RegExp(`^\\s*${name}:`, 'm').test(GLOBALS_CSS),
    )
    expect(undeclared).toEqual([])
  })
})
