import type { ComponentType } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { hasLocale, useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { routing } from '@/../i18n/routing'
import { getPathname } from '@/../i18n/navigation'
import { SITE_URL as BASE_URL } from '@/lib/site'
import { getCachedSiteSettings } from '@/lib/server/site-settings'
import { DOCS_NAV, docId, isDocSlug } from '@/lib/docs/nav'
import { loadDoc } from '@/lib/docs/registry'
import { DocsToc } from '@/components/docs/docs-toc'
import type { DocLocale, DocSlug, TocEntry } from '@/lib/docs/types'

type Params = { params: Promise<{ locale: string; slug: string[] }> }

// The [locale] layout reads a cookie, so nothing under it is static anyway.
export const dynamic = 'force-dynamic'

function sectionKeyOf(slug: DocSlug): string | undefined {
  return DOCS_NAV.find((section) => section.pages.includes(slug))?.key
}

/**
 * The GitHub edit URL for the file behind a page. githubUrl is the repository
 * root, so "Edit this page" would otherwise drop the reader on the repo README
 * and leave them to find the file themselves.
 */
export function editUrlFor(githubUrl: string | null, slug: DocSlug, locale: DocLocale): string | null {
  if (!githubUrl) return null
  const root = githubUrl.replace(/\/+$/, '')
  return `${root}/edit/main/app/web/content/docs/${docId(slug)}.${locale}.mdx`
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, slug } = await params
  const joined = slug.join('/')
  if (!isDocSlug(joined)) return {}

  const t = await getTranslations('docs')
  const href = `/docs/${joined}`
  const languages: Record<string, string> = Object.fromEntries(
    routing.locales.map((l) => [l, `${BASE_URL}${getPathname({ href, locale: l })}`]),
  )
  languages['x-default'] = `${BASE_URL}${getPathname({ href, locale: routing.defaultLocale })}`

  return {
    title: t(`pages.${docId(joined)}.title`),
    description: t(`pages.${docId(joined)}.description`),
    alternates: { canonical: `${BASE_URL}${getPathname({ href, locale })}`, languages },
  }
}

/**
 * The reading column and its contents rail. Sync and prop-driven so it renders
 * in a test tree as well as on the server, which is how the about and discord
 * pages are already split.
 */
export function DocArticle({
  slug,
  Body,
  toc,
  editUrl,
}: {
  slug: DocSlug
  Body: ComponentType
  toc: readonly TocEntry[]
  editUrl: string | null
}) {
  const t = useTranslations('docs')
  const sectionKey = sectionKeyOf(slug)

  return (
    // The [locale] layout wraps children in a plain div, so each route brings
    // its own main landmark - as the hub and every other page already do.
    <main className="grid min-[1180px]:grid-cols-[minmax(0,1fr)_14rem]">
      <article className="min-w-0 pb-10 min-[860px]:px-12">
        {sectionKey && (
          <p className="mb-3 text-sm text-muted-foreground">{t(`sections.${sectionKey}.title`)}</p>
        )}
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {t(`pages.${docId(slug)}.title`)}
        </h1>
        <div className="mt-6">
          <Body />
        </div>
      </article>
      <div className="hidden min-[1180px]:block">
        <DocsToc toc={toc} editUrl={editUrl} />
      </div>
    </main>
  )
}

export default async function DocPage({ params }: Params) {
  const { locale, slug } = await params
  const joined = slug.join('/')
  // An unknown locale 404s rather than quietly falling back to English: a
  // silent fallback is exactly what the typed registry exists to prevent.
  if (!isDocSlug(joined) || !hasLocale(routing.locales, locale)) notFound()

  const docLocale = locale as DocLocale
  const [{ default: Body, toc }, settings] = await Promise.all([
    loadDoc(joined, docLocale),
    getCachedSiteSettings(),
  ])

  return (
    <DocArticle
      slug={joined}
      Body={Body}
      toc={toc}
      editUrl={editUrlFor(settings?.githubUrl ?? null, joined, docLocale)}
    />
  )
}
