import { getLocale } from 'next-intl/server'
import OverviewDe from '@/../content/docs/discord.de.mdx'
import OverviewEn from '@/../content/docs/discord.en.mdx'

// Phase 1 proof: one page, no shell, no registry. Phase 3 replaces this with
// the docs hub and resolves content through the page registry, which selects
// the locale for every slug instead of this one hardcoded pair.
export const dynamic = 'force-dynamic'

export default async function DocsPage() {
  const locale = await getLocale()
  const Overview = locale === 'de' ? OverviewDe : OverviewEn

  return (
    <main className="mx-auto max-w-[76rem] px-6 py-16">
      <Overview />
    </main>
  )
}
