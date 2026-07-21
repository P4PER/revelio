# Footer Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-line disclaimer footer with a rich multi-column `SiteFooter` (brand + Browse/Build/About link columns, legal disclaimer, bottom bar) built from shadcn primitives.

**Architecture:** `SiteFooter` stays a synchronous Server Component that reads `GITHUB_URL` from the environment and computes the year at render. Links are shadcn `Button` (`variant="link"`, `asChild`) wrapping the locale-aware `Link`; the external GitHub link is a conditional `<a>`. A tiny `'use client'` `BackToTopButton` handles smooth scroll. All copy is driven by `messages/{en,de}.json` under the `footer` namespace.

**Tech Stack:** Next.js 16 (App Router, React 19), next-intl, shadcn/Radix + Tailwind v4, lucide-react, Vitest + Testing Library.

## Global Constraints

- All app commands run from `app/` (npm workspaces root); the web workspace is `web`.
- Internal navigation MUST use the locale-aware `Link` from `@/../i18n/navigation`, never bare `next/link`.
- Server Actions / server code must never leak secrets to the client. `GITHUB_URL` is a plain (non-`NEXT_PUBLIC_`) server-read env var — read it only in the Server Component.
- Every user-facing string MUST have an entry in **both** `messages/en.json` and `messages/de.json` under `footer`.
- Conventional Commits for commit messages. Docs/prose in English.
- Keep `npm run typecheck` and `npm test -w web` green.

---

### Task 1: Back-to-top button

A small client component that smooth-scrolls to the top of the page, used by the footer bottom bar.

**Files:**
- Create: `app/web/src/components/back-to-top-button.tsx`
- Test: `app/web/src/components/__tests__/back-to-top-button.test.tsx`

**Interfaces:**
- Consumes: shadcn `Button` (`@/components/ui/button`), `ArrowUp` from `lucide-react`.
- Produces: `BackToTopButton({ label }: { label: string })` — a client component rendering a `<button>` with `aria-label={label}` whose click calls `window.scrollTo({ top: 0, behavior: 'smooth' })`.

- [ ] **Step 1: Write the failing test**

