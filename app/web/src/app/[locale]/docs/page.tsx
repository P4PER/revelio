import { getLocale } from 'next-intl/server'
import OverviewDe from '@/../content/docs/discord.de.mdx'
import OverviewEn from '@/../content/docs/discord.en.mdx'

// Phase 1 proof: one page, no shell, no registry. Phase 3 replaces this with
// the docs hub and resolves content through the page registry, which selects
// the locale for every slug instead of this one hardcoded pair.
export const dynamic = 'force-dynamic'

// Split out of the async server component so it can be tested: an async
// component calling getLocale() has no request scope under vitest, which is
// why the about and discord pages expose a sync view the same way.
export function DocsOverview({ locale }: { locale: string }) {
  const Overview = locale === 'de' ? OverviewDe : OverviewEn

  return (
    <main className="mx-auto max-w-[76rem] px-6 py-16">
      <Overview />
    </main>
  )
}

export default async function DocsPage() {
  return <DocsOverview locale={await getLocale()} />
}
