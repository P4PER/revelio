import { Link } from '@/../i18n/navigation'
import { withParams } from '@/lib/search-params'

export function Pagination({
  page,
  total,
  hitsPerPage,
  current,
}: {
  page: number
  total: number
  hitsPerPage: number
  current: URLSearchParams
}) {
  const lastPage = Math.max(1, Math.ceil(total / hitsPerPage))
  if (lastPage <= 1) return null
  const href = (p: number) => `/search?${withParams(current, { page: String(p) }).toString()}`
  return (
    <nav className="mt-8 flex items-center justify-center gap-4 text-sm" aria-label="Pagination">
      {page > 1 && <Link href={href(page - 1)}>← Prev</Link>}
      <span className="text-muted-foreground">
        Page {page} of {lastPage}
      </span>
      {page < lastPage && <Link href={href(page + 1)}>Next →</Link>}
    </nav>
  )
}
