import 'server-only'
import { cache } from 'react'
import { headers } from 'next/headers'
import { auth } from './auth'
import { hasRequiredRole } from '@/lib/roles'

// One session read per request. The [locale] layout's header and terms banner
// and the page itself each ask for the session, and without cache() every one
// of them is its own database lookup. React scopes the cache to the request, so
// a later request - such as the router.refresh() after accepting the terms -
// reads fresh. No caller reads the session again after changing it within the
// same request; one that needs to must call auth.api.getSession directly.
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() })
})

export async function requireRole(role: 'editor' | 'admin') {
  const session = await getSession()
  if (!hasRequiredRole(session?.user?.role, role)) throw new Error('Forbidden')
  return session!
}
