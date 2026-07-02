import { Link } from '@/../i18n/navigation'
import { withParams } from '@/lib/search-params'
import { Button } from '@/components/ui/button'

export function Pagination({
  page, total, hitsPerPage, current, basePath = '/search',
}: {
  page: number; total: number; hitsPerPage: number; current: URLSearchParams; basePath?: string
}) {
  const lastPage = Math.max(1, Math.ceil(total / hitsPerPage))
  if (lastPage <= 1) return null
  const href = (p: number) => `${basePath}?${withParams(current, { page: String(p) }).toString()}`
  return (
    <nav className="mt-8 flex items-center justify-center gap-4 text-sm" aria-label="Pagination">
      {page > 1 && <Button variant="outline" size="sm" asChild><Link href={href(page - 1)}>← Prev</Link></Button>}
      <span className="text-muted-foreground">Page {page} of {lastPage}</span>
      {page < lastPage && <Button variant="outline" size="sm" asChild><Link href={href(page + 1)}>Next →</Link></Button>}
    </nav>
  )
}
