import 'server-only'
import { headers } from 'next/headers'
import { auth } from './auth'
import { hasRequiredRole } from './roles'

export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

export async function requireRole(role: 'editor' | 'admin') {
  const session = await getSession()
  if (!hasRequiredRole(session?.user?.role, role)) throw new Error('Forbidden')
  return session!
}
