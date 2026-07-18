import type { OwnershipFilter } from '@revelio/core'
import type { SearchOptions } from '@revelio/search'

const VALUES: OwnershipFilter[] = ['owned', 'missing', 'dupes']

export function parseOwnership(sp: URLSearchParams): OwnershipFilter | null {
  const v = sp.get('owned')
  return VALUES.includes(v as OwnershipFilter) ? (v as OwnershipFilter) : null
}

// A sentinel id that matches no card, so "owned" with an empty collection
// returns zero hits rather than silently dropping the filter (which would show
// everything). "missing" with nothing owned correctly excludes nothing.
const NONE = ' '

export function applyOwnership(
  options: SearchOptions,
  ownership: OwnershipFilter | null,
  ownedIds: string[],
  dupeIds: string[],
): SearchOptions {
  if (!ownership) return options
  const filters = { ...(options.filters ?? {}) }
  if (ownership === 'owned') filters.ids = ownedIds.length ? ownedIds : [NONE]
  else if (ownership === 'dupes') filters.ids = dupeIds.length ? dupeIds : [NONE]
  else if (ownership === 'missing') filters.excludeIds = ownedIds
  return { ...options, filters }
}
