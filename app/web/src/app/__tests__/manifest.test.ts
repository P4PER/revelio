import { describe, it, expect } from 'vitest'
import manifest from '../manifest'
import { THEME_COLOR_LIGHT } from '@/lib/seo'
import en from '@/../messages/en.json'

describe('web app manifest', () => {
  const m = manifest()

  it('names the app Revelio and runs standalone', () => {
    expect(m.name).toBe('Revelio')
    expect(m.short_name).toBe('Revelio')
    expect(m.display).toBe('standalone')
    expect(m.start_url).toBe('/')
    expect(m.id).toBe('/')
  })

  it('reuses the English meta description', () => {
    expect(m.description).toBe(en.meta.description)
  })

  // The manifest has no media query, so it follows the CSS default (light)
  // rather than pinning every installer to the midnight splash.
  it('uses the default light palette for theme and background', () => {
    expect(m.theme_color).toBe(THEME_COLOR_LIGHT)
    expect(m.background_color).toBe(THEME_COLOR_LIGHT)
  })

  it('ships 192 and 512 png icons', () => {
    const sizes = (m.icons ?? []).map((i) => i.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
    for (const icon of m.icons ?? []) {
      expect(icon.type).toBe('image/png')
      expect(icon.src.startsWith('/')).toBe(true)
    }
  })
})
