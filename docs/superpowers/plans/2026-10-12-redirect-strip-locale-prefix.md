# Redirect targets drop a locale prefix

**Goal:** a `?redirect=` target that carries a locale prefix (`/de/collection`) lands on
`/de/collection`, not `/de/de/collection` (a 404).

**Cause:** `safeRedirectPath` documents that targets are locale-free, but does not enforce
it. Every consumer (`redirectIfSignedIn`, `requireUser` via `loginHref`, the auth form's
`router.replace`) passes the target to a next-intl navigation helper, which prefixes the
current locale again. No caller in the tree builds a prefixed target; a hand-written or
copied URL does.

Follow-up to PR #144, which surfaced it in review (finding 5).

## Design

`safeRedirectPath` strips leading locale segments (`routing.locales`) before validating,
so a single function owns the "locale-free" rule and every consumer inherits it. A segment
only counts when it is the whole first segment: `/de`, `/de/...`, `/de?...`, `/de#...` -
not `/deck`. A bare `/de` becomes `/`. The strip repeats, so `/de/en/x` is `/x`.

Validation runs on the stripped value, not the raw one: `/de//evil.example` strips to
`//evil.example` and must still be rejected.

The current locale wins over the stripped one. That matches what a locale-free target
already does, and switching language is the locale switcher's job.

## Tasks

1. Tests in `lib/__tests__/redirect-path.test.ts`: prefixed path, bare prefix, prefix
   before query/hash, repeated prefix, a lookalike segment (`/deck`, `/english`) kept, and
   `/de//evil.example` rejected; `loginHref` carries the stripped target. Watch them fail.
2. Implement in `lib/redirect-path.ts`, importing `routing` from `@/../i18n/routing`
   (isomorphic, safe for the client form). Watch them pass.
3. `npm test -w web`, `npm run typecheck`, `npm run lint`.
