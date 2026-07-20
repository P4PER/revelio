# Error Pages ("The Vanished Card") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one reusable, on-brand error treatment covering all three Next.js App Router error surfaces (404, runtime, global).

**Architecture:** A single pure presentational component (`ErrorCardState`) renders the "vanished card" visual + heading + description + digest + an actions slot. Three thin route files (`not-found.tsx`, `error.tsx`, `global-error.tsx`) supply variant, copy, and buttons. 404 + runtime copy is translated via next-intl; `global-error.tsx` is self-contained and English-only.

**Tech Stack:** Next.js 16 (App Router, React 19), next-intl, Tailwind v4, shadcn `Button`, lucide-react, vitest + @testing-library/react.

## Global Constraints

- All app commands run from `app/`. Tests: `npm test -w web -- <path>`. Typecheck: `npm run typecheck`.
- Design tokens only (no raw hex in components except the card-motif gradient/dashed accent, which have no token): `bg-background`, `text-foreground`, `text-muted-foreground`, `text-primary`, `text-accent`, `border-border`.
- Locale-aware links come from `@/../i18n/navigation` (`Link`), never `next/link`.
- Server translations: `getTranslations` from `next-intl/server`. Client translations: `useTranslations` from `next-intl`.
- Message keys must be added to **both** `messages/en.json` and `messages/de.json` (parity is required).
- `global-error.tsx` must NOT import next-intl, providers, `SiteHeader`/`SiteFooter`, or the locale `Link`. It renders its own `<html>`/`<body>` and uses hardcoded English.
- Follow the repo's dual-export test convention: export the presentational component **named** and also as **default** (mirrors `src/app/[locale]/page.tsx`, which exports `Home` named + `HomePage` default).

---

### Task 1: `ErrorCardState` shared presentational component

**Files:**
- Create: `app/web/src/components/error-card-state.tsx`
- Test: `app/web/src/components/__tests__/error-card-state.test.tsx`

**Interfaces:**
- Consumes: nothing (pure component).
- Produces:
  ```ts
  type ErrorCardVariant = 'missing' | 'dissolving' | 'dark'
  function ErrorCardState(props: {
    variant: ErrorCardVariant
    heading: string
    description: string
    digest?: string
    digestLabel?: string   // default 'reference'
    children: React.ReactNode  // action buttons
  }): React.JSX.Element
  ```
  Rendering contract: heading in an `<h1>`; description as a `<p>`; the digest line renders **only** when `digest` is truthy, as text `{digestLabel}: {digest}`; `children` render in an actions row. Variant symbol: `missing` → `?` (gold), `dissolving`/`dark` → `✦` (accent).

- [ ] **Step 1: Write the failing test**

```tsx
// app/web/src/components/__tests__/error-card-state.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ErrorCardState } from '../error-card-state'

describe('ErrorCardState', () => {
  it('renders heading, description, and action children', () => {
    render(
      <ErrorCardState variant="missing" heading="Not found" description="It vanished">
        <button>Do thing</button>
      </ErrorCardState>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Not found')
    expect(screen.getByText('It vanished')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Do thing' })).toBeInTheDocument()
  })

  it('hides the digest line when no digest is given', () => {
    render(
      <ErrorCardState variant="missing" heading="h" description="d">
        <span />
      </ErrorCardState>,
    )
    expect(screen.queryByText(/reference:/i)).not.toBeInTheDocument()
  })

  it('shows the digest line with the given label when digest is present', () => {
    render(
      <ErrorCardState variant="dark" heading="h" description="d" digest="8f3a1c" digestLabel="reference">
        <span />
      </ErrorCardState>,
    )
    expect(screen.getByText('reference: 8f3a1c')).toBeInTheDocument()
  })

  it('shows a "?" mark for the missing variant', () => {
    render(
      <ErrorCardState variant="missing" heading="h" description="d">
        <span />
      </ErrorCardState>,
    )
    expect(screen.getByText('?')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -w web -- src/components/__tests__/error-card-state.test.tsx`
Expected: FAIL — cannot resolve `../error-card-state`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// app/web/src/components/error-card-state.tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type ErrorCardVariant = 'missing' | 'dissolving' | 'dark'

const VARIANTS: Record<ErrorCardVariant, { symbol: string; color: string }> = {
  missing: { symbol: '?', color: 'text-primary' },
  dissolving: { symbol: '✦', color: 'text-accent' },
  dark: { symbol: '✦', color: 'text-accent' },
}