```tsx
// app/web/src/components/__tests__/back-to-top-button.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { BackToTopButton } from '../back-to-top-button'

describe('BackToTopButton', () => {
  it('scrolls to the top when clicked', async () => {
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    render(<BackToTopButton label="Back to top" />)
    await userEvent.click(screen.getByRole('button', { name: 'Back to top' }))
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/components/__tests__/back-to-top-button.test.tsx`
Expected: FAIL — cannot resolve `../back-to-top-button`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// app/web/src/components/back-to-top-button.tsx
'use client'
import { ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function BackToTopButton({ label }: { label: string }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <ArrowUp className="size-4" aria-hidden />
    </Button>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- src/components/__tests__/back-to-top-button.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/web/src/components/back-to-top-button.tsx app/web/src/components/__tests__/back-to-top-button.test.tsx
git commit -m "feat(web): add back-to-top button component"
```

---

### Task 2: Footer i18n copy and env documentation

Add every footer string to both locale files and document the `GITHUB_URL` env var. Preserve the existing `footer.disclaimer` verbatim.

**Files:**
- Modify: `app/web/messages/en.json` (`footer` object)
- Modify: `app/web/messages/de.json` (`footer` object)
- Modify: `app/web/.env.example`

**Interfaces:**
- Produces: `footer.*` message keys consumed by Task 3: `tagline`, `browse`, `build`, `about`, `sets`, `discoverDecks`, `randomCard`, `deckBuilder`, `myDecks`, `collection`, `aboutLink`, `contact`, `github`, `copyright` (params `{year}`, `{brand}`), `backToTop`. `disclaimer` is unchanged.

- [ ] **Step 1: Update `en.json` footer object**

Replace the existing `"footer": { "disclaimer": "…" }` block so it reads (keep the existing `disclaimer` string exactly as-is):

```json
  "footer": {
    "tagline": "A searchable database for the Harry Potter Trading Card Game.",
    "browse": "Browse",
    "build": "Build",
    "about": "About",
    "sets": "Sets",
    "discoverDecks": "Discover decks",
    "randomCard": "Random card",
    "deckBuilder": "Deck Builder",
    "myDecks": "My Decks",
    "collection": "Collection",
    "aboutLink": "About",
    "contact": "Contact",
    "github": "GitHub",
    "copyright": "© {year} {brand}",
    "backToTop": "Back to top",
    "disclaimer": "{brand} is an unofficial, non-commercial fan project. Harry Potter, the Harry Potter Trading Card Game, all card names, artwork, and trademarks are the property of Warner Bros. Entertainment Inc., Wizards of the Coast, and their respective owners. {brand} is not affiliated with or endorsed by them."
  }
```

- [ ] **Step 2: Update `de.json` footer object**

Replace the existing `"footer"` block so it reads (keep the existing German `disclaimer` string exactly as-is; German labels reuse the app's existing `nav` vocabulary — `Editionen`, `Sammlung`, `Deck-Builder`, `Meine Decks`, `Decks entdecken`):

```json
  "footer": {
    "tagline": "Eine durchsuchbare Datenbank für das Harry Potter Sammelkartenspiel.",
    "browse": "Entdecken",
    "build": "Erstellen",
    "about": "Über",
    "sets": "Editionen",
    "discoverDecks": "Decks entdecken",
    "randomCard": "Zufällige Karte",
    "deckBuilder": "Deck-Builder",
    "myDecks": "Meine Decks",
    "collection": "Sammlung",
    "aboutLink": "Über uns",
    "contact": "Kontakt",
    "github": "GitHub",
    "copyright": "© {year} {brand}",
    "backToTop": "Nach oben",
    "disclaimer": "{brand} ist ein inoffizielles, nicht-kommerzielles Fan-Projekt. Harry Potter, das Harry Potter Sammelkartenspiel, alle Kartennamen, Illustrationen und Marken sind Eigentum von Warner Bros. Entertainment Inc., Wizards of the Coast und ihren jeweiligen Rechteinhabern. {brand} steht in keiner Verbindung zu ihnen und wird nicht von ihnen unterstützt."
  }
```

- [ ] **Step 3: Document `GITHUB_URL` in `.env.example`**

Add this block under the runtime (non-`NEXT_PUBLIC_`) section of `app/web/.env.example` (near `CONTACT_EMAIL`):

```bash
# Public source-repo URL shown as the footer "GitHub" link. Read server-side.
# If unset, the GitHub footer link is simply not rendered.
GITHUB_URL=https://github.com/P4PER/revelio
```

- [ ] **Step 4: Verify JSON validity + parity**

Run:
```bash
cd app/web && node -e "const e=require('./messages/en.json').footer,d=require('./messages/de.json').footer;const ek=Object.keys(e).sort(),dk=Object.keys(d).sort();if(JSON.stringify(ek)!==JSON.stringify(dk))throw new Error('footer key mismatch');console.log('OK',ek.length,'keys')"
```
Expected: `OK 16 keys` (no error thrown).

- [ ] **Step 5: Commit**

```bash
git add app/web/messages/en.json app/web/messages/de.json app/web/.env.example
git commit -m "feat(web): add footer i18n copy and GITHUB_URL env"
```

---

### Task 3: Add the shadcn Separator primitive

The footer uses shadcn `Separator`, which is not yet vendored into `src/components/ui/`.

**Files:**
- Create: `app/web/src/components/ui/separator.tsx`

**Interfaces:**
- Produces: `Separator` component (Radix separator wrapper) imported by Task 4 from `@/components/ui/separator`.

- [ ] **Step 1: Add the component via the shadcn CLI**

Run from `app/web`:
```bash
cd app/web && npx shadcn@latest add separator
```
Expected: creates `src/components/ui/separator.tsx` and installs `@radix-ui/react-separator` if missing. If the CLI is unavailable offline, create the file manually with this content:

```tsx
'use client'
import * as React from 'react'
import * as SeparatorPrimitive from '@radix-ui/react-separator'
import { cn } from '@/lib/utils'

function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px',
        className,
      )}
      {...props}
    />
  )
}

