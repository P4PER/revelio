// Shared by the server-side guard (require-user.ts) and the client-side auth
// form, so this module must stay free of 'server-only' and of next/headers.

import { routing } from '@/../i18n/routing'

/** Query parameter carrying the post-login destination. */
export const REDIRECT_PARAM = 'redirect'

/** One leading locale segment: "/de" followed by "/", "?", "#" or the end, never "/deck". */
const LOCALE_PREFIX = new RegExp(`^/(?:${routing.locales.join('|')})(?=[/?#]|$)`)

/** "/de/collection" -> "/collection", "/de" -> "/", repeated until none is left. */
function stripLocalePrefix(path: string): string {
  let rest = path
  while (LOCALE_PREFIX.test(rest)) {
    rest = rest.replace(LOCALE_PREFIX, '')
    if (!rest.startsWith('/')) rest = `/${rest}`
  }
  return rest
}

/**
 * Narrows a `?redirect=` value to a path we are willing to navigate to.
 * Only root-relative, same-origin paths pass. Anything that could send the
 * user off-site is dropped: absolute URLs, protocol-relative "//host", the
 * "/\" variant browsers normalise to "//", and control characters.
 *
 * Values are locale-FREE hrefs ("/collection"): the next-intl navigation
 * helpers add the locale prefix on the way out, so a prefixed value is
 * stripped first ("/de/collection" would otherwise land on /de/de/collection).
 * The checks below run on what is left, so "/de//evil.example" is still caught.
 *
 * Takes the raw searchParams shape rather than a plain string: Next.js hands
 * back an array when a key repeats ("?redirect=/a&redirect=/b"), and a caller
 * that assumed string would crash on it.
 */
export function safeRedirectPath(value: string | string[] | null | undefined): string | null {
  if (typeof value !== 'string') return null
  if (!value || !value.startsWith('/')) return null
  const path = stripLocalePrefix(value)
  if (path.startsWith('//') || path.startsWith('/\\')) return null
  for (let i = 0; i < path.length; i++) {
    const code = path.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return null
  }
  return path
}

function withRedirect(base: '/login' | '/register', to?: string | string[] | null): string {
  const target = safeRedirectPath(to)
  return target ? `${base}?${REDIRECT_PARAM}=${encodeURIComponent(target)}` : base
}

/** `/login`, carrying `to` as the post-login destination when it is safe. */
export function loginHref(to?: string | string[] | null): string {
  return withRedirect('/login', to)
}

/** `/register`, carrying `to` so the cross-link does not lose the destination. */
export function registerHref(to?: string | string[] | null): string {
  return withRedirect('/register', to)
}
