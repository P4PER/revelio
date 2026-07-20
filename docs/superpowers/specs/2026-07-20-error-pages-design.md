# Error Pages — "The Vanished Card"

**Date:** 2026-07-20
**Status:** Approved design, ready for planning
**Area:** `@revelio/web` (Next.js App Router)

## Goal

The web app currently ships **no** error UI — an unmatched route, a runtime
throw, or a root-layout crash all fall back to Next.js's unstyled defaults. Add
one reusable, on-brand error treatment that covers the three App Router error
surfaces.

## Concept

**"The Vanished Card."** A single visual treatment built around the product's
own identity: a face-down / empty card (the art slot replaced by a gold spark or
`?`), sitting in the Reveal-Glow palette (gold `#E8B23A` on midnight, Poppins).
Only the icon accent, copy, and action buttons change per case.

Tone is lightly thematic (magic/charms) but the *description* line always states
plainly what happened, so the page stays useful.

## Surfaces & behavior

| Surface | File | Rendering | Visual accent | Heading | Description | Actions |
|---|---|---|---|---|---|---|
| **404** | `src/app/[locale]/not-found.tsx` | Server component | Face-down card, gold `?` | "This card isn't in the archive" | "We searched the collection but couldn't find that page." | **Search cards** (primary → `/search`) · Go home (→ `/`) |
| **Runtime** | `src/app/[locale]/error.tsx` | `'use client'` | Card mid-dissolve, spark escaping | "The spell fizzled" | "Something went wrong loading this page. Try casting it again." | **Try again** (primary → `reset()`) · Go home (→ `/`) · error digest |
| **Global** | `src/app/global-error.tsx` | `'use client'`, self-contained | Static card, spark | "Something went dark" | "The app hit an unexpected error. Reloading usually fixes it." | **Reload** (`window.location.reload()`) · error digest |

Copy above is the English source of truth. 404 + runtime strings are
translated; global is hardcoded English (see i18n).

## Components & structure

Break the work into one presentational unit plus three thin route files.

### `src/components/error-card-state.tsx` — shared presentational component

- **Purpose:** render the whole visual (the card motif + heading + description +
  action row + optional digest). Pure and framework-light: **no** i18n, **no**
  data fetching, **no** navigation. All text and buttons arrive as props/children.
- **Props:**
  - `variant: 'missing' | 'dissolving' | 'dark'` — selects the card accent
    (gold `?` / dissolving spark / static spark).
  - `heading: string`, `description: string`
  - `digest?: string` — rendered as a muted "reference: …" line when present.
  - `children: ReactNode` — the action buttons (caller supplies, so links stay
    locale-aware and the client reset button stays in the client file).
- **Styling:** Tailwind v4 classes + existing design tokens
  (`bg-background`, `text-foreground`, `border-border`, `text-primary`, etc.).
  The card motif is local markup (layered borders, dashed inner frame, spark),
  not a dependency on `BrandMark`.
- **Why a pure component:** it can be reused by all three route files —
  including `global-error.tsx`, which cannot touch next-intl or providers — and
  is trivially unit-testable in isolation.

### `src/app/[locale]/not-found.tsx` (server component)

- `getTranslations('errors')` for copy.
- Renders `<ErrorCardState variant="missing" …>` with two locale-aware
  `<Link>`s from `@/../i18n/navigation` (`/search`, `/`), styled with the
  existing `Button` component (`asChild`).

### `src/app/[locale]/error.tsx` (`'use client'`)

- Receives `{ error: Error & { digest?: string }, reset: () => void }`.
- `useTranslations('errors')` (client) for copy.
- Renders `<ErrorCardState variant="dissolving" digest={error.digest} …>` with a
  **Try again** `Button` calling `reset()` and a Go-home `<Link>`.
- `console.error(error)` in a `useEffect` so runtime errors still surface in
  logs (matches Next's convention).

### `src/app/global-error.tsx` (`'use client'`)

- Replaces the **root** layout when it crashes, so it must render its own
  `<html lang="en" className="dark">` and `<body>` and **import
  `../globals.css`** for the palette. No `SiteHeader`/`SiteFooter`, no
  `NextIntlClientProvider`, no next-intl calls.
- Hardcoded English strings (the layout that would load messages is exactly what
  failed).
- Reuses `<ErrorCardState variant="dark" digest={error.digest} …>` (it's pure,
  so safe here) with a **Reload** button calling `window.location.reload()`.

## Internationalization

- Add an `errors` namespace to **`messages/en.json`** and **`messages/de.json`**:
  - `notFound`: `heading`, `description`, `searchCta`, `homeCta`
  - `runtime`: `heading`, `description`, `retryCta`, `homeCta`
  - `digestLabel` (e.g. "reference")
- German copy: provide natural translations (not literal), keeping the same
  light-magic tone where it reads well.
- `global-error.tsx` is **excluded** from i18n by necessity — English only.

## Testing

Follow existing vitest + testing-library patterns (`src/**/__tests__`).

- `error-card-state.test.tsx` — renders heading, description, action children;
  shows the digest line only when `digest` is passed; applies the right accent
  per `variant`.
- `not-found.test.tsx` — renders the translated 404 heading and both CTAs with
  correct hrefs.
- `error.test.tsx` — renders runtime copy; clicking **Try again** calls the
  `reset` prop; digest is displayed.
- (global-error: light smoke test that it renders heading + a reload control;
  it renders its own `<html>`, so keep the assertion minimal.)

## Non-goals / deferred

- **Root (locale-less) `app/not-found.tsx`.** The proxy/middleware
  (`src/proxy.ts`, Next 16's renamed middleware) routes all real navigations
  through the `[locale]` segment, and a catch-all `[locale]/[...rest]/page.tsx`
  (calling `notFound()`) hands unmatched paths to the localized not-found page —
  this is the next-intl-recommended pattern and is **included** in the
  implementation. Only requests that bypass the middleware matcher entirely
  (`api`, `_next`, dotted paths) are uncovered; handling those needs a root
  layout the app doesn't have, so it stays deferred.
- **Illustrated/animated card art** (e.g. animated dissolve, real card-back
  artwork). The CSS motif is enough for v1; revisit if desired.
- **Reporting errors to an external service** (Sentry etc.) — out of scope.

## Files touched

**New**
- `src/components/error-card-state.tsx`
- `src/app/[locale]/not-found.tsx`
- `src/app/[locale]/[...rest]/page.tsx` (catch-all → `notFound()`, so unmatched routes render the localized 404)
- `src/app/[locale]/error.tsx`
- `src/app/global-error.tsx`
- tests under `src/components/__tests__/` and `src/app/[locale]/__tests__/`

**Modified**
- `messages/en.json`, `messages/de.json` (add `errors` namespace)
