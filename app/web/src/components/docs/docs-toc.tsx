import { useTranslations } from 'next-intl'
import { SquarePen } from 'lucide-react'
import type { TocEntry } from '@/lib/docs/types'

// `block` is load-bearing: an inline anchor paints its left border and padding
// on the first line only, so a heading long enough to wrap used to drop its
// wrapped lines back to the container edge, outside the rail.
//
// The two paddings are per context. This list is the desktop rail above 1180px
// and the mobile bar's contents popover below it, where a row is a touch target
// and needs the 44px the larger padding gives it.
const LINK =
  'block border-l-2 border-border py-2.5 pl-3 text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground min-[1180px]:py-1'

const EDIT_LINK =
  'flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground'

/** The page's own h2/h3 anchors, shared by the desktop rail and the mobile bar. */
export function TocLinks({ toc }: { toc: readonly TocEntry[] }) {
  return (
    <ul className="flex flex-col">
      {toc.map((entry) => (
        <li key={entry.id}>
          <a
            href={`#${entry.id}`}
            className={entry.depth === 3 ? `${LINK} pl-6 text-[0.8rem]` : LINK}
          >
            {entry.text}
          </a>
        </li>
      ))}
    </ul>
  )
}

export function EditPageLink({ href, className }: { href: string; className?: string }) {
  const t = useTranslations('docs')
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className ? `${EDIT_LINK} ${className}` : EDIT_LINK}
    >
      <SquarePen className="size-3.5" aria-hidden />
      {t('editPage')}
    </a>
  )
}

/**
 * The right rail: only the page being read, listing its own h2 and h3 anchors.
 * The left rail is the map of the whole section, so neither repeats the other.
 *
 * Renders nothing for a page with no headings rather than an empty landmark.
 */
export function DocsToc({ toc, editUrl }: { toc: readonly TocEntry[]; editUrl: string | null }) {
  const t = useTranslations('docs')
  if (toc.length === 0) return null

  return (
    <nav aria-label={t('onThisPage')} className="sticky top-8 self-start pb-10 pl-2 pr-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('onThisPage')}
      </p>
      <TocLinks toc={toc} />
      {editUrl && <EditPageLink href={editUrl} className="mt-6 border-t border-border pt-4" />}
    </nav>
  )
}
