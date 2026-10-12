# Sign-in and register card fan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `/login` and `/register` as the approved "B3" design: a decorative fan of
two real cards plus the Revelio card, tucked behind a form card on desktop, and a boxless
form under a whole fan on phones.

**Architecture:** A cached, never-throwing server loader (`lib/server/auth-fan.ts`) turns two
fixed card ids into thumbnail URLs; the two auth pages pass them to `AuthCard`, which renders a
new presentational `AuthCardFan` above `AuthForm`. `AuthForm` owns the card chrome (so its
existing cross-link tests keep passing) and gains a centred heading block with a tagline. The
auth flow itself is untouched.

**Tech Stack:** Next.js 16 App Router, React 19, next-intl, Tailwind v4, Vitest +
Testing Library, `@revelio/db` (`getCardViews`), `@revelio/core` (`imageUrl`, `thumbKey`).

**Spec:** `docs/superpowers/specs/2026-10-06-auth-card-fan-design.md`

## Global Constraints

- All commands run from `app/` (npm workspaces root); toolchain is under `/usr/local/bin`
  (`/usr/local/bin/npm`), signing needs `git -c gpg.program=/opt/homebrew/bin/gpg commit`.
- Work on branch `feat/auth-card-fan` (already created; the spec is committed there). Never commit to `main`.
- Conventional Commits, scope `auth` inside `web` (e.g. `feat(auth): ...`); no tool attribution.
- Every user-facing string comes from `messages/en.json` + `messages/de.json`.
- Code comments ASCII only (no em-dashes, no unicode arrows).
- `type` aliases, not `interface`; `import type` for type-only imports.
- Card images are displayed via `thumbKey` (300 px), never `imageKey`.
- Button labels stay `Login` / `Register`; headings, subtitles, terms notice and code step copy unchanged.
- No glow, no gradient, no animation on the fan; the fan is `aria-hidden`, `alt=""`, `pointer-events-none`.
- The Revelio card uses `var(--dark-background)` and `var(--dark-primary)` so it is midnight/gold in both themes.
- Fan cards: 136 x 190 px from `sm` up (fan box 150 px, cards overflow behind the form card);
  88 x 123 px below `sm`, shown whole.
- Below `sm` the form has no card chrome (no border, background, radius, padding, shadow).
- Fan card ids, in slot order: `bs-111-wingardium-leviosa`, `poa-71-lumos`.
- `auth.tagline`: en `Your collection, revealed`, de `Deine Sammlung, enthüllt`.

## Review Focus

- **Database down or `DATABASE_URL` unset**: `/login` must still render (fan shows only the Revelio card). Pinned in Task 2 (`getDb` throwing, `getCardViews` rejecting).
- **`NEXT_PUBLIC_IMAGE_BASE_URL` unset**: no relative, broken image URLs; the loader returns `[]`. Pinned in Task 2.
- **A card exists but has no image (`imageVersion: null`) or is missing from the result**: it is skipped, not rendered as a broken image. Pinned in Task 2.
- **`getCardViews` returns its record in a different key order**: slot order still follows `AUTH_FAN_CARD_IDS`. Pinned in Task 2.
- **A 320 px phone and the tallest step (register with both field errors shown)**: nothing overflows horizontally. Pinned in Task 5's screenshot pass at 320 px.

---

### Task 1: The `auth.tagline` string

**Files:**
- Modify: `app/web/messages/en.json` (the `"auth"` object, after `"registerSubtitle"`)
- Modify: `app/web/messages/de.json` (same place)
- Test: `app/web/src/components/auth/__tests__/auth-i18n.test.ts`

**Interfaces:**
- Produces: message key `auth.tagline`, read in Task 4 as `t('tagline')` with `useTranslations('auth')`.

- [ ] **Step 1: Write the failing test** - append inside the existing `describe('auth i18n', ...)`:

```ts
  it('carries the tagline above the auth heading in both locales', () => {
    expect(en.auth.tagline).toBe('Your collection, revealed')
    expect(de.auth.tagline).toBe('Deine Sammlung, enthüllt')
  })
```

- [ ] **Step 2: Run it to see it fail**

Run: `/usr/local/bin/npm test -w web -- src/components/auth/__tests__/auth-i18n.test.ts`
Expected: FAIL (`expected undefined to be 'Your collection, revealed'`).

- [ ] **Step 3: Add the keys**

In `messages/en.json`, inside `"auth"`, after the `"registerSubtitle"` line:

