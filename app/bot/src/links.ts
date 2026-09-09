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

// The filters the embed was built with travel with the link, so "view all on
// revelio.cards" lands on the same result set the user is looking at.
// web/src/lib/search-params.ts reads `lesson` and `type` as repeatable params.
export type SearchLinkFilters = { lesson?: string | null; type?: string | null }

export function searchUrl(
  siteBase: string,
  query: string,
  locale: string,
  filters: SearchLinkFilters = {},
): string {
  const params = new URLSearchParams({ q: query })
  if (filters.lesson) params.append('lesson', filters.lesson)
  if (filters.type) params.append('type', filters.type)
  return `${localeRoot(siteBase, locale)}/search?${params.toString()}`
}
