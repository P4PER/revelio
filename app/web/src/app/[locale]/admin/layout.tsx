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
    // The content column is anchored to the same max-w-[76rem] container as the
    // site header, so its right edge always lines up with the header (content
    // never spills past it). On very wide screens (>=1700px) the inner row is
    // pulled 14rem into the LEFT gutter so the sidebar hangs outside the content
    // column while content keeps the full 76rem; below that the sidebar and
    // content share the 76rem row; below 1024px it stacks into a Sheet drawer.
    <div className="mx-auto max-w-[76rem] px-6 py-10">
      <div className="flex flex-col gap-4 min-[1024px]:flex-row min-[1024px]:gap-8 min-[1700px]:-ml-56 min-[1700px]:w-[calc(100%+14rem)]">
        <AdminSidebar isAdmin={isAdmin} />
        <main className="min-w-0 flex-1 min-[1024px]:max-w-[76rem]">{children}</main>
      </div>
    </div>
  )
}
