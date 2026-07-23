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
    // Centered flex row: the sidebar sits in the gutter (outside the content's
    // max-w-[76rem]); below 1180px the sidebar collapses to a Sheet trigger and
    // the content uses the normal centered width.
    <div className="mx-auto flex w-full flex-col gap-4 px-6 py-10 min-[1180px]:w-fit min-[1180px]:flex-row min-[1180px]:gap-8">
      <AdminSidebar isAdmin={isAdmin} />
      <main className="w-full min-w-0 max-w-[76rem]">{children}</main>
    </div>
  )
}
