import Spike from '@/../content/docs/spike.en.mdx'

// Phase 1 proof only. Task 4 of this plan replaces the body, and phase 3
// replaces the whole page with the docs hub.
export const dynamic = 'force-dynamic'

export default function DocsPage() {
  return (
    <main className="mx-auto max-w-[76rem] px-6 py-16">
      <Spike />
    </main>
  )
}
