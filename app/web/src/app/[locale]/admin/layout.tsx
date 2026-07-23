import { notFound } from 'next/navigation'
import { getSession } from '@/lib/session'
import { hasRequiredRole } from '@/lib/roles'
import { AdminSidebar } from '@/components/admin-sidebar'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!hasRequiredRole(session?.user?.role, 'editor')) notFound()
  const isAdmin = hasRequiredRole(session?.user?.role, 'admin')
  return (
    // The content column keeps the full max-w-[76rem] (same as every other page);
    // the sidebar (~12rem) + gap live in the extra width OUTSIDE that column, so
    // content never loses width to the nav. The shell is centered; on wide screens
    // the sidebar sits in the gutter, on narrow screens it stacks and becomes a
    // Sheet drawer trigger. Container width = content + sidebar + gap.
    <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-4 px-6 py-10 min-[1024px]:flex-row min-[1024px]:gap-8">
      <AdminSidebar isAdmin={isAdmin} />
      <main className="min-w-0 flex-1 max-w-[76rem]">{children}</main>
    </div>
  )
}
