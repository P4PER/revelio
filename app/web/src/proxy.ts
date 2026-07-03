import createMiddleware from 'next-intl/middleware'
import { routing } from '../i18n/routing'

// Next.js 16 renamed the `middleware` file convention to `proxy`.
export default createMiddleware(routing)

export const config = {
  // Match all pathnames except API routes, Next internals and files with a dot.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
}
