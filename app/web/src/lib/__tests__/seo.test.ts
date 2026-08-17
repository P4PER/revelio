import { describe, it, expect } from 'vitest'
import {
  METADATA_BASE,
  THEME_COLOR,
  THEME_COLOR_LIGHT,
  OG_SIZE,
  OG_CONTENT_TYPE,
  buildSiteMetadata,
  setOgSubtitle,
  ogImageAlt,
  hasOgAltForAllLocales,
  ogImageMetadata,
  clampOgTitle,
} from '../seo'
import { routing } from '@/../i18n/routing'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

describe('seo helpers', () => {
  it('exposes the canonical origin as metadataBase', () => {
    expect(METADATA_BASE).toBeInstanceOf(URL)
    // SITE_URL defaults to https://revelio.cards in tests
    expect(METADATA_BASE.origin).toBe('https://revelio.cards')
  })

  it('uses the brand midnight as the theme color', () => {
    expect(THEME_COLOR).toBe('#13122A')
  })

  it('exposes the light theme color', () => {
    expect(THEME_COLOR_LIGHT).toBe('#FBF6EA')
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

  it('resolves the OG alt per locale from messages', () => {
    expect(ogImageAlt('en')).toBe(en.meta.ogImageAlt)
    expect(ogImageAlt('de')).toBe(de.meta.ogImageAlt)
    expect(ogImageAlt('en')).not.toBe(ogImageAlt('de'))
  })

  it('has an OG alt for every configured locale (no silent fallback)', () => {
    expect(hasOgAltForAllLocales()).toBe(true)
    for (const locale of routing.locales) {
      expect(ogImageAlt(locale)).toBeTruthy()
    }
  })

  it('builds the OG image metadata shape with the given alt', () => {
    expect(ogImageMetadata('Base')).toEqual([
      { id: 'og', alt: 'Base', size: OG_SIZE, contentType: OG_CONTENT_TYPE },
    ])
  })

  it('clamps only over-long titles, appending an ellipsis', () => {
    expect(clampOgTitle('Base Set')).toBe('Base Set')
    const long = 'A'.repeat(60)
    const clamped = clampOgTitle(long)
    expect(clamped.length).toBe(42)
    expect(clamped.endsWith('…')).toBe(true)
  })
})
