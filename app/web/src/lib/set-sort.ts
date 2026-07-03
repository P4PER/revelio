import type { SetDTO } from '@revelio/core'

// releaseDate is a real date string ('YYYY-MM-DD', month-precision on day 01),
// so it sorts chronologically as-is; nulls last.
export function byReleaseDate(a: SetDTO, b: SetDTO): number {
  return (a.releaseDate ?? '9999-99-99').localeCompare(b.releaseDate ?? '9999-99-99')
}

// Display as numeric MM/YYYY (language-neutral).
export function formatReleaseMonth(date: string | null): string {
  if (!date) return '—'
  const m = /^(\d{4})-(\d{2})/.exec(date)
  return m ? `${m[2]}/${m[1]}` : date
}
