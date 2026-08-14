// Shared by the server-side guard (require-user.ts) and the client-side auth
// form, so this module must stay free of 'server-only' and of next/headers.

/** Query parameter carrying the post-login destination. */
export const REDIRECT_PARAM = 'redirect'

/**
 * Narrows a `?redirect=` value to a path we are willing to navigate to.
 * Only root-relative, same-origin paths pass. Anything that could send the
 * user off-site is dropped: absolute URLs, protocol-relative "//host", the
 * "/\" variant browsers normalise to "//", and control characters.
 *
 * Values are locale-FREE hrefs ("/collection"): the next-intl navigation
 * helpers add the locale prefix on the way out.
 *
 * Takes the raw searchParams shape rather than a plain string: Next.js hands
 * back an array when a key repeats ("?redirect=/a&redirect=/b"), and a caller
 * that assumed string would crash on it.
 */
export function safeRedirectPath(value: string | string[] | null | undefined): string | null {
  if (typeof value !== 'string') return null
  if (!value || !value.startsWith('/')) return null
  if (value.startsWith('//') || value.startsWith('/\\')) return null
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return null
  }
  return value
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
