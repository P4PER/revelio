import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { ArrowRight, BookText, Code2 } from 'lucide-react'
import { routing } from '@/../i18n/routing'
import { Link, getPathname } from '@/../i18n/navigation'
import { SITE_URL as BASE_URL } from '@/lib/site'
import { DOCS_NAV, docId } from '@/lib/docs/nav'
import { DocsMobileBar } from '@/components/docs/docs-mobile-bar'

export const dynamic = 'force-dynamic'

const SECTION_ICON = { discord: BookText, api: Code2 } as const

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations('docs')

  // The hub is the footer's route into the section, so /docs and /de/docs must
  // canonicalise the same way their children do.
  const languages: Record<string, string> = Object.fromEntries(
    routing.locales.map((l) => [l, `${BASE_URL}${getPathname({ href: '/docs', locale: l })}`]),
  )
  languages['x-default'] =
    `${BASE_URL}${getPathname({ href: '/docs', locale: routing.defaultLocale })}`

  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: { canonical: `${BASE_URL}${getPathname({ href: '/docs', locale })}`, languages },
  }
}

/**
 * The section index. A real page rather than a redirect to /docs/discord: it is
 * the footer link's target, so it has to make sense on arrival, and a redirect
 * would have to be undone the moment a second section exists.
 *
 * No contents rail - there are no headings to list, so the reading column takes
 * the full width.
 */
export function DocsHub() {
  const t = useTranslations('docs')

  return (
    <>
      {/* The hub has no headings of its own, so the bar carries the map alone
          and disappears at 860px, where the rail is back in the gutter. */}
      <DocsMobileBar title={t('hubTitle')} toc={[]} editUrl={null} />
      <main className="px-0 pb-10 min-[860px]:px-12">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{t('hubTitle')}</h1>
        <p className="mt-4 max-w-[62ch] text-base leading-relaxed text-muted-foreground">
          {t('hubLede')}
        </p>

        <div className="mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
          {DOCS_NAV.map((section) => {
            const Icon = SECTION_ICON[section.key]
            const title = t(`sections.${section.key}.title`)
            const summary = t(`sections.${section.key}.summary`)

            if (section.status === 'planned' || section.pages.length === 0) {
              return (
                <div
                  key={section.key}
                  className="flex flex-col gap-1.5 rounded-xl border border-dashed border-border p-5"
                >
                  <p className="flex items-center gap-2 text-base font-semibold text-muted-foreground">
                    <Icon className="size-4" aria-hidden />
                    {title}
                    <span className="rounded-full border border-border px-1.5 py-px text-[0.62rem] font-semibold uppercase tracking-wider">
                      {t('planned')}
                    </span>
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground">{summary}</p>
                </div>
              )
            }

            return (
              <Link
                key={section.key}
                href={`/docs/${section.pages[0]}`}
                className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary hover:bg-primary/5"
              >
                <span className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <Icon className="size-4 text-primary-ink" aria-hidden />
                  {title}
                  <ArrowRight className="size-4 text-primary-ink" aria-hidden />
                </span>
                <span className="text-sm leading-relaxed text-muted-foreground">{summary}</span>
                <span className="mt-1 font-mono text-xs text-muted-foreground">
                  {section.pages.map((slug) => t(`pages.${docId(slug)}.title`)).join(' · ')}
                </span>
              </Link>
            )
          })}
        </div>
      </main>
    </>
  )
}

export default function DocsHubPage() {
  return <DocsHub />
}
