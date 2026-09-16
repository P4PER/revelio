'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Link, usePathname } from '@/../i18n/navigation'
import { DOCS_NAV, docId } from '@/lib/docs/nav'
import type { DocSection } from '@/lib/docs/nav'
import type { DocSlug } from '@/lib/docs/types'

// The second padding is the desktop rail's. The same tree is the mobile
// drawer's content below 860px, where a row is a touch target: py-3 puts it at
// the 44px a finger needs, py-1.5 keeps the rail as dense as it was.
const PAGE_LINK =
  'block border-l-2 border-border px-2.5 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground min-[860px]:py-1.5'
// Indigo marks the page on the light ground, gold on the dark one. Both are
// the theme's own ink token, so each stays readable against its background.
// The wash fades out to the right rather than filling the row, so the mark
// reads as an accent on the rail's edge and not as a block.
const PAGE_LINK_ACTIVE =
  'block border-l-2 border-secondary-ink bg-gradient-to-r from-secondary-ink/10 to-transparent px-2.5 py-3 text-sm font-semibold text-secondary-ink dark:border-primary dark:from-primary/10 dark:text-primary-ink min-[860px]:py-1.5'
const SECTION_LABEL = 'flex items-center gap-1.5 text-sm font-semibold'

function href(slug: DocSlug): string {
  return `/docs/${slug}`
}

/**
 * One section of the map. Sections start open, so the one holding the page
 * being read is always open on arrival; collapsing is the reader's own move and
 * deliberately not remembered, which keeps it out of the storage the privacy
 * policy has to enumerate.
 *
 * A planned section carries no pages, so it stays a plain label: a disclosure
 * that expands into nothing is worse than none.
 */
function NavSection({ section }: { section: DocSection }) {
  const t = useTranslations('docs')
  const pathname = usePathname()
  const [open, setOpen] = useState(true)
  const panelId = useId()
  const title = t(`sections.${section.key}.title`)

  if (section.pages.length === 0) {
    return (
      <p className={`${SECTION_LABEL} font-medium text-muted-foreground`}>
        <ChevronRight className="size-3 text-muted-foreground" aria-hidden />
        {title}
        {section.status === 'planned' && (
          <span className="rounded-full border border-border px-1.5 py-px text-[0.62rem] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('planned')}
          </span>
        )}
      </p>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-expanded={open}
        aria-controls={panelId}
        className={`${SECTION_LABEL} mb-1.5 w-full py-2 text-left text-foreground min-[860px]:py-0`}
      >
        <ChevronDown
          className={`size-3 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`}
          aria-hidden
        />
        {title}
      </button>

      {/* Hidden rather than unmounted: aria-controls has to point at an element
          that exists, and AT following a dangling IDREF finds nothing. `hidden`
          keeps the list out of the accessibility tree and out of the tab order
          all the same. */}
      <ul id={panelId} hidden={!open} className="flex flex-col">
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
    </div>
  )
}

/**
 * The map itself, without a landmark of its own. The desktop rail wraps it in
 * one; the mobile drawer is already a dialog and brings its own title.
 */
export function DocsNavTree() {
  return (
    <div className="flex flex-col gap-6">
      {DOCS_NAV.map((section) => (
        <NavSection key={section.key} section={section} />
      ))}
    </div>
  )
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

  return (
    <nav aria-label={t('railHeading')} className="flex flex-col gap-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('railHeading')}
      </p>
      <DocsNavTree />
    </nav>
  )
}
