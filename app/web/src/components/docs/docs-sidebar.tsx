'use client'

import { useTranslations } from 'next-intl'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Link, usePathname } from '@/../i18n/navigation'
import { DOCS_NAV, docId } from '@/lib/docs/nav'
import type { DocSlug } from '@/lib/docs/types'

const PAGE_LINK =
  'block border-l-2 border-border px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
// Indigo marks the page on the light ground, gold on the dark one. Both are
// the theme's own ink token, so each stays readable against its background.
// The wash fades out to the right rather than filling the row, so the mark
// reads as an accent on the rail's edge and not as a block.
const PAGE_LINK_ACTIVE =
  'block border-l-2 border-secondary-ink bg-gradient-to-r from-secondary-ink/10 to-transparent px-2.5 py-1.5 text-sm font-semibold text-secondary-ink dark:border-primary dark:from-primary/10 dark:text-primary-ink'

function href(slug: DocSlug): string {
  return `/docs/${slug}`
}

/**
 * The left rail: the map of the docs, sections then pages. The right rail
 * carries the current page's own headings, so the two never repeat each other
 * and this one stays short as sections are added.
 *
 * A client component only because it reads the active route: a layout receives
 * params for its own segment, not for the catch-all child that actually knows
 * the slug.
 */
export function DocsSidebar() {
  const t = useTranslations('docs')
  const pathname = usePathname()

  return (
    <nav aria-label={t('railHeading')} className="flex flex-col gap-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('railHeading')}
      </p>

      {DOCS_NAV.map((section) => (
        <div key={section.key}>
          <p
            className={`mb-1.5 flex items-center gap-1.5 text-sm font-semibold ${
              section.status === 'planned' ? 'font-medium text-muted-foreground' : 'text-foreground'
            }`}
          >
            {section.status === 'live' ? (
              <ChevronDown className="size-3 text-muted-foreground" aria-hidden />
            ) : (
              <ChevronRight className="size-3 text-muted-foreground" aria-hidden />
            )}
            {t(`sections.${section.key}.title`)}
            {section.status === 'planned' && (
              <span className="rounded-full border border-border px-1.5 py-px text-[0.62rem] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('planned')}
              </span>
            )}
          </p>

          {section.pages.length > 0 && (
            <ul className="flex flex-col">
              {section.pages.map((slug) => {
                const active = pathname === href(slug)
                return (
                  <li key={slug}>
                    <Link
                      href={href(slug)}
                      aria-current={active ? 'page' : undefined}
                      className={active ? PAGE_LINK_ACTIVE : PAGE_LINK}
                    >
                      {t(`pages.${docId(slug)}.title`)}
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ))}
    </nav>
  )
}