export function ErrorCardState({
  variant,
  heading,
  description,
  digest,
  digestLabel = 'reference',
  children,
}: {
  variant: ErrorCardVariant
  heading: string
  description: string
  digest?: string
  digestLabel?: string
  children: ReactNode
}) {
  const { symbol, color } = VARIANTS[variant]
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-6 py-16 text-center">
      {/* Vanished card motif */}
      <div className="relative mb-6 inline-block">
        <div
          className={cn(
            'relative grid h-56 w-40 place-items-center overflow-hidden rounded-2xl border border-border',
            'shadow-[0_18px_42px_rgba(0,0,0,0.55)]',
            variant === 'dissolving' && '[mask-image:linear-gradient(115deg,#000_55%,transparent_92%)]',
          )}
          style={{
            backgroundImage:
              'repeating-linear-gradient(135deg,#1d1942 0 9px,#191537 9px 18px)',
          }}
        >
          <div className="pointer-events-none absolute inset-4 rounded-lg border border-dashed border-[#3a3568]" />
          <span
            className={cn('text-5xl [filter:drop-shadow(0_0_18px_rgba(232,178,58,0.5))]', color)}
          >
            {symbol}
          </span>
        </div>
        <span className="absolute -left-3 -top-2 text-lg text-primary [filter:drop-shadow(0_0_8px_rgba(246,213,139,0.85))]">
          ✦
        </span>
      </div>

      <h1 className="text-xl font-semibold text-foreground">{heading}</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{children}</div>

      {digest ? (
        <p className="mt-4 font-mono text-xs text-muted-foreground/70">
          {digestLabel}: {digest}
        </p>
      ) : null}
    </main>
  )
}

export default ErrorCardState
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm test -w web -- src/components/__tests__/error-card-state.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/web/src/components/error-card-state.tsx app/web/src/components/__tests__/error-card-state.test.tsx
git commit -m "feat(web): add ErrorCardState presentational component"
```

---

### Task 2: `errors` i18n namespace

**Files:**
- Modify: `app/web/messages/en.json`
- Modify: `app/web/messages/de.json`

**Interfaces:**
- Produces: message namespace `errors` with keys `notFound.{heading,description,searchCta,homeCta}`, `runtime.{heading,description,retryCta,homeCta}`, `digestLabel`. Consumed by Tasks 3 & 4.

- [ ] **Step 1: Add the `errors` namespace to `en.json`**

Add this as a new top-level property (add a comma after the current last top-level key, then insert):

```json
  "errors": {
    "notFound": {
      "heading": "This card isn't in the archive",
      "description": "We searched the collection but couldn't find that page.",
      "searchCta": "Search cards",
      "homeCta": "Go home"
    },
    "runtime": {
      "heading": "The spell fizzled",
      "description": "Something went wrong loading this page. Try casting it again.",
      "retryCta": "Try again",
      "homeCta": "Go home"
    },
    "digestLabel": "reference"
  }
```

- [ ] **Step 2: Add the parallel `errors` namespace to `de.json`**

```json
  "errors": {
    "notFound": {
      "heading": "Diese Karte ist nicht im Archiv",
      "description": "Wir haben die Sammlung durchsucht, aber diese Seite nicht gefunden.",
      "searchCta": "Karten suchen",
      "homeCta": "Zur Startseite"
    },
    "runtime": {
      "heading": "Der Zauber ist misslungen",
      "description": "Beim Laden dieser Seite ist etwas schiefgelaufen. Versuch es noch einmal.",
      "retryCta": "Erneut versuchen",
      "homeCta": "Zur Startseite"
    },
    "digestLabel": "Referenz"
  }
```

- [ ] **Step 3: Verify both files are valid JSON with matching keys**

Run:
```bash
cd app/web && node -e "const e=require('./messages/en.json'),d=require('./messages/de.json'); const keys=o=>Object.keys(o.errors.notFound).concat(Object.keys(o.errors.runtime)); if(JSON.stringify(keys(e))!==JSON.stringify(keys(d))) throw new Error('key mismatch'); console.log('errors namespace OK', keys(e).length, 'leaf keys each')"
```
Expected: `errors namespace OK 8 leaf keys each` (no JSON parse error).

- [ ] **Step 4: Commit**

```bash
git add app/web/messages/en.json app/web/messages/de.json
git commit -m "feat(web): add errors i18n namespace (en + de)"
```

---

### Task 3: `not-found.tsx` (404)

**Files:**
- Create: `app/web/src/app/[locale]/not-found.tsx`
- Test: `app/web/src/app/[locale]/__tests__/not-found.test.tsx`

**Interfaces:**
- Consumes: `ErrorCardState` (Task 1), `errors.notFound.*` messages (Task 2), `Link` from `@/../i18n/navigation`, `Button`.
- Produces: `export function NotFound()` (async) + `export default`.

- [ ] **Step 1: Write the failing test**

The component is an async server component that calls `getTranslations`. Mock `next-intl/server` to resolve copy from `en.json`, and mock the locale-aware `Link` to a plain anchor.

```tsx
// app/web/src/app/[locale]/__tests__/not-found.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/../i18n/navigation', () => ({
  Link: (props: { href: string; children: React.ReactNode }) => (
    <a href={props.href}>{props.children}</a>
  ),
}))

