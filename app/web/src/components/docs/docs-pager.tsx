import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from '@/../i18n/navigation'
import { docId, type DocNeighbours } from '@/lib/docs/nav'
import type { DocSlug } from '@/lib/docs/types'

type PagerCardProps = {
  slug: DocSlug
  direction: 'previous' | 'next'
}

const CARD =
  'group flex items-center gap-3 rounded-lg border border-border px-4 py-3 transition-colors hover:border-primary-ink/60 hover:bg-muted'

function PagerCard({ slug, direction }: PagerCardProps) {
  const t = useTranslations('docs')
  const label = t(`pager.${direction}`)
  const title = t(`pages.${docId(slug)}.title`)
  const isNext = direction === 'next'
  const Chevron = isNext ? ChevronRight : ChevronLeft

  return (
    <Link
      href={`/docs/${slug}`}
      className={isNext ? `${CARD} justify-end text-right sm:col-start-2` : CARD}
    >
      {!isNext && <Chevron className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
      <span className="flex min-w-0 flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        {/* Name computations differ on whether two stacked spans get a space
            between them; one that does not reads "NextAccount linking". A
            flex container drops whitespace-only text from layout, so this
            costs nothing on screen, and the name stays the visible text rather
            than an aria-label that could drift from it (WCAG 2.5.3). jsdom
            always inserts the space, so no unit test can hold this line. */}{' '}
        <span className="text-sm font-semibold text-foreground group-hover:text-primary-ink">
          {title}
        </span>
      </span>
      {isNext && <Chevron className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
    </Link>
  )
}

/**
 * Previous/next links at the foot of a docs page, in DOCS_NAV reading order.
 * Sync and prop-driven, like DocsToc, so it renders in a test tree as well as
 * on the server. A lone Next card keeps to the right column, where a reader
 * expects forward to be.
 *
 * Renders nothing when there is no neighbour rather than an empty landmark.
 */
export function DocsPager({ prev, next }: DocNeighbours) {
  const t = useTranslations('docs')
  if (!prev && !next) return null

  return (
    <nav aria-label={t('pager.label')} className="grid gap-3 sm:grid-cols-2">
      {prev && <PagerCard slug={prev} direction="previous" />}
      {next && <PagerCard slug={next} direction="next" />}
    </nav>
  )
}
