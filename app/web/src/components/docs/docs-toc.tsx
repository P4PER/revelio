import { useTranslations } from 'next-intl'
import { SquarePen } from 'lucide-react'
import type { TocEntry } from '@/lib/docs/types'

const LINK =
  'border-l-2 border-border py-1 pl-3 text-sm text-muted-foreground transition-colors hover:text-foreground'

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
      {editUrl && (
        <a
          href={editUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 flex items-center gap-1.5 border-t border-border pt-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <SquarePen className="size-3.5" aria-hidden />
          {t('editPage')}
        </a>
      )}
    </nav>
  )
}