```json
    "tagline": "Your collection, revealed",
```

In `messages/de.json`, inside `"auth"`, after its `"registerSubtitle"` line:

```json
    "tagline": "Deine Sammlung, enthüllt",
```

- [ ] **Step 4: Run it to see it pass**

Run: `/usr/local/bin/npm test -w web -- src/components/auth/__tests__/auth-i18n.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/web/messages/en.json app/web/messages/de.json app/web/src/components/auth/__tests__/auth-i18n.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(auth): add the tagline string for the auth heading"
```

---

### Task 2: The fan image loader

**Files:**
- Create: `app/web/src/lib/server/auth-fan.ts`
- Test: `app/web/src/lib/server/__tests__/auth-fan.test.ts`

**Interfaces:**
- Consumes: `getCardViews(db: DB, ids: string[]): Promise<Record<string, { imageVersion: number | null; ... }>>` from `@revelio/db`; `getDb()` from `@/lib/server/db`; `imageUrl(base, key)` and `thumbKey(id, version)` from `@revelio/core`.
- Produces: `export const AUTH_FAN_CARD_IDS: readonly string[]` and `export async function getAuthFanImages(): Promise<string[]>` - 0 to 2 absolute thumbnail URLs, in `AUTH_FAN_CARD_IDS` order. Never throws.

- [ ] **Step 1: Write the failing tests**

`app/web/src/lib/server/__tests__/auth-fan.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getCardViews = vi.fn()
const getDb = vi.fn(() => ({ __db: true }))
vi.mock('@revelio/db', () => ({ getCardViews: (...a: unknown[]) => getCardViews(...a) }))
vi.mock('@/lib/server/db', () => ({ getDb: () => getDb() }))
// unstable_cache needs Next's incremental cache; a pass-through is enough here.
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))

import { AUTH_FAN_CARD_IDS, getAuthFanImages } from '../auth-fan'

const BASE = 'https://img.test/'
const LEVIOSA = 'https://img.test/cards/thumb/bs-111-wingardium-leviosa.3.webp'
const LUMOS = 'https://img.test/cards/thumb/poa-71-lumos.7.webp'

// Braces matter: a function returned from beforeEach runs as teardown.
beforeEach(() => {
  getCardViews.mockReset()
  getDb.mockReset()
  getDb.mockImplementation(() => ({ __db: true }))
  vi.stubEnv('NEXT_PUBLIC_IMAGE_BASE_URL', BASE)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getAuthFanImages', () => {
  it('asks for the two fan cards', async () => {
    getCardViews.mockResolvedValue({})
    await getAuthFanImages()
    expect(getCardViews).toHaveBeenCalledWith({ __db: true }, [...AUTH_FAN_CARD_IDS])
    expect(AUTH_FAN_CARD_IDS).toEqual(['bs-111-wingardium-leviosa', 'poa-71-lumos'])
  })

  it('returns thumbnail urls in slot order, whatever order the record comes back in', async () => {
    getCardViews.mockResolvedValue({
      'poa-71-lumos': { imageVersion: 7 },
      'bs-111-wingardium-leviosa': { imageVersion: 3 },
    })
    expect(await getAuthFanImages()).toEqual([LEVIOSA, LUMOS])
  })

  it('skips a card with no image and a card that is missing', async () => {
    getCardViews.mockResolvedValue({ 'bs-111-wingardium-leviosa': { imageVersion: null } })
    expect(await getAuthFanImages()).toEqual([])

    getCardViews.mockResolvedValue({ 'poa-71-lumos': { imageVersion: 7 } })
    expect(await getAuthFanImages()).toEqual([LUMOS])
  })

  it('returns nothing when the database read fails', async () => {
    getCardViews.mockRejectedValue(new Error('connection refused'))
    expect(await getAuthFanImages()).toEqual([])
  })

  it('returns nothing when there is no database configured', async () => {
    getDb.mockImplementation(() => {
      throw new Error('DATABASE_URL is required')
    })
    expect(await getAuthFanImages()).toEqual([])
  })

  it('returns nothing without an image base, rather than relative urls', async () => {
    vi.stubEnv('NEXT_PUBLIC_IMAGE_BASE_URL', '')
    getCardViews.mockResolvedValue({ 'poa-71-lumos': { imageVersion: 7 } })
    expect(await getAuthFanImages()).toEqual([])
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `/usr/local/bin/npm test -w web -- src/lib/server/__tests__/auth-fan.test.ts`
Expected: FAIL (`Failed to resolve import "../auth-fan"`).

- [ ] **Step 3: Write the module**

`app/web/src/lib/server/auth-fan.ts`:

```ts
import 'server-only'
import { unstable_cache } from 'next/cache'
import { imageUrl, thumbKey } from '@revelio/core'
import { getCardViews } from '@revelio/db'
import { getDb } from '@/lib/server/db'

