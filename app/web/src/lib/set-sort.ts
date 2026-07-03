import type { SetDTO } from '@revelio/core'

// releaseDate may be a real date ('YYYY-MM-DD') or legacy text ('MM-YYYY').
// Normalize to a sortable 'YYYY-MM' key (nulls last).
export function releaseKey(date: string | null): string {
  if (!date) return '9999-99'
  let m = /^(\d{4})-(\d{2})/.exec(date) // YYYY-MM(-DD)
  if (m) return `${m[1]}-${m[2]}`
  m = /^(\d{2})-(\d{4})$/.exec(date) // MM-YYYY
  if (m) return `${m[2]}-${m[1]}`
  return date
}

export function byReleaseDate(a: SetDTO, b: SetDTO): number {
  return releaseKey(a.releaseDate).localeCompare(releaseKey(b.releaseDate))
}

// Display as numeric MM/YYYY (language-neutral), from either format.
export function formatReleaseMonth(date: string | null): string {
  if (!date) return '—'
  let m = /^(\d{4})-(\d{2})/.exec(date) // YYYY-MM(-DD) -> MM/YYYY
  if (m) return `${m[2]}/${m[1]}`
  m = /^(\d{2})-(\d{4})$/.exec(date) // MM-YYYY -> MM/YYYY
  if (m) return `${m[1]}/${m[2]}`
  return date
}
