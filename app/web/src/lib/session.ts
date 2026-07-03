import 'server-only'
import { headers } from 'next/headers'
import { auth } from './auth'

const RANK: Record<string, number> = { user: 0, editor: 1, admin: 2 }

export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

export async function requireRole(role: 'editor' | 'admin') {
  const session = await getSession()
  const userRole = session?.user?.role ?? 'user'
  if ((RANK[userRole] ?? -1) < RANK[role]) throw new Error('Forbidden')
  return session!
}