// The two real cards fanned behind the sign-in and register forms, in slot order
// (left, middle). Both are upright Charms spells: most other cards are stored
// sideways (every character, and e.g. Norbert and Golden Snitch), which reads as
// a mistake in a fan. Lumos is a light charm, which suits the "reveal" brand.
export const AUTH_FAN_CARD_IDS: readonly string[] = ['bs-111-wingardium-leviosa', 'poa-71-lumos']

async function loadAuthFanImages(): Promise<string[]> {
  const base = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''
  if (!base) return []
  const views = await getCardViews(getDb(), [...AUTH_FAN_CARD_IDS])
  return AUTH_FAN_CARD_IDS.flatMap((id) => {
    const version = views[id]?.imageVersion
    return version == null ? [] : [imageUrl(base, thumbKey(id, version))]
  })
}

// The images only change with an ingest run, so a day is plenty.
const getCachedAuthFanImages = unstable_cache(loadAuthFanImages, ['auth-fan-images'], {
  revalidate: 86_400,
})

/**
 * Thumbnail urls for the auth fan, 0 to 2 of them. The fan is decoration, so a
 * failed read must never fail the sign-in page: any error yields an empty list
 * and the fan draws only the Revelio card.
 */
export async function getAuthFanImages(): Promise<string[]> {
  try {
    return await getCachedAuthFanImages()
  } catch {
    return []
  }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `/usr/local/bin/npm test -w web -- src/lib/server/__tests__/auth-fan.test.ts src/lib/server/__tests__/server-only-guard.test.ts`
Expected: PASS (6 tests in auth-fan; the server-only guard still passes because the file starts with `import 'server-only'`).

- [ ] **Step 5: Commit**

```bash
git add app/web/src/lib/server/auth-fan.ts app/web/src/lib/server/__tests__/auth-fan.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(auth): load the fan card thumbnails, never failing the page"
```

---

### Task 3: The `AuthCardFan` component

**Files:**
- Create: `app/web/src/components/auth/auth-card-fan.tsx`
- Test: `app/web/src/components/auth/__tests__/auth-card-fan.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks at runtime (it takes the urls as a prop).
- Produces: `export function AuthCardFan({ images }: AuthCardFanProps)` with `type AuthCardFanProps = { images: string[] }`. Root element carries `data-slot="auth-card-fan"` and `aria-hidden="true"`.

- [ ] **Step 1: Write the failing tests**

`app/web/src/components/auth/__tests__/auth-card-fan.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/image', () => ({
  default: (p: Record<string, unknown>) => <img alt={p.alt as string} src={p.src as string} />,
}))

import { AuthCardFan } from '@/components/auth/auth-card-fan'

const A = 'https://img.test/cards/thumb/a.1.webp'
const B = 'https://img.test/cards/thumb/b.1.webp'

function fan(container: HTMLElement) {
  return container.querySelector('[data-slot="auth-card-fan"]') as HTMLElement
}

