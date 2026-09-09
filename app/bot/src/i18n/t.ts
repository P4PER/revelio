import en from './en.json'
import de from './de.json'
import { DEFAULT_LOCALE } from './locale'

type Catalog = Record<string, string>
const CATALOGS: Record<string, Catalog> = { en, de }

// Flat keys, {name} placeholders. An unsupplied placeholder is left in place
// rather than rendered as "undefined", so a missing variable is obvious in the
// channel instead of silently reading as real copy.
export function t(
  locale: string,
  key: string,
  vars: Record<string, string | number> = {},
): string {
  const catalog = CATALOGS[locale] ?? CATALOGS[DEFAULT_LOCALE]
  const template = catalog[key] ?? CATALOGS[DEFAULT_LOCALE][key] ?? key
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  )
}
