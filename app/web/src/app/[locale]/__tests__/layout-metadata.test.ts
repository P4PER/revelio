import { describe, it, expect } from 'vitest'
import { generateViewport } from '../layout'
import { THEME_COLOR, THEME_COLOR_LIGHT } from '@/lib/seo'

describe('root layout viewport', () => {
  it('pairs the browser theme color to the OS colour scheme', async () => {
    const viewport = await generateViewport()
    expect(viewport.themeColor).toEqual([
      { media: '(prefers-color-scheme: light)', color: THEME_COLOR_LIGHT },
      { media: '(prefers-color-scheme: dark)', color: THEME_COLOR },
    ])
  })
})