describe('AuthCardFan', () => {
  it('draws each card image plus the Revelio mark', () => {
    const { container } = render(<AuthCardFan images={[A, B]} />)
    const srcs = [...fan(container).querySelectorAll('img')].map((i) => i.getAttribute('src'))
    expect(srcs).toEqual([A, B, '/revelio-icon.svg'])
  })

  it('still draws the Revelio card with no card images', () => {
    const { container } = render(<AuthCardFan images={[]} />)
    const srcs = [...fan(container).querySelectorAll('img')].map((i) => i.getAttribute('src'))
    expect(srcs).toEqual(['/revelio-icon.svg'])
  })

  it('is hidden from assistive tech and has no empty-alt gaps', () => {
    const { container } = render(<AuthCardFan images={[A, B]} />)
    expect(fan(container)).toHaveAttribute('aria-hidden', 'true')
    for (const img of fan(container).querySelectorAll('img')) {
      expect(img).toHaveAttribute('alt', '')
    }
  })

  it('ignores more than two images rather than stacking them in one slot', () => {
    const { container } = render(<AuthCardFan images={[A, B, A]} />)
    expect(fan(container).querySelectorAll('img')).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `/usr/local/bin/npm test -w web -- src/components/auth/__tests__/auth-card-fan.test.tsx`
Expected: FAIL (`Failed to resolve import "@/components/auth/auth-card-fan"`).

- [ ] **Step 3: Write the component**

`app/web/src/components/auth/auth-card-fan.tsx`:

```tsx
import Image from 'next/image'
import { cn } from '@/lib/utils'

type AuthCardFanProps = {
  images: string[]
}

// Slot geometry, left to right. Below `sm` the cards are small and drawn whole;
// from `sm` up they are full size and their lower part runs out of the 150px box,
// behind the form card (which sits above at z-10). Positions are relative to a
// centred box exactly as wide as the fan (206px / 306px).
const SIZE = 'h-[123px] w-[88px] sm:h-[190px] sm:w-[136px]'
const IMAGE_SLOTS = [
  'left-0 top-[18px] -rotate-14 sm:top-[26px]',
  'left-[59px] top-[4px] -rotate-2 sm:left-[85px] sm:top-0',
]
const REVELIO_SLOT = 'left-[118px] top-[14px] rotate-11 sm:left-[170px] sm:top-[18px]'

// Decoration above the sign-in and register forms: two real cards and the
// Revelio card. Hidden from assistive tech, not interactive, never animated.
// The Revelio card reads the --dark-* tokens, which :root defines in every
// theme, so it stays midnight and gold on the light theme too, like the app icon.
export function AuthCardFan({ images }: AuthCardFanProps) {
  return (
    <div
      data-slot="auth-card-fan"
      aria-hidden="true"
      className="pointer-events-none relative mx-auto h-[150px] w-[206px] shrink-0 select-none sm:w-[306px]"
    >
      {images.slice(0, IMAGE_SLOTS.length).map((src, i) => (
        <div
          key={src}
          className={cn('absolute overflow-hidden rounded-md shadow-lg sm:rounded-lg', SIZE, IMAGE_SLOTS[i])}
        >
          <Image src={src} alt="" fill sizes="136px" className="object-cover" />
        </div>
      ))}
      <div
        className={cn(
          'absolute flex items-center justify-center rounded-md border-2 border-[var(--dark-primary)] bg-[var(--dark-background)] shadow-lg sm:items-start sm:rounded-lg sm:border-[3px] sm:pt-7',
          SIZE,
          REVELIO_SLOT,
        )}
      >
        <Image src="/revelio-icon.svg" alt="" width={68} height={68} className="size-12 sm:size-[70px]" />
      </div>
    </div>
  )
}
```

The fourth test passes three urls and expects three images (two slots plus the mark), proving the slice.

- [ ] **Step 4: Run them to see them pass**

Run: `/usr/local/bin/npm test -w web -- src/components/auth/__tests__/auth-card-fan.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/web/src/components/auth/auth-card-fan.tsx app/web/src/components/auth/__tests__/auth-card-fan.test.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(auth): add the decorative card fan"
```

---

### Task 4: Wire the layout - pages, `AuthCard`, `AuthForm`

**Files:**
- Modify: `app/web/src/app/[locale]/login/page.tsx`
- Modify: `app/web/src/app/[locale]/register/page.tsx`
- Modify: `app/web/src/components/auth/auth-card.tsx`
- Modify: `app/web/src/components/auth/auth-form.tsx` (the returned JSX's outer `<div>`, the heading block, the `codeSent` paragraph, the cross-link paragraph)
- Test: `app/web/src/components/auth/__tests__/auth-card.test.tsx`, `app/web/src/components/auth/__tests__/auth-form.test.tsx`

**Interfaces:**
- Consumes: `getAuthFanImages(): Promise<string[]>` (Task 2), `AuthCardFan({ images })` (Task 3), `t('tagline')` (Task 1).
- Produces: `AuthCard({ mode, redirectTo, fanImages }: { mode: 'login' | 'register'; redirectTo?: string | null; fanImages?: string[] })`.

- [ ] **Step 1: Write the failing tests**

Replace the body of `app/web/src/components/auth/__tests__/auth-card.test.tsx` below its imports with:

```tsx
vi.mock('next/image', () => ({
  default: (p: Record<string, unknown>) => <img alt={p.alt as string} src={p.src as string} />,
}))

describe('AuthCard', () => {
  it('renders the form for the given mode', () => {
    render(<AuthCard mode="login" />)
    expect(screen.getByTestId('auth-form')).toHaveTextContent('login')
  })

  it('draws the fan above the form with the images it is given', () => {
    const { container } = render(<AuthCard mode="register" fanImages={['https://img.test/a.webp']} />)
    const fan = container.querySelector('[data-slot="auth-card-fan"]')
    expect(fan).not.toBeNull()
    expect(fan!.compareDocumentPosition(screen.getByTestId('auth-form')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(fan!.querySelectorAll('img')).toHaveLength(2)
  })

  it('draws only the Revelio card when no images are passed', () => {
    const { container } = render(<AuthCard mode="login" />)
    expect(container.querySelectorAll('[data-slot="auth-card-fan"] img')).toHaveLength(1)
  })
})
```

(Keep the existing `vi.mock('@/components/auth/auth-form', ...)` and the `AuthCard` import; delete the old `renderCard` helper.)

In `app/web/src/components/auth/__tests__/auth-form.test.tsx`, add one test inside `describe('AuthForm', ...)`, using the file's existing `renderForm(mode)` helper:

```tsx
  it('shows the tagline above the heading, inside the form card', () => {
    renderForm('login')
    const tagline = screen.getByText('Your collection, revealed')
    const heading = screen.getByRole('heading', { level: 1 })
    expect(tagline.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(tagline.closest('[data-slot="auth-form-card"]')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Register' }).closest('[data-slot="auth-form-card"]')).toBeNull()
  })
```


- [ ] **Step 2: Run them to see them fail**

Run: `/usr/local/bin/npm test -w web -- src/components/auth/__tests__/`
Expected: FAIL - no `auth-card-fan` slot in `AuthCard`, no tagline in `AuthForm`.

- [ ] **Step 3: Restyle `AuthForm`**

In `app/web/src/components/auth/auth-form.tsx`:

1. Below the imports, after the existing top-of-file comment block and before `export function AuthForm`, add:

```tsx
// The card chrome only applies from `sm` up. On a phone a box costs width - a
// second gutter inside the page's - and frames a form that already fills the
// screen, so below `sm` the form sits directly on the page. z-10 keeps it above
// the fan cards that run behind its top edge.
const FORM_CARD =
  'relative z-10 sm:rounded-xl sm:border sm:border-border sm:bg-card sm:p-8 sm:shadow-[0_-10px_28px_rgb(19_18_42/0.22)]'
```

2. Replace the returned outer `<div>` and the heading block:

```tsx
  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-foreground">
        {register ? t('registerTitle') : t('title')}
      </h1>
      {step === 'email' && (
        <p className="mb-6 text-base text-muted-foreground">
          {register
            ? t('registerSubtitle', { brand: BRAND_NAME })
            : t('subtitle', { brand: BRAND_NAME })}
        </p>
      )}
```

with:

```tsx
  return (
    <>
    <div data-slot="auth-form-card" className={FORM_CARD}>
      <div className="mb-6 text-center">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-primary-ink">
          {t('tagline')}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {register ? t('registerTitle') : t('title')}
        </h1>
        {step === 'email' && (
          <p className="mt-2 text-base text-muted-foreground">
            {register
              ? t('registerSubtitle', { brand: BRAND_NAME })
              : t('subtitle', { brand: BRAND_NAME })}
          </p>
        )}
      </div>
```

3. Centre the code-step sentence to match the heading above it: change
`<p className="text-base text-muted-foreground">{t('codeSent', { email })}</p>` to
`<p className="text-center text-base text-muted-foreground">{t('codeSent', { email })}</p>`.

4. Close the card before the cross-link and move the cross-link out of it. The current tail is:

```tsx
      )}
      <p className="mt-6 text-center text-base text-muted-foreground">
```

Change it to:

```tsx
      )}
    </div>
      <p className="mt-6 border-t border-border pt-4 text-center text-base text-muted-foreground sm:border-0 sm:pt-0">
```

and the final `    </div>\n  )` of the component becomes `    </>\n  )`. Re-indent the block one level so the JSX nesting reads correctly (Prettier is not run in CI, but keep it tidy by hand).

- [ ] **Step 4: Restyle `AuthCard`**

Replace `app/web/src/components/auth/auth-card.tsx` entirely:

```tsx
'use client'
import { AuthCardFan } from '@/components/auth/auth-card-fan'
import { AuthForm } from '@/components/auth/auth-form'

// Centred single-column auth layout for /login and /register, framed by the
// global SiteHeader/SiteFooter: a decorative fan of cards, then the form. From
// `sm` up the form sits in a card that overlaps the fan's lower half; below it
// the form is boxless and the fan is drawn whole (AuthForm owns that chrome).
export function AuthCard({
  mode,
  redirectTo,
  fanImages = [],
}: {
  mode: 'login' | 'register'
  redirectTo?: string | null
  fanImages?: string[]
}) {
  return (
    <main className="mx-auto flex w-full max-w-[430px] flex-col px-4 py-6 sm:px-0 md:py-12">
      <AuthCardFan images={fanImages} />
      <AuthForm mode={mode} redirectTo={redirectTo} />
    </main>
  )
}
```

`px-4` is the 16 px phone gutter; from `sm` the 430 px column is narrower than the viewport, so it needs none.

- [ ] **Step 5: Load the images in both pages**

In `app/web/src/app/[locale]/login/page.tsx`, add the import

```tsx
import { getAuthFanImages } from '@/lib/server/auth-fan'
```

and replace the function body's last two lines with:

```tsx
  // Validated here, on the server, so an untrusted value never reaches the client.
  const [params, fanImages] = await Promise.all([searchParams, getAuthFanImages()])
  const redirectTo = safeRedirectPath(params.redirect)
  return <AuthCard mode="login" redirectTo={redirectTo} fanImages={fanImages} />
```

Make the identical change in `app/web/src/app/[locale]/register/page.tsx`, with `mode="register"`.

- [ ] **Step 6: Run the tests to see them pass**

Run: `/usr/local/bin/npm test -w web -- src/components/auth/__tests__/`
Expected: PASS - all auth-card, auth-card-fan, auth-form and auth-i18n tests, with the pre-existing auth-form tests unchanged.

- [ ] **Step 7: Typecheck and lint**

Run: `/usr/local/bin/npm run typecheck && /usr/local/bin/npm run lint`
Expected: both exit 0.

- [ ] **Step 8: Commit**

```bash
git add app/web/src/app/[locale]/login/page.tsx app/web/src/app/[locale]/register/page.tsx app/web/src/components/auth/auth-card.tsx app/web/src/components/auth/auth-form.tsx app/web/src/components/auth/__tests__/auth-card.test.tsx app/web/src/components/auth/__tests__/auth-form.test.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(auth): put the sign-in and register forms under a card fan"
```

---

### Task 5: Visual check and full verification

**Files:** none changed unless the check finds a defect (then fix in the owning file and commit as `fix(auth): ...`).

- [ ] **Step 1: Start the stack and the dev server**

```bash
cd app && docker compose up -d postgres meilisearch rustfs
/usr/local/bin/npm run dev -w web
```

Confirm `http://localhost:3000/login` serves. The local DB must have run ingest (cards and images present); if `bs-111-wingardium-leviosa` has no image locally the fan shows only the Revelio card, which is the fallback working, not a bug - say so in the PR.

- [ ] **Step 2: Screenshot the matrix**

With a Playwright script in the scratchpad (import Playwright from the repo's `app/node_modules/playwright` by absolute path; no system Chrome), capture `/login`, `/register` and `/de/register` at widths 1280, 390 and 320, in `colorScheme: 'light'` and `'dark'`. On `/register` at 320 also submit the empty form so both field errors show (Review Focus: the tallest state). Assert in the script that `document.documentElement.scrollWidth <= window.innerWidth` on every shot.

- [ ] **Step 3: Check each shot by eye against the mock**

Desktop: fan cards tucked behind the card's top edge, card has border and background. Phone: no box, fan whole, rule above the cross-link. Light theme: Revelio card still midnight/gold, tagline readable. No horizontal scroll anywhere.

- [ ] **Step 4: Full suite**

Run: `/usr/local/bin/npm test -w web`, `/usr/local/bin/npm run typecheck`, `/usr/local/bin/npm run lint`
Expected: all green; note the web test count for the PR.

- [ ] **Step 5: Open the PR**

Push `feat/auth-card-fan` and open a PR titled `feat(auth): put the sign-in and register forms under a card fan`, body per CLAUDE.md (prose first, `## What changed`, `## Verification` with each command actually run and its result, the screenshot check, a link to the spec and this plan; no `## Deployment` needed - nothing outside the diff).
