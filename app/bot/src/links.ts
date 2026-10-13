import { DEFAULT_LOCALE } from './i18n/locale'

export type SearchLinkFilters = {
  lesson?: string | null
  type?: string | null
  set?: string | null
  sort?: 'number' | 'name' | null
}

// What a bot browser or a shared list searched for.
export type BrowseSearch = {
  query: string
  lesson: string | null
  type: string | null
  set: string | null
}

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
// web/src/lib/search-params.ts reads `lesson` and `type` as repeatable params,
// and `set` as a single one.
export function searchUrl(
  siteBase: string,
  query: string,
  locale: string,
  filters: SearchLinkFilters = {},
): string {
  const params = new URLSearchParams({ q: query })
  if (filters.lesson) params.append('lesson', filters.lesson)
  if (filters.type) params.append('type', filters.type)
  if (filters.set) params.set('set', filters.set)
  if (filters.sort) params.set('sort', filters.sort)
  return `${localeRoot(siteBase, locale)}/search?${params.toString()}`
}

export function deckUrl(siteBase: string, id: string, locale: string): string {
  return `${localeRoot(siteBase, locale)}/decks/${id}`
}

export function settingsUrl(siteBase: string, locale: string): string {
  return `${localeRoot(siteBase, locale)}/settings/connections`
}

export function newDeckUrl(siteBase: string, locale: string): string {
  return `${localeRoot(siteBase, locale)}/decks/new`
}

// The site's view of a bot search, in the order the bot listed it: relevance
// for a query, else card number within a set, else name (data/cards.ts).
export function browseUrl(siteBase: string, search: BrowseSearch, locale: string): string {
  const sort = search.query ? null : search.set ? 'number' : 'name'
  return searchUrl(siteBase, search.query, locale, {
    lesson: search.lesson, type: search.type, set: search.set, sort,
  })
}
