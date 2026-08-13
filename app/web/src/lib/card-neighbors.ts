export type Neighbor = { id: string; href: string }
export type NeighborContext = { params: URLSearchParams; index: number }

// Read the search context off the card URL. Present only when the link came
// from a result grid (`i` = the hit's absolute index in the result set).
export function parseNeighborContext(sp: URLSearchParams): NeighborContext | null {
  const raw = sp.get('i')
  if (raw == null) return null
  const i = Number(raw)
  if (!Number.isInteger(i) || i < 0) return null
  return { params: sp, index: i }
}

// Turn a 3-wide (or 2-wide at the first index) window fetched at offset
// max(0, index-1) into prev/next. Returns null if the window's center is not
// the current card — the result list changed since the link was built.
export function neighborsFromWindow(
  hits: { id: string }[],
  currentId: string,
  index: number,
): { prevId: string | null; prevIndex: number; nextId: string | null; nextIndex: number } | null {
  const centerPos = index === 0 ? 0 : 1
  if (hits[centerPos]?.id !== currentId) return null
  const prev = centerPos > 0 ? hits[centerPos - 1] : null
  const next = hits[centerPos + 1] ?? null
  return {
    prevId: prev?.id ?? null, prevIndex: index - 1,
    nextId: next?.id ?? null, nextIndex: index + 1,
  }
}
