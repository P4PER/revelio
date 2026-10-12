// Cuts to at most `max` UTF-16 units - what zod's .max counts - and trims what
// the cut leaves. Slicing by unit can halve a surrogate pair, and a lone high
// surrogate renders as tofu, so one left at the end goes too.
export function truncateUnits(value: string, max: number): string {
  return value.slice(0, max).replace(/[\uD800-\uDBFF]$/u, '').trim()
}
