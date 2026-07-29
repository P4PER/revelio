import { describe, it, expect } from 'vitest'
import {
  METADATA_BASE,
  THEME_COLOR,
  OG_SIZE,
  OG_CONTENT_TYPE,
  buildSiteMetadata,
  setOgSubtitle,
} from '../seo'

describe('seo helpers', () => {
  it('exposes the canonical origin as metadataBase', () => {
    expect(METADATA_BASE).toBeInstanceOf(URL)
    // SITE_URL defaults to https://revelio.cards in tests
    expect(METADATA_BASE.origin).toBe('https://revelio.cards')
  })

  it('uses the brand midnight as the theme color', () => {
    expect(THEME_COLOR).toBe('#13122A')
  })

  it('uses the standard 1200x630 PNG social card', () => {
    expect(OG_SIZE).toEqual({ width: 1200, height: 630 })
    expect(OG_CONTENT_TYPE).toBe('image/png')
  })

  it('builds site metadata with base, OG website + twitter card', () => {
    const meta = buildSiteMetadata({ locale: 'en', description: 'A test description.' })
    expect(meta.metadataBase).toBe(METADATA_BASE)
    expect(meta.description).toBe('A test description.')
    // title is a template so per-page titles render as "Card · Revelio"
    expect(meta.title).toEqual({ default: 'Revelio', template: '%s · Revelio' })
    expect(meta.openGraph).toMatchObject({
      type: 'website',
      siteName: 'Revelio',
      locale: 'en',
      description: 'A test description.',
    })
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image', description: 'A test description.' })
  })

  it('joins a set code with a localized card-count label', () => {
    expect(setOgSubtitle('BASE', '116 cards')).toBe('BASE · 116 cards')
    expect(setOgSubtitle('PROMO', '1 Karte')).toBe('PROMO · 1 Karte')
  })
})
