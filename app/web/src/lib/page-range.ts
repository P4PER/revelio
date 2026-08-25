/**
 * The record range one page of results covers, plus how many pages there are.
 * Shared by the result-count header and the pagination bar so the two lines
 * can never disagree about which records are on screen.
 *
 * An empty result set is a single page holding records 0 to 0, which callers
 * read as "no range to show".
 */
export function pageRange(page: number, pageSize: number, total: number) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  return {
    from: total === 0 ? 0 : (page - 1) * pageSize + 1,
    to: Math.min(page * pageSize, total),
    lastPage,
  }
}

/**
 * Which of a list's two count messages to render, and with what values: the
 * range while the results run past one page, the plain total once they fit on
 * one - the same threshold the pagination bar uses to hide itself, so a short
 * list never carries a range with no pagination under it.
 */
export function countMessage(
  page: number, pageSize: number, total: number,
): { ranged: boolean; values: Record<string, number> } {
  const { from, to, lastPage } = pageRange(page, pageSize, total)
  return lastPage > 1
    ? { ranged: true, values: { from, to, total } }
    : { ranged: false, values: { count: total } }
}
