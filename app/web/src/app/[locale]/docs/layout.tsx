import type { ReactNode } from 'react'
import { DocsSidebar } from '@/components/docs/docs-sidebar'

// No StarField here. It belongs on /discord, the marketing page; docs are read
// for minutes at a time, so the ground stays flat.
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[76rem] flex-col px-6 min-[860px]:flex-row min-[860px]:px-0">
      {/* Sticky on wide screens, a band above the content below 860px. */}
      <aside className="border-b border-border/60 py-6 min-[860px]:sticky min-[860px]:top-0 min-[860px]:w-[15.5rem] min-[860px]:shrink-0 min-[860px]:self-start min-[860px]:border-b-0 min-[860px]:border-r min-[860px]:py-10 min-[860px]:pl-6 min-[860px]:pr-4">
        <DocsSidebar />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
