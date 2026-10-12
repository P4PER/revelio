# Auth pages redirect a signed-in visitor

**Goal:** a visitor who already has a session and opens `/login` or `/register` is sent on
instead of being shown a form that would only sign them in again.

**Cause:** neither page reads the session, and `src/proxy.ts` only does locale routing.

## Design

A `redirectIfSignedIn(redirectTo)` helper in `lib/server/require-user.ts`, beside its mirror
`requireUser` and reading the locale the same way (`getLocale()`): with a session, it calls
next-intl's `redirect({ href: redirectTo ?? '/', locale })`, so the `as-needed` prefix is
applied. Both pages validate `?redirect=` with `safeRedirectPath` (as today), await the
helper, then render `AuthCard` unchanged.

The normal sign-in flow is unaffected: `auth-form.tsx` signs in and then registers the
username client-side before navigating, so the page never re-renders server-side with a
session in between. That navigation becomes `router.replace`: a pushed one left the auth
page in history, and Back would now land on its redirect and bounce forward again.

A `?redirect=/login` target cannot loop: each hop drops one level of the parameter and
ends at `/`.

## Tasks

1. Tests for the helper in `lib/server/__tests__/require-user.test.ts` (signed in with a
   target goes there, with none goes home, signed out passes), and one wiring test for both
   pages in `app/[locale]/__tests__/auth-pages-signed-in.test.tsx` (the guard receives the
   value `safeRedirectPath` narrowed, so an off-site one arrives as `null`). Watch them fail.
2. Add the helper and call it from both pages; switch the form to `router.replace`. Watch
   the tests pass.
3. `npm test -w web`, `npm run typecheck`, `npm run lint`; check by hand against the dev
   server with a signed-in session.
