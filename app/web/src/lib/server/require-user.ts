import 'server-only'
import { getLocale } from 'next-intl/server'
import { redirect } from '@/../i18n/navigation'
import { getSession } from '@/lib/server/session'
import { loginHref } from '@/lib/redirect-path'

/**
 * The signed-in user, or a redirect to /login carrying `redirectTo` so signing
 * in lands back where the visitor started. Pass the locale-free href of the
 * page doing the guarding, e.g. '/settings/profile'.
 *
 * Use this only for pages with nothing to show signed out. Pages that have a
 * logged-out story (/collection, /decks/mine) render SignedOutTeaser instead:
 * bouncing someone to a login form is the right call only when the page would
 * otherwise be empty.
 */
export async function requireUser(redirectTo?: string) {
  const session = await getSession()
  if (!session?.user) redirect({ href: loginHref(redirectTo), locale: await getLocale() })
  return session!.user
}