export { Separator }
```

(If created manually, also run `npm i @radix-ui/react-separator -w web` from `app/`.)

- [ ] **Step 2: Verify it typechecks**

Run: `cd app && npm run typecheck`
Expected: PASS (no errors referencing `separator.tsx`).

- [ ] **Step 3: Commit**

```bash
git add app/web/src/components/ui/separator.tsx app/web/package.json app/package-lock.json
git commit -m "chore(web): add shadcn separator primitive"
```

---

### Task 4: Rewrite the footer

Replace the single-line footer with the multi-column layout, wiring in the i18n copy (Task 2), `Separator` (Task 3), and `BackToTopButton` (Task 1).

**Files:**
- Modify (full rewrite): `app/web/src/components/site-footer.tsx`
- Modify: `app/web/src/components/__tests__/site-footer.test.tsx`

**Interfaces:**
- Consumes: `footer.*` keys (Task 2), `Separator` (Task 3), `BackToTopButton` (Task 1), `BrandMark`, `LanguageSwitcher`, `Button`, locale-aware `Link`, `BRAND_NAME`.
- Produces: `SiteFooter()` — same export name and import path, so `layout.tsx` needs no change.

- [ ] **Step 1: Expand the failing test**

Replace the contents of `app/web/src/components/__tests__/site-footer.test.tsx` with:

```tsx
import { render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { SiteFooter } from '../site-footer'
import en from '@/../messages/en.json'

function renderFooter() {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SiteFooter />
    </NextIntlClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('SiteFooter', () => {
  it('shows the unofficial fan project disclaimer', () => {
    renderFooter()
    expect(screen.getByText(/non-commercial fan project/i)).toBeInTheDocument()
    expect(screen.getByText(/Warner Bros\./)).toBeInTheDocument()
  })

  it('renders the three navigation columns with internal links', () => {
    renderFooter()
    const browse = screen.getByRole('navigation', { name: 'Browse' })
    expect(within(browse).getByRole('link', { name: 'Sets' })).toHaveAttribute('href', '/sets')
    expect(within(browse).getByRole('link', { name: 'Discover decks' })).toHaveAttribute('href', '/decks')
    expect(within(browse).getByRole('link', { name: 'Random card' })).toHaveAttribute('href', '/random')

    const build = screen.getByRole('navigation', { name: 'Build' })
    expect(within(build).getByRole('link', { name: 'Deck Builder' })).toHaveAttribute('href', '/decks/new')
    expect(within(build).getByRole('link', { name: 'My Decks' })).toHaveAttribute('href', '/decks/mine')
    expect(within(build).getByRole('link', { name: 'Collection' })).toHaveAttribute('href', '/collection')

    const about = screen.getByRole('navigation', { name: 'About' })
    expect(within(about).getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about')
    expect(within(about).getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/contact')
  })

  it('renders the copyright and back-to-top control', () => {
    renderFooter()
    expect(screen.getByText(/© \d{4} Revelio/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to top' })).toBeInTheDocument()
  })

  it('hides the GitHub link when GITHUB_URL is unset', () => {
    vi.stubEnv('GITHUB_URL', '')
    renderFooter()
    expect(screen.queryByRole('link', { name: /GitHub/ })).not.toBeInTheDocument()
  })

  it('renders an external GitHub link when GITHUB_URL is set', () => {
    vi.stubEnv('GITHUB_URL', 'https://github.com/P4PER/revelio')
    renderFooter()
    const link = screen.getByRole('link', { name: /GitHub/ })
    expect(link).toHaveAttribute('href', 'https://github.com/P4PER/revelio')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w web -- src/components/__tests__/site-footer.test.tsx`
Expected: FAIL — navigation roles / GitHub link not found (footer still single-line).

- [ ] **Step 3: Rewrite the footer**

Replace the entire contents of `app/web/src/components/site-footer.tsx` with:

```tsx
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowUpRight } from 'lucide-react'
import { Link } from '@/../i18n/navigation'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { BrandMark } from './brand-mark'
import { LanguageSwitcher } from './language-switcher'
import { BackToTopButton } from './back-to-top-button'
import { BRAND_NAME } from '@/lib/brand'

const linkClass = 'h-auto justify-start p-0 text-muted-foreground hover:text-foreground'

function FooterColumn({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav aria-label={label} className="flex flex-col items-start gap-1">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground">
        {label}
      </h2>
      {children}
    </nav>
  )
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button variant="link" size="sm" asChild className={linkClass}>
      <Link href={href}>{children}</Link>
    </Button>
  )
}

export function SiteFooter() {
  const t = useTranslations('footer')
  const year = new Date().getFullYear()
  const githubUrl = process.env.GITHUB_URL

  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto max-w-[76rem] px-6 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="sm:col-span-2 lg:col-span-1">
            <BrandMark />
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">{t('tagline')}</p>
          </div>

          <FooterColumn label={t('browse')}>
            <FooterLink href="/sets">{t('sets')}</FooterLink>
            <FooterLink href="/decks">{t('discoverDecks')}</FooterLink>
            <FooterLink href="/random">{t('randomCard')}</FooterLink>
          </FooterColumn>

          <FooterColumn label={t('build')}>
            <FooterLink href="/decks/new">{t('deckBuilder')}</FooterLink>
            <FooterLink href="/decks/mine">{t('myDecks')}</FooterLink>
            <FooterLink href="/collection">{t('collection')}</FooterLink>
          </FooterColumn>

          <FooterColumn label={t('about')}>
            <FooterLink href="/about">{t('aboutLink')}</FooterLink>
            <FooterLink href="/contact">{t('contact')}</FooterLink>
            {githubUrl && (
              <Button variant="link" size="sm" asChild className={linkClass}>
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${t('github')} (opens in a new tab)`}
                >
                  {t('github')}
                  <ArrowUpRight className="size-3.5" aria-hidden />
                </a>
              </Button>
            )}
          </FooterColumn>
        </div>

        <Separator className="my-8" />

        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('disclaimer', { brand: BRAND_NAME })}
        </p>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {t('copyright', { year, brand: BRAND_NAME })}
          </p>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <BackToTopButton label={t('backToTop')} />
          </div>
        </div>
      </div>
    </footer>
  )
}
```

- [ ] **Step 4: Run the footer test to verify it passes**

Run: `npm test -w web -- src/components/__tests__/site-footer.test.tsx`
Expected: PASS (all cases). Note: the GitHub-link case relies on `process.env.GITHUB_URL` being read at render (`vi.stubEnv` takes effect because the component reads it in the function body).

- [ ] **Step 5: Run the full web test suite + typecheck**

Run:
```bash
npm test -w web
cd app && npm run typecheck
```
Expected: all tests PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add app/web/src/components/site-footer.tsx app/web/src/components/__tests__/site-footer.test.tsx
git commit -m "feat(web): redesign footer into multi-column layout"
```

---

### Task 5: Manual verification

Confirm the footer renders correctly in the running app (layout, links, responsive, GitHub-conditional, language + back-to-top).

**Files:** none (verification only).

- [ ] **Step 1: Set the env var and start the dev server**

```bash
cd app/web && printf '\nGITHUB_URL=https://github.com/P4PER/revelio\n' >> .env.local
cd .. && npm run dev -w web
```

- [ ] **Step 2: Verify in the browser**

Open `http://localhost:3000`, scroll to the footer, and confirm:
- Four-region layout (brand + Browse/Build/About), disclaimer band, bottom bar.
- Every internal link navigates locale-aware (URL keeps `/en` or `/de` prefix); About/Contact 404 (expected — pages not built yet).
- GitHub link opens the repo in a new tab; removing `GITHUB_URL` and restarting hides it.
- Language switcher changes locale; footer copy switches EN↔DE.
- "Back to top" smooth-scrolls to the top.
- Resize to mobile width: columns stack into a single column; nothing overflows horizontally.

- [ ] **Step 3: Confirm and note results**

Record the outcome. If anything is off, loop back to the relevant task before considering the plan complete. (No commit — verification only.)

---

## Self-Review

**Spec coverage:**
- Layout / width `max-w-[76rem]` / brand block / 3 columns / legal band / bottom bar → Task 4.
- Responsive grid → Task 4 (grid classes) + Task 5 (manual check).
- Link map (internal + conditional external GitHub) → Task 4; `GITHUB_URL` env → Task 2.
- a11y (`<nav aria-label>`, headings, external `rel`/`target`, back-to-top button) → Tasks 1 & 4.
- i18n keys (both locales) → Task 2.
- shadcn primitives (`Button`, `Separator`, back-to-top) → Tasks 1, 3, 4.
- Testing → Tasks 1 & 4.
- Out-of-scope `/about` `/contact` pages → intentionally not built; links 404 (accepted).

**Placeholder scan:** No TBD/TODO; all steps contain concrete code and commands.

**Type consistency:** `BackToTopButton({ label })` defined in Task 1 and consumed in Task 4 with the same prop. `Separator` import path matches Task 3. `footer.*` keys used in Task 4 all defined in Task 2 (16 keys, en/de parity checked in Task 2 Step 4).
