# Migrate the request locale to `next/root-params`

Date: 2026-09-14
Scope: `app/web` only

## Why

`tsc` reports TS6387 on every `setRequestLocale(locale)` call in the app:

```
TS6387: The signature (locale: string): void of setRequestLocale is deprecated.
```

next-intl 4.14.2 deprecates two APIs at once, both pointing at the same
replacement (`node_modules/next-intl/dist/types/server/react-server/RequestLocaleCache.d.ts`
and `.../getRequestConfig.d.ts`):

- `setRequestLocale` — the opt-in that let a statically rendered page tell
  next-intl which locale it is rendering.
- `getRequestConfig`'s `requestLocale` param — the middleware-provided segment
  value that `i18n/request.ts` reads today.

Both exist only because a Server Component could not read the `[locale]`
segment on its own. Next.js 16.3 added `next/root-params`, which can, so the
request config reads the segment directly and the 30 `setRequestLocale` calls
become dead weight. Deprecated-but-working is the current state; this is
maintenance, not a fix for a live bug.

## Preconditions (all verified in-tree)

- Next.js 16.3.1 — `next/root-params` ships, and `next build` generates
  `web/.next/types/root-params.d.ts` (`export function locale(): Promise<string>`),
  wired in through the generated `web/next-env.d.ts`.
- The root layout is `src/app/[locale]/layout.tsx`. There is no
  `src/app/layout.tsx`, which root params requires — a pass-through root layout
  above the dynamic segment would make `locale` a non-root param.
- Nothing outside the `[locale]` segment calls a next-intl server API:
  `manifest.ts`, `robots.ts`, `sitemap.ts`, `llms.txt/route.ts` and
  `global-error.tsx` are all clean, and no `'use server'` module in
  `src/lib/actions/` imports `next-intl/server`. So no call site loses its
  locale source. `lib/server/require-user.ts` calls `getLocale()`, but only ever
  from a page (via `requireSettingsUser`).
- The two `opengraph-image.tsx` routes and `lib/og-image.tsx` pass an explicit
  `getTranslations({ locale, ... })`. That override path is **not** deprecated
  and keeps working: an explicit locale arrives as `locale` in the request
  config and short-circuits the root-params read.

## Target shape

`web/i18n/request.ts` reads the root param, validates it, and keeps the
override path for explicit-locale callers:

```ts
import { getRequestConfig } from 'next-intl/server'
import * as rootParams from 'next/root-params'
import { hasLocale } from 'next-intl'
import { notFound } from 'next/navigation'
import { routing } from './routing'

export default getRequestConfig(async ({ locale }) => {
  const resolved = locale ?? (await rootParams.locale())
  if (!hasLocale(routing.locales, resolved)) notFound()
  return { locale: resolved, messages: (await import(`../messages/${resolved}.json`)).default }
})
```

Two deliberate differences from the previous config:

- An unknown locale is a 404 instead of a silent fall back to `en`, which is
  what next-intl's migration guide prescribes and what `[locale]/layout.tsx`
  already did on the same condition. Measured against a production build, this
  changes nothing a visitor sees: a path the proxy rewrites (`/nope`,
  `/de/nope`) arrives with a valid segment and still gets the branded 404, and a
  path the proxy skips (`/unknown.txt`, `/foo.php`) gets Next's bare error shell
  either way, because the layout's own `hasLocale` check throws *above*
  `not-found.tsx` and so no translator can render it. Both variants were built
  and probed before settling on the guide's shape.
- `messages` is keyed off the validated locale, so the dynamic import can no
  longer be reached with an arbitrary segment value.

Every page and layout then drops the `setRequestLocale` import and call. Where
the surrounding `const { locale } = await params` existed *only* to feed it, the
destructure and the `params` prop go too; where `locale` still feeds something
real (`buildSiteMetadata`, `getPathname`, `redirect({ locale })`, a DB query,
`<html lang>`), it stays exactly as it is.

## Steps

1. **Plan doc** (this file).
2. **`i18n/request.ts`** — test first, in `i18n/__tests__/request.test.ts`,
   which needs `i18n/**/*.test.ts` added to the vitest `include` (it collected
   `src/**` only). It mocks `next/root-params` and asserts: the root param picks
   the locale and its messages; an explicit `locale` override wins without
   reading root params; an unrecognised or absent segment calls `notFound()`.
   It also stubs `getRequestConfig`, which is an identity wrapper over the
   callback - under jsdom the real `next-intl/server` resolves to its client
   build and throws "not supported in Client Components" on import. Then the
   implementation above.
3. **Strip `setRequestLocale`** from the 30 non-test modules under
   `src/app/[locale]/` plus `src/components/collection/public-collection.tsx`,
   pruning parameters that fall unused.
4. **Test mocks** — four `__tests__` files stub `next-intl/server` with a
   `setRequestLocale: vi.fn()` entry that no longer has a caller; drop it so the
   stub keeps matching the module surface.
5. **Verify** — see below. `next build` matters here: it is the only step that
   generates the real `next/root-params` types (under a bare `npm run typecheck`
   the module falls back to next's placeholder `declare module`, which types the
   getter as `any`), and the only one that exercises static generation of the
   `[locale]` routes without `setRequestLocale`.

## Verification (results)

- `npm test -w web` — 175 files, 964 tests pass, including the 5 new
  request-config cases. Mutating the resolved locale fails 2 of them, so they
  bite.
- `npm run typecheck` — clean across all six workspaces.
- `npm run lint` — clean (it flagged each `params` prop the setter had been the
  only reader of, which is how the prop pruning was driven).
- `npm run build -w web` — succeeds, and the route table is byte-identical to
  `main`'s: no page moved between static and dynamic, which was the thing
  `setRequestLocale` existed to protect.
- `E2E_PORT=3100 npm run e2e -w web` — 21/21 (an empty local Meilisearch failed
  the search spec first; reseeded via an ingest run with `S3_ENDPOINT` unset).
- By hand against the production server: `/`, `/de`, `/sets`, `/de/sets`,
  `/about`, `/de/about`, `/card/<id>`, `/de/card/<id>`, `/search?q=`,
  `/de/search?q=` all render in the right locale with the right `<html lang>`;
  `/random` and `/de/random` redirect to a correctly prefixed card URL;
  `/settings` and `/de/settings` redirect to `/login` and `/de/login`, which
  exercises the `getLocale()` call in `lib/server/require-user.ts`; both
  `/opengraph-image` routes return a 1200x630 PNG, and the German one differs in
  size from the English, so the explicit-locale override still reaches them.

## Non-goals

- `getTranslations({ locale, ... })` call sites stay as they are. The override
  is supported, and the OG-image routes in particular are better off explicit.
- No change to `routing.ts`, the proxy matcher, or the locale cookie.
