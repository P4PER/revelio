import en from './messages/en.json'
import de from './messages/de.json'

export type LabelScope =
  | 'types' | 'lessons' | 'rarities' | 'finishes' | 'legalities'
  // The deck sheet's own labels. They live here rather than in a consumer's
  // catalog because the render service resolves them from a locale: a label
  // passed in by a caller would be part of the request, and so part of the
  // cache key, and one catalog typo would fork the cache.
  | 'formats' | 'deckSheet' | 'deckGroups'

type Catalog = Record<string, Record<string, string>>
const MESSAGES: Record<string, Catalog> = { en: en as Catalog, de: de as Catalog }

// Attribute labels are keyed by the domain codes in attributes.ts, so they live here
// rather than in a consumer's message catalog: the web app and the Discord bot both
// render them. Kept as a plain function (not a next-intl hook) so it works in a server
// component, a client component and a plain Node process alike.
export function attrLabel(scope: LabelScope, code: string, locale: string): string {
  const catalog = MESSAGES[locale] ?? MESSAGES.en
  return catalog[scope]?.[code] ?? MESSAGES.en[scope]?.[code] ?? code
}
