// Largest-fitting-unit relative time via Intl. `now` is injectable for tests.
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
  ['second', 1],
]

export function formatRelativeTime(iso: string, locale: string, now: number = Date.now()): string {
  const diffSec = Math.round((new Date(iso).getTime() - now) / 1000) // negative = past
  const abs = Math.abs(diffSec)
  // 'always' keeps numeric output ("2 days ago" / "vor 2 Tagen") rather than
  // words like "yesterday"/"vorgestern".
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always' })
  for (const [unit, sec] of UNITS) {
    if (abs >= sec || unit === 'second') return rtf.format(Math.round(diffSec / sec), unit)
  }
  return rtf.format(0, 'second')
}
