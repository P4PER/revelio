import { describe, it, expect } from 'vitest'
import { viewport } from '../layout'
import { THEME_COLOR } from '@/lib/seo'

describe('root layout viewport', () => {
  it('sets the browser theme color to the brand midnight', () => {
    expect(viewport.themeColor).toBe(THEME_COLOR)
  })
})
