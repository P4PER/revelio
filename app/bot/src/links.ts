import { DEFAULT_LOCALE } from './i18n/locale'

// web/i18n/routing.ts uses localePrefix 'as-needed' with 'en' as the default,
// so English URLs carry no prefix and every other locale does.
function localeRoot(siteBase: string, locale: string): string {
  const base = siteBase.replace(/\/$/, '')
  return locale === DEFAULT_LOCALE ? base : `${base}/${locale}`
}

export function cardUrl(siteBase: string, id: string, locale: string): string {
  return `${localeRoot(siteBase, locale)}/card/${id}`
}

export function searchUrl(siteBase: string, query: string, locale: string): string {
  const params = new URLSearchParams({ q: query })
  return `${localeRoot(siteBase, locale)}/search?${params.toString()}`
}
