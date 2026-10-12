import 'server-only'
import { getLocale } from 'next-intl/server'
import { redirect } from '@/../i18n/navigation'
import { getSession } from '@/lib/server/session'
import { loginHref, splitLocalePrefix } from '@/lib/redirect-path'

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

/**
 * The inverse guard, for /login and /register: a visitor who is already signed
 * in has no use for either form, which would only sign them in again, so send
 * them on to `redirectTo` (already narrowed by safeRedirectPath) or home, in
 * the language the target names, else the current one.
 */
export async function redirectIfSignedIn(redirectTo: string | null) {
  const session = await getSession()
  if (!session?.user) return
  const { href, locale } = splitLocalePrefix(redirectTo ?? '/')
  redirect({ href, locale: locale ?? (await getLocale()) })
}
