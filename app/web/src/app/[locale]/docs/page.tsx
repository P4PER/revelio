import Overview from '@/../content/docs/discord.en.mdx'

// Phase 1 proof: one locale, no shell, no registry. Phase 3 replaces this with
// the docs hub and resolves content through the page registry instead.
export const dynamic = 'force-dynamic'

export default function DocsPage() {
  return (
    <main className="mx-auto max-w-[76rem] px-6 py-16">
      <Overview />
    </main>
  )
}
