import { hasLocale } from 'next-intl'
import { getRequestConfig } from 'next-intl/server'
import { notFound } from 'next/navigation'
import * as rootParams from 'next/root-params'
import { routing } from './routing'

// The locale comes from the `[locale]` root param, which a Server Component can
// read directly since Next 16.3 - next-intl's older `requestLocale` (fed by the
// proxy, and needing a `setRequestLocale` call per statically rendered page) is
// deprecated in favour of this.
//
// `locale` is set only when a caller passed one explicitly, e.g.
// `getTranslations({ locale })` in the opengraph-image routes, which render with
// no root param of their own. That override wins, which is why the param is
// read before root params are touched.
export default getRequestConfig(async ({ locale }) => {
  const requested = locale ?? (await rootParams.locale())
  // The `[locale]` segment also catches paths the proxy never rewrites - its
  // matcher skips anything with a dot, so `/unknown.txt` arrives as the segment
  // verbatim. Those 404 either way: `[locale]/layout.tsx` runs the same check
  // and throws above `not-found.tsx`, so Next answers with its bare error shell
  // rather than the branded 404 that a rewritten path gets.
  if (!hasLocale(routing.locales, requested)) notFound()
  return {
    locale: requested,
    messages: (await import(`../messages/${requested}.json`)).default,
  }
})
