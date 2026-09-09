import en from './messages/en.json'
import de from './messages/de.json'

export type LabelScope = 'types' | 'lessons' | 'rarities' | 'finishes' | 'legalities'

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
