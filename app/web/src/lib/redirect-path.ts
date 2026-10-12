// Shared by the server-side guard (require-user.ts) and the client-side auth
// form, so this module must stay free of 'server-only' and of next/headers.

import { hasLocale } from 'next-intl'
import { routing } from '@/../i18n/routing'

/**
 * A redirect target split for the next-intl navigation helpers, which add the
 * locale prefix themselves: `locale` is the one the target named, if any.
 */
type LocalizedHref = { href: string; locale?: (typeof routing.locales)[number] }

/** Query parameter carrying the post-login destination. */
export const REDIRECT_PARAM = 'redirect'

/**
 * Narrows a `?redirect=` value to a path we are willing to navigate to.
 * Only root-relative, same-origin paths pass. Anything that could send the
 * user off-site is dropped: absolute URLs, protocol-relative "//host", the
 * "/\" variant browsers normalise to "//", and control characters.
 *
 * A locale prefix ("/de/collection") is kept, so the target's language
 * survives the round trip; navigate with splitLocalePrefix, never the raw
 * value. The checks run on the path after the prefix, because that is what
 * the navigation helpers emit: "/en//evil.example" would leave as
 * "//evil.example", since the default locale goes unprefixed.
 *
 * Takes the raw searchParams shape rather than a plain string: Next.js hands
 * back an array when a key repeats ("?redirect=/a&redirect=/b"), and a caller
 * that assumed string would crash on it.
 */
export function safeRedirectPath(value: string | string[] | null | undefined): string | null {
  if (typeof value !== 'string') return null
  if (!value || !value.startsWith('/')) return null
  const { href } = splitLocalePrefix(value)
  if (href.startsWith('//') || href.startsWith('/\\')) return null
  for (let i = 0; i < href.length; i++) {
    const code = href.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return null
  }
  return value
}

/**
 * Splits a leading locale segment off a path ("/de/collection" ->
 * { href: "/collection", locale: "de" }). Passing `href` with a prefix still
 * on it would have the helpers prefix it again (/de/de/collection, a 404);
 * dropping `locale` would send a German target to the visitor's current
 * language. Only a whole first segment counts, so "/deck" is left alone.
 */
export function splitLocalePrefix(path: string): LocalizedHref {
  const match = /^\/([^/?#]+)(.*)$/.exec(path)
  if (!match || !hasLocale(routing.locales, match[1])) return { href: path }
  const rest = match[2]
  return { href: rest.startsWith('/') ? rest : `/${rest}`, locale: match[1] }
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
