import { vi } from 'vitest'
import type { MeiliSearch } from 'meilisearch'

// The stub honours attributesToRetrieve the way Meilisearch does. Handing back
// whole fixtures regardless would let a caller narrow its projection and still
// look correct here, while the real server sent the renderer nothing.
// A relevance read leaves as a federated multi-search: a name-only query weighted
// against the unrestricted one. The stub cannot rank, so it runs only the unrestricted
// query - the one a federated read draws its full hit list from - through the same
// `index` and `search` mocks, with the federated window folded back in. Routing it
// through `index` matters: the index uid rides inside the sub-query rather than in an
// `index()` call, and a test that asserts which locale index was read must hold
// whichever transport the read used.
export function federatedToSearch(index: (uid: string) => { search: ReturnType<typeof vi.fn> }) {
  return async (req: {
    federation: Record<string, unknown>
    queries: Record<string, unknown>[]
  }) => {
    const { indexUid, q, federationOptions: _opts, ...rest } =
      req.queries[req.queries.length - 1] as Record<string, unknown> & {
        indexUid: string
        q: string
      }
    return index(indexUid).search(q, { ...rest, ...req.federation })
  }
}

export function stubMeili(hits: unknown[], estimatedTotalHits: number) {
  const search = vi.fn().mockImplementation(
    async (_query: string, opts: { attributesToRetrieve?: string[] } = {}) => {
      const keep = opts.attributesToRetrieve
      if (!keep) return { hits, estimatedTotalHits }
      const projected = hits.map((hit) => Object.fromEntries(
        Object.entries(hit as Record<string, unknown>).filter(([key]) => keep.includes(key)),
      ))
      return { hits: projected, estimatedTotalHits }
    },
  )
  const index = vi.fn().mockReturnValue({ search })
  const multiSearch = vi.fn().mockImplementation(federatedToSearch(index))
  return { client: { index, multiSearch } as unknown as MeiliSearch, index, search, multiSearch }
}
