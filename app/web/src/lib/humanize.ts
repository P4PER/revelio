// Slug → Title Case fallback for codes with no translation (death_eater -> Death Eater).
export const humanize = (code: string): string =>
  code.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
