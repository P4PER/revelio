# Auth pages redirect a signed-in visitor

**Goal:** a visitor who already has a session and opens `/login` or `/register` is sent on
instead of being shown a form that would only sign them in again.

**Cause:** neither page reads the session, and `src/proxy.ts` only does locale routing.

## Design

At the top of both page components, server side:

1. Validate `?redirect=` with `safeRedirectPath` (as today).
2. `getSession()`; if it returns a session, `redirect({ href: redirectTo ?? '/', locale })`
   through next-intl's `redirect`, so the `as-needed` locale prefix is applied.
3. Otherwise render `AuthCard` unchanged.

The normal sign-in flow is unaffected: `auth-form.tsx` signs in and then registers the
username client-side, and only then calls `router.push(redirectTo ?? '/')`, so the page never
re-renders server-side with a session in between. `router.refresh()` follows the push, so
it refreshes the target, not `/login`.

A `?redirect=/login` target cannot loop: each hop drops one level of the parameter and
ends at `/`.

## Tasks

1. Tests `app/[locale]/login/__tests__/page.test.tsx` and `register/__tests__/page.test.tsx`
   (mock `getSession` and `redirect`, the way `collection/__tests__/page-signed-out.test.tsx`
   does): signed in with a safe redirect goes there; signed in with none or an unsafe one goes
   to `/`; signed out renders the form and does not redirect. Watch them fail.
2. Add the guard to both pages. Watch the tests pass.
3. `npm test -w web`, `npm run typecheck`, `npm run lint`; check by hand against the dev
   server with a signed-in session.
