# Redirect targets keep their locale without doubling it

**Goal:** a `?redirect=` target that carries a locale prefix (`/de/collection`) lands on
`/de/collection` from any login page, not `/de/de/collection` (a 404).

**Cause:** `safeRedirectPath` documents that targets are locale-free, but does not enforce
it. Every consumer (`redirectIfSignedIn`, `requireUser` via `loginHref`, the auth form's
`router.replace`) passes the target to a next-intl navigation helper, which prefixes the
current locale again. No caller in the tree builds a prefixed target; a hand-written or
copied URL does.

Follow-up to PR #144, which surfaced it in review (finding 5).

## Design

The target keeps its locale. Stripping it in `safeRedirectPath` (the first cut) fixed
`/de/login` but broke the unprefixed English `/login`: with `localePrefix: 'as-needed'`,
`/login?redirect=/de/collection` used to reach the German page, and would then land on the
English one.

- `splitLocalePrefix(path)` in `lib/redirect-path.ts` returns `{ href, locale? }`: a whole
  first segment that `hasLocale(routing.locales, ...)` accepts is split off (`/de` -> `/`,
  `/de?x` -> `/?x`); `/deck` is left alone.
- `safeRedirectPath` returns the value unchanged, prefix included, so `loginHref` carries it
  through the sign-in round trip. Its same-origin checks run on the split `href`, since that
  is what navigation emits: `/en//evil.example` would leave as `//evil.example`.
- The two places that navigate split first and pass the locale: `redirectIfSignedIn`
  (`locale ?? getLocale()`) and the auth form's `router.replace(href, { locale })`.

## Tasks

1. Tests: `splitLocalePrefix` cases, `safeRedirectPath` keeps the prefix and rejects
   `/en//evil.example`; `redirectIfSignedIn` and the auth form navigate to a prefixed target
   in its locale. Watch them fail.
2. Implement. Watch them pass.
3. `npm test -w web`, `npm run typecheck`, `npm run lint`.
