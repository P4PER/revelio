import { render } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import { ThemePreview } from '@/components/settings/theme-preview'

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
})
