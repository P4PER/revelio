// Mirrors web/i18n/routing.ts. Discord sends tags like 'en-US' or 'de'; Revelio
// indexes and message catalogs are keyed by the bare language.
export const LOCALES = ['en', 'de'] as const
export const DEFAULT_LOCALE = 'en'

export function toRevelioLocale(discordLocale: string | null | undefined): string {
  const base = (discordLocale ?? DEFAULT_LOCALE).split('-')[0].toLowerCase()
  return (LOCALES as readonly string[]).includes(base) ? base : DEFAULT_LOCALE
}
