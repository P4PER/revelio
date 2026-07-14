import { withParams } from '@/lib/search-params'
import { PaginationNav } from '@/components/pagination-nav'

export function Pagination({
  page, total, hitsPerPage, current, basePath = '/search',
}: {
  page: number; total: number; hitsPerPage: number; current: URLSearchParams; basePath?: string
}) {
  const lastPage = Math.max(1, Math.ceil(total / hitsPerPage))
  const href = (p: number) => `${basePath}?${withParams(current, { page: String(p) }).toString()}`
  return (
    <PaginationNav
      page={page}
      lastPage={lastPage}
      className="mt-8"
      prevHref={href(page - 1)}
      nextHref={href(page + 1)}
    />
  )
}
