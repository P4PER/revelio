import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

type LabelScope = 'types' | 'lessons' | 'rarities' | 'finishes' | 'legalities'
type Catalog = { attributes?: Record<string, Record<string, string>> }
const MESSAGES: Record<string, Catalog> = { en: en as Catalog, de: de as Catalog }

// Attribute labels live in the next-intl message catalog, keyed by code. Kept as a
// plain function (not the useTranslations hook) so it works in both server and
// client components, which pass `locale` explicitly.
export function attrLabel(scope: LabelScope, code: string, locale: string): string {
  const catalog = MESSAGES[locale] ?? MESSAGES.en
  return catalog.attributes?.[scope]?.[code]
    ?? MESSAGES.en.attributes?.[scope]?.[code]
    ?? code
}
