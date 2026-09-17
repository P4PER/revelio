// Slug to Title Case fallback for codes with no translation (death_eater -> Death Eater).
// Shared so the card page and the Discord embed print an untranslated sub-type alike.
export const humanize = (code: string): string =>
  code.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
