import { notFound } from 'next/navigation'
import { getSession } from '@/lib/session'
import { hasRequiredRole } from '@/lib/roles'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!hasRequiredRole(session?.user?.role, 'editor')) notFound()
  return <main className="mx-auto max-w-[76rem] px-6 py-10">{children}</main>
}
