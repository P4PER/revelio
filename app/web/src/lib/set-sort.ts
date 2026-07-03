import type { SetDTO } from '@revelio/core'

// Sets store releaseDate as "MM-YYYY" (e.g. "08-2001"), which sorts by month
// lexically. Convert to "YYYY-MM" so ordering is chronological (nulls last).
export function releaseKey(date: string | null): string {
  if (!date) return '9999-99'
  const m = /^(\d{2})-(\d{4})$/.exec(date)
  return m ? `${m[2]}-${m[1]}` : date
}

export function byReleaseDate(a: SetDTO, b: SetDTO): number {
  return releaseKey(a.releaseDate).localeCompare(releaseKey(b.releaseDate))
}
