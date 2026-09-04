/**
 * The record range one page of results covers, plus how many pages there are.
 * Shared by the result-count header and the pagination bar so the two lines
 * can never disagree about which records are on screen.
 *
 * An empty result set is a single page holding records 0 to 0, which callers
 * read as "no range to show".
 *
 * A page past the end - ?page=999 on a 26-page search - reports the last page
 * rather than an inverted range like 23953-604, since nothing upstream knows
 * the page count early enough to clamp the URL.
 */
export function pageRange(page: number, pageSize: number, total: number) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const clamped = Math.min(Math.max(page, 1), lastPage)
  return {
    from: total === 0 ? 0 : (clamped - 1) * pageSize + 1,
    to: Math.min(clamped * pageSize, total),
    lastPage,
    // The requested page pulled into range, so a readout can never say
    // "999 / 26" beside controls that already treat 26 as the last page.
    page: clamped,
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

/**
 * The page a request should land on when it asked for one past the end, or null
 * when the request was already in range. Callers redirect rather than render:
 * the page count needs the total, so an out-of-range URL can only be caught
 * after the query has run, and leaving it in place shows an empty grid under a
 * range the reader cannot see.
 */
export function overflowPage(page: number, pageSize: number, total: number): number | null {
  const { lastPage } = pageRange(page, pageSize, total)
  return page > lastPage ? lastPage : null
}