vi.mock('next-intl/server', () => ({
  getTranslations: async (ns: string) => {
    const en = (await import('@/../messages/en.json')).default as Record<string, any>
    const dict = ns.split('.').reduce<any>((o, k) => o[k], en)
    return (key: string) => key.split('.').reduce<any>((o, k) => o[k], dict)
  },
}))

import { NotFound } from '../not-found'

describe('not-found page', () => {
  it('renders the 404 heading and both CTAs with correct hrefs', async () => {
    render(await NotFound())
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      "This card isn't in the archive",
    )
    expect(screen.getByRole('link', { name: /search cards/i })).toHaveAttribute('href', '/search')
    expect(screen.getByRole('link', { name: /go home/i })).toHaveAttribute('href', '/')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -w web -- "src/app/[locale]/__tests__/not-found.test.tsx"`
Expected: FAIL — cannot resolve `../not-found`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// app/web/src/app/[locale]/not-found.tsx
import { getTranslations } from 'next-intl/server'
import { Home, Search } from 'lucide-react'
import { Link } from '@/../i18n/navigation'
import { Button } from '@/components/ui/button'
import { ErrorCardState } from '@/components/error-card-state'

export async function NotFound() {
  const t = await getTranslations('errors')
  return (
    <ErrorCardState
      variant="missing"
      heading={t('notFound.heading')}
      description={t('notFound.description')}
    >
      <Button asChild>
        <Link href="/search">
          <Search className="size-4" />
          {t('notFound.searchCta')}
        </Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/">
          <Home className="size-4" />
          {t('notFound.homeCta')}
        </Link>
      </Button>
    </ErrorCardState>
  )
}

export default NotFound
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm test -w web -- "src/app/[locale]/__tests__/not-found.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/web/src/app/[locale]/not-found.tsx" "app/web/src/app/[locale]/__tests__/not-found.test.tsx"
git commit -m "feat(web): add localized 404 not-found page"
```

---

### Task 4: `error.tsx` (runtime error boundary)

**Files:**
- Create: `app/web/src/app/[locale]/error.tsx`
- Test: `app/web/src/app/[locale]/__tests__/error.test.tsx`

**Interfaces:**
- Consumes: `ErrorCardState` (Task 1), `errors.runtime.*` + `errors.digestLabel` (Task 2), `Link`, `Button`, client `useTranslations`.
- Produces: `export function RuntimeError({ error, reset })` + `export default`. Props: `error: Error & { digest?: string }`, `reset: () => void`.

- [ ] **Step 1: Write the failing test**

Client component — test with a real `NextIntlClientProvider` (mirrors `home.test.tsx`) and a mocked locale `Link`.

```tsx
// app/web/src/app/[locale]/__tests__/error.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/../i18n/navigation', () => ({
  Link: (props: { href: string; children: React.ReactNode }) => (
    <a href={props.href}>{props.children}</a>
  ),
}))

import { RuntimeError } from '../error'
import en from '@/../messages/en.json'

function renderError(reset = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <RuntimeError error={Object.assign(new Error('boom'), { digest: '8f3a1c' })} reset={reset} />
    </NextIntlClientProvider>,
  )
  return reset
}

describe('runtime error page', () => {
  it('renders the runtime heading and the digest', () => {
    renderError()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The spell fizzled')
    expect(screen.getByText('reference: 8f3a1c')).toBeInTheDocument()
  })

  it('calls reset when "Try again" is clicked', async () => {
    const reset = renderError()
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(reset).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -w web -- "src/app/[locale]/__tests__/error.test.tsx"`
Expected: FAIL — cannot resolve `../error`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// app/web/src/app/[locale]/error.tsx
'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Home, RotateCw } from 'lucide-react'
import { Link } from '@/../i18n/navigation'
import { Button } from '@/components/ui/button'
import { ErrorCardState } from '@/components/error-card-state'

export function RuntimeError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('errors')

  useEffect(() => {
    // Surface runtime errors in logs (Next.js convention).
    console.error(error)
  }, [error])

  return (
    <ErrorCardState
      variant="dissolving"
      heading={t('runtime.heading')}
      description={t('runtime.description')}
      digest={error.digest}
      digestLabel={t('digestLabel')}
    >
      <Button onClick={reset}>
        <RotateCw className="size-4" />
        {t('runtime.retryCta')}
      </Button>
      <Button asChild variant="outline">
        <Link href="/">
          <Home className="size-4" />
          {t('runtime.homeCta')}
        </Link>
      </Button>
    </ErrorCardState>
  )
}

export default RuntimeError
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm test -w web -- "src/app/[locale]/__tests__/error.test.tsx"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/web/src/app/[locale]/error.tsx" "app/web/src/app/[locale]/__tests__/error.test.tsx"
git commit -m "feat(web): add localized runtime error boundary"
```

---

### Task 5: `global-error.tsx` (root crash fallback)

**Files:**
- Create: `app/web/src/app/global-error.tsx`
- Test: `app/web/src/app/__tests__/global-error.test.tsx`

**Interfaces:**
- Consumes: `ErrorCardState` (Task 1), `Button`. NO next-intl, NO locale `Link`.
- Produces: `export function GlobalErrorContent({ error })` (pure, no `<html>`) + `export default function GlobalError({ error, reset })` (wraps content in its own `<html>`/`<body>`). Hardcoded English. Test targets `GlobalErrorContent` to avoid invalid `<html>`-in-`<div>` nesting.

- [ ] **Step 1: Write the failing test**

```tsx
// app/web/src/app/__tests__/global-error.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { GlobalErrorContent } from '../global-error'

describe('global error content', () => {
  it('renders the hardcoded English heading and the reload control', () => {
    render(<GlobalErrorContent error={Object.assign(new Error('x'), { digest: '9z' })} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Something went dark')
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
    expect(screen.getByText('reference: 9z')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm test -w web -- src/app/__tests__/global-error.test.tsx`
Expected: FAIL — cannot resolve `../global-error`.

- [ ] **Step 3: Write minimal implementation**

Note: `global-error.tsx` sits at `src/app/`, so it imports `./globals.css` (sibling), not `../globals.css`.

```tsx
// app/web/src/app/global-error.tsx
'use client'

import { RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ErrorCardState } from '@/components/error-card-state'
import './globals.css'

export function GlobalErrorContent({ error }: { error: Error & { digest?: string } }) {
  return (
    <ErrorCardState
      variant="dark"
      heading="Something went dark"
      description="The app hit an unexpected error. Reloading usually fixes it."
      digest={error.digest}
      digestLabel="reference"
    >
      <Button onClick={() => window.location.reload()}>
        <RotateCw className="size-4" />
        Reload
      </Button>
    </ErrorCardState>
  )
}

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground font-sans antialiased">
        <GlobalErrorContent error={error} />
      </body>
    </html>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm test -w web -- src/app/__tests__/global-error.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/web/src/app/global-error.tsx app/web/src/app/__tests__/global-error.test.tsx
git commit -m "feat(web): add self-contained global-error fallback"
```

---

### Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full web test suite**

Run: `cd app && npm test -w web`
Expected: PASS — all suites green, including the four new files.

- [ ] **Step 2: Typecheck all workspaces**

Run: `cd app && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Lint the web workspace**

Run: `cd app && npm run lint -w web`
Expected: no errors.

- [ ] **Step 4: Build the web app**

Run: `cd app && npm run build -w web`
Expected: build succeeds; `/[locale]/not-found`, `/[locale]/error`, and `global-error` compile without warnings about missing default exports.

> If the build needs env vars (`NEXT_PUBLIC_IMAGE_BASE_URL` etc.), reuse the values from `.env` / CI. This step is optional if a full build isn't feasible locally; the test + typecheck + lint gates are the required ones.

---

## Self-Review

**Spec coverage:**
- 404 / runtime / global surfaces → Tasks 3 / 4 / 5. ✓
- Shared pure `ErrorCardState` with variants → Task 1. ✓
- Copy + actions per the spec table → Tasks 3–5 (verbatim strings). ✓
- i18n `errors` namespace (en + de), global excluded → Task 2 + Task 5 (hardcoded English). ✓
- Digest on runtime + global → Tasks 4 & 5. ✓
- Testing per spec (component + not-found + error + minimal global) → each task's test steps. ✓
- Deferred items (root not-found, animated art, external reporting) → intentionally not tasked. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows full code. ✓

**Type consistency:** `ErrorCardVariant` values `'missing' | 'dissolving' | 'dark'` used consistently (missing→404, dissolving→runtime, dark→global). `ErrorCardState` prop names (`variant`, `heading`, `description`, `digest`, `digestLabel`, `children`) match every call site. `error: Error & { digest?: string }` and `reset: () => void` consistent across Tasks 4 & 5. Named+default export convention applied to all route components. ✓
