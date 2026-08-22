import 'server-only'
import { requireUser } from '@/lib/server/require-user'
import type { SettingsUser } from '@/components/settings/types'

/**
 * The current user shaped for the settings panes. Redirects to /login when
 * signed out, carrying `redirectTo` so the visitor comes back here - call it
 * at the top of every settings page (Next.js auth guidance is to check auth in
 * the page/data layer, not only in a layout).
 */
export async function requireSettingsUser(redirectTo?: string): Promise<SettingsUser> {
  const u = await requireUser(redirectTo)
  return {
    id: u.id,
    username: u.username ?? null,
    displayUsername: u.displayUsername ?? null,
    email: u.email,
    role: u.role ?? null,
    createdAt: (u.createdAt instanceof Date ? u.createdAt : new Date(u.createdAt)).toISOString(),
  }
}
