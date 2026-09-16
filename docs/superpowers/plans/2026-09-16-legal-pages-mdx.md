# Legal pages as MDX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the bodies of `/privacy` and `/imprint` out of the message catalogs into `web/content/legal/{privacy,imprint}.{en,de}.mdx`, the way `/terms` already works, without changing a single rendered word.

**Architecture:** `/terms` loads a per-locale MDX document through a `satisfies`-checked registry and renders it inside `ProseShell` with `LEGAL_COMPONENTS`, passing site settings in as MDX props. This plan generalizes that registry (`TERMS_DOCUMENTS` becomes `LEGAL_DOCUMENTS`) and the component map (the operator block splits into address, contact, a generic setting value and a conditional wrapper), then ports privacy and imprint onto it. The page title, meta title and the last-updated line stay in the catalogs, as the terms spec decided for `/terms`; the fallback and email label move to a shared `legal` namespace.

**Tech Stack:** Next.js 16 App Router, `@next/mdx` (remark-toc + rehype-slug), `@mdx-js/rollup` in Vitest, next-intl, React 19, Vitest + Testing Library, Playwright chromium for the before/after check.

**Spec:** No spec of its own; this is a content-neutral refactor that extends the MDX decision in `docs/superpowers/specs/2026-09-16-terms-of-service-design.md` ("Content as MDX", "Loader", "Page") and the implementation in `docs/superpowers/plans/2026-09-16-terms-of-service-phase-1-page.md`, Task 1.

## Global Constraints

- All app commands run from `app/`. Node and npm are at `/usr/local/bin`, gh and gpg at `/opt/homebrew/bin`; prefix them if they are not on `PATH`.
- **Zero content change.** Every heading, paragraph and list item on `/privacy`, `/de/privacy`, `/imprint` and `/de/imprint` must render exactly as before. The MDX below was generated from the catalogs at `main` 555e672 and verified by compiling it and diffing each rendered block against the catalog value: 54/54 blocks identical for privacy, 14/14 for imprint, both locales. Paste it verbatim; do not reflow or "fix" wording in this branch.
- Because the text does not change, `LAST_UPDATED` in the privacy page stays `2026-09-16` and `TERMS_VERSION` stays as it is. Bumping either would be a false statement.
- Body copy lives in `web/content/legal/*.mdx`. Short UI strings (page `title`, `metaTitle`, `lastUpdated`, the `notConfigured` fallback, the email label) stay in `web/messages/en.json` and `de.json`; never hardcode copy in components.
- MDX line wrapping: a wrapped line must not start with `1.`, `-`, `+`, `*`, `>`, `#` or `=`, or markdown turns it into a list, heading or quote. The provided files already respect this; keep it if you touch them.
- Code comments are ASCII-only (no em-dashes, no `§`, no unicode arrows). This includes `{/* */}` comments in MDX.
- Locale-aware links use `Link` from `@/../i18n/navigation`, never `next/link`.
- `type` aliases only; type-only imports say `type`. Declaration order: types, constants, helpers, exported functions.
- Commits: Conventional Commits, scope `web`, no tool attribution. Sign with `git -c gpg.program=/opt/homebrew/bin/gpg commit`.
- Work on `refactor/legal-pages-mdx` (already created from `main`), never on `main`.
- Run `npm test -w web`, not the root `npm test`: the ingest tests delete the dev Meilisearch indexes.

## File Structure

| File | Responsibility |
| --- | --- |
| `web/src/lib/legal/documents.ts` (renamed from `terms-documents.ts`) | `LEGAL_DOCUMENTS`: document name -> locale -> MDX loader |
| `web/src/lib/legal/__tests__/content-parity.test.ts` (new) | every legal document has the same heading shape in en and de |
| `web/src/components/legal/legal-mdx.tsx` | `LEGAL_COMPONENTS` plus `Anchor`, `OperatorAddress`, `OperatorContact`, `OperatorDetails`, `SiteSetting`, `WhenSet` |
| `web/src/components/legal/__tests__/legal-mdx.test.tsx` (new) | the MDX building blocks in isolation |
| `web/content/legal/privacy.{en,de}.mdx` (new) | privacy policy body |
| `web/content/legal/imprint.{en,de}.mdx` (new) | imprint body |
| `web/src/app/[locale]/{privacy,imprint}/page.tsx` | load document + settings, render in `ProseShell` |
| `web/messages/{en,de}.json` | new `legal` namespace; `privacy`, `imprint`, `terms` shrink to UI strings |

---

### Task 1: Shared legal loader and MDX components

Task 1 changes no rendered output. It makes the terms machinery reusable and records a real-app baseline for Tasks 2 and 3 to diff against.

**Files:**
- Rename: `app/web/src/lib/legal/terms-documents.ts` -> `app/web/src/lib/legal/documents.ts`
- Create: `app/web/src/lib/legal/__tests__/content-parity.test.ts`
- Modify: `app/web/src/components/legal/legal-mdx.tsx`
- Create: `app/web/src/components/legal/__tests__/legal-mdx.test.tsx`
- Modify: `app/web/src/app/[locale]/terms/page.tsx` (loader import)
- Modify: `app/web/src/lib/email/messages.ts:6` (comment names the registry)
- Modify: `app/web/src/components/legal/prose-shell.tsx:4`, `app/web/src/components/legal/contact-email.tsx:3` (comments)
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json`

**Interfaces:**
- Produces: `LEGAL_DOCUMENTS` from `@/lib/legal/documents`, an object `{ terms: { en, de } }` whose loaders return `Promise<{ default: MDXContent }>` (the module also carries `toc`, typed by `web/mdx/mdx.d.ts`). Tasks 2 and 3 add `privacy` and `imprint` keys.
- Produces from `@/components/legal/legal-mdx`: `LEGAL_COMPONENTS: MDXComponents` and
  - `OperatorAddress({ name: string | null; address: string | null })` - one `<p class="whitespace-pre-line">` with name and address, each falling back to `legal.notConfigured`;
  - `OperatorContact({ email: string | null })` - `<p>{legal.emailLabel} <mailto link or fallback></p>`;
  - `OperatorDetails({ name, address, email })` - `OperatorAddress` then `OperatorContact` (unchanged API; `terms.*.mdx` keeps using it);
  - `SiteSetting({ value: string | null })` - inline text, the value or the fallback;
  - `WhenSet({ value: string | null; children: ReactNode })` - renders children only when `value` is truthy;
  - `Anchor({ id: string })` - unchanged.
- Produces: message keys `legal.notConfigured`, `legal.emailLabel`. Removes `terms.notConfigured`, `terms.operatorContactLabel`.

- [ ] **Step 1: Record the real-app baseline**

Nothing on this branch has changed yet, so this captures `main`. Start the stack (`docker compose up -d` from `app/`) and the dev server (`npm run dev -w web`), and make sure site settings are filled in under Admin so the operator blocks render real values rather than "Not configured".

Save as `$SCRATCH/capture-legal.mjs`, where `$SCRATCH` is your session scratchpad directory (never the repo). Playwright is imported by absolute path because no Chrome is installed; the repo's chromium is used.

```js
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from '/Users/timon.wegener/WebstormProjects/revelio/app/node_modules/playwright/index.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const PAGES = ['/privacy', '/de/privacy', '/imprint', '/de/imprint', '/terms', '/de/terms']
const out = process.argv[2]
mkdirSync(out, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
for (const path of PAGES) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' })
  // ProseShell's <main> is the innermost one.
  const main = page.locator('main').last()
  const name = path.slice(1).replaceAll('/', '_')
  writeFileSync(`${out}/${name}.txt`, await main.innerText())
  // Tag, computed font size and class list per block: catches a docs style leaking in.
  const shape = await main.evaluate((el) =>
    [...el.querySelectorAll('h1, h2, h3, p, li, a')]
      .map((n) => `${n.tagName} ${getComputedStyle(n).fontSize} ${n.getAttribute('class') ?? ''}`)
      .join('\n'),
  )
  writeFileSync(`${out}/${name}.shape.txt`, shape)
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true })
}
await browser.close()
```

Run: `/usr/local/bin/node $SCRATCH/capture-legal.mjs $SCRATCH/legal-before`
Expected: 18 files in `$SCRATCH/legal-before`. Open `privacy.png` and confirm it shows the full policy with operator values; if the page is unstyled or stale, stop the dev server, `rm -rf web/.next/dev`, restart and capture again.

The imprint has an optional section, so record its other state too. Note whether "Responsible person" is currently set under Admin site settings. Set it to `Jane Doe` if it is empty (or clear it if it is set), then run `/usr/local/bin/node $SCRATCH/capture-legal.mjs $SCRATCH/legal-before-flipped`, then restore the original value. From here on, `legal-before` is the original state and `legal-before-flipped` the other one.

- [ ] **Step 2: Write the failing component test**

`app/web/src/components/legal/__tests__/legal-mdx.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

// legal-mdx imports next-intl's navigation Link, which needs the Next router
// that jsdom lacks. None of these tests renders a link through it.
vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import { OperatorAddress, OperatorContact, OperatorDetails, SiteSetting, WhenSet } from '../legal-mdx'

function renderIn(locale: 'en' | 'de', ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : de} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  )
}

describe('OperatorAddress', () => {
  it('puts name and address on separate lines of one paragraph', () => {
    const { container } = renderIn('en', <OperatorAddress name="Jane Doe" address={'1 Main St\n12345 Berlin'} />)
    const paragraph = container.querySelector('p')
    expect(paragraph).toHaveClass('whitespace-pre-line')
    expect(paragraph?.textContent).toBe('Jane Doe\n1 Main St\n12345 Berlin')
  })

  it('falls back per field in the reader language', () => {
    const { container } = renderIn('de', <OperatorAddress name={null} address={null} />)
    expect(container.querySelector('p')?.textContent).toBe('Nicht konfiguriert\nNicht konfiguriert')
  })
})

describe('OperatorContact', () => {
  it('labels the email and links it', () => {
    const { container, getByRole } = renderIn('de', <OperatorContact email="hi@example.com" />)
    expect(container.querySelector('p')?.textContent).toBe('E-Mail: hi@example.com')
    expect(getByRole('link', { name: 'hi@example.com' })).toHaveAttribute('href', 'mailto:hi@example.com')
  })

  it('falls back without a link when no email is set', () => {
    const { container, queryByRole } = renderIn('en', <OperatorContact email={null} />)
    expect(container.querySelector('p')?.textContent).toBe('Email: Not configured')
    expect(queryByRole('link')).toBeNull()
  })
})

describe('OperatorDetails', () => {
  it('renders the address paragraph followed by the contact paragraph', () => {
    const { container } = renderIn('en', <OperatorDetails name="Jane Doe" address="Berlin" email="hi@example.com" />)
    const paragraphs = Array.from(container.querySelectorAll('p')).map((p) => p.textContent)
    expect(paragraphs).toEqual(['Jane Doe\nBerlin', 'Email: hi@example.com'])
  })
})

describe('SiteSetting', () => {
  it('renders the value inline', () => {
    const { container } = renderIn('en', <p>Host: <SiteSetting value="Hetzner" /></p>)
    expect(container.querySelector('p')?.textContent).toBe('Host: Hetzner')
  })

  it('falls back when the value is not set', () => {
    const { container } = renderIn('en', <p>Host: <SiteSetting value={null} /></p>)
    expect(container.querySelector('p')?.textContent).toBe('Host: Not configured')
  })
})

describe('WhenSet', () => {
  it('renders its children when the value is set', () => {
    const { container } = renderIn('en', <WhenSet value="Jane Doe"><h2>Responsible</h2></WhenSet>)
    expect(container.querySelector('h2')).not.toBeNull()
  })

  // The imprint used `responsiblePerson && ...`, so an empty string hid the
  // section too. Keep that.
  it.each([null, ''])('renders nothing for %j', (value) => {
    const { container } = renderIn('en', <WhenSet value={value}><h2>Responsible</h2></WhenSet>)
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 3: Write the failing parity test**

`app/web/src/lib/legal/__tests__/content-parity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { LEGAL_DOCUMENTS } from '@/lib/legal/documents'

const names = Object.keys(LEGAL_DOCUMENTS) as (keyof typeof LEGAL_DOCUMENTS)[]

// The registry's `satisfies` clause proves a German file exists. It cannot
// prove the German file still has the same sections: a heading dropped in
// translation leaves a legal page that looks complete and is not.
describe('legal documents have the same shape in both locales', () => {
  it.each(names)('%s has the same heading shape in en and de', async (name) => {
    const [en, de] = await Promise.all([LEGAL_DOCUMENTS[name].en(), LEGAL_DOCUMENTS[name].de()])
    expect(en.toc.length).toBeGreaterThan(0)
    expect(de.toc.map((entry) => entry.depth)).toEqual(en.toc.map((entry) => entry.depth))
  })
})
```

- [ ] **Step 4: Run both to verify they fail**

Run: `npm test -w web -- src/components/legal/__tests__/legal-mdx.test.tsx src/lib/legal/__tests__/content-parity.test.ts`
Expected: FAIL. The parity test cannot resolve `@/lib/legal/documents`; the component test fails on the missing exports (`OperatorAddress is not a function` or an import error).

- [ ] **Step 5: Rename the loader**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git mv app/web/src/lib/legal/terms-documents.ts app/web/src/lib/legal/documents.ts
```

Replace the contents of `app/web/src/lib/legal/documents.ts` with:

```ts
import type { MDXContent } from 'mdx/types'
import type { routing } from '@/../i18n/routing'

type LegalLocale = (typeof routing.locales)[number]

type LegalDocumentLoader = () => Promise<{ default: MDXContent }>

/**
 * Every legal document body, by name and locale. The `satisfies` clause is the
 * point, as in lib/docs/registry.ts: adding a locale to routing.locales fails
 * the typecheck until each document is translated, instead of silently serving
 * English. Literal import paths keep each file statically analyzable.
 */
export const LEGAL_DOCUMENTS = {
  terms: {
    en: () => import('@/../content/legal/terms.en.mdx'),
    de: () => import('@/../content/legal/terms.de.mdx'),
  },
} satisfies Record<string, Record<LegalLocale, LegalDocumentLoader>>
```

In `app/web/src/app/[locale]/terms/page.tsx`, replace

```ts
import { TERMS_DOCUMENTS } from '@/lib/legal/terms-documents'
```

with

```ts
import { LEGAL_DOCUMENTS } from '@/lib/legal/documents'
```

and `TERMS_DOCUMENTS[locale](),` with `LEGAL_DOCUMENTS.terms[locale](),`.

In `app/web/src/lib/email/messages.ts`, line 6, replace `TERMS_DOCUMENTS` with `LEGAL_DOCUMENTS`.

- [ ] **Step 6: Move the shared strings into a `legal` namespace**

In `app/web/messages/en.json`, insert directly before `"privacy": {`:

```json
  "legal": {
    "notConfigured": "Not configured",
    "emailLabel": "Email:"
  },
```

and change the `terms` block to exactly:

```json
  "terms": {
    "metaTitle": "Terms of Service",
    "title": "Terms of Service",
    "effective": "Effective from {date, date, long}"
  },
```

In `app/web/messages/de.json`, insert directly before `"privacy": {`:

```json
  "legal": {
    "notConfigured": "Nicht konfiguriert",
    "emailLabel": "E-Mail:"
  },
```

and change the `terms` block to exactly:

```json
  "terms": {
    "metaTitle": "Nutzungsbedingungen",
    "title": "Nutzungsbedingungen",
    "effective": "Gültig ab {date, date, long}"
  },
```

Leave `privacy.notConfigured`, `privacy.controllerContactLabel`, `imprint.notConfigured` and `imprint.contactLabel` alone: their pages still read them until Tasks 2 and 3.

- [ ] **Step 7: Generalize the component map**

Replace the contents of `app/web/src/components/legal/legal-mdx.tsx` with:

```tsx
import type { MDXComponents } from 'mdx/types'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/../i18n/navigation'
import { ContactEmail } from '@/components/legal/contact-email'

type AnchorProps = { id: string }

type OperatorAddressProps = {
  name: string | null
  address: string | null
}

type OperatorContactProps = { email: string | null }

type OperatorDetailsProps = OperatorAddressProps & OperatorContactProps

type SiteSettingProps = { value: string | null }

type WhenSetProps = {
  value: string | null
  children: ReactNode
}

/**
 * Component map for legal MDX (content/legal/). Next's MDX provider,
 * src/mdx-components.tsx, gives headings, paragraphs, lists and links the docs
 * type scale; these plain elements override it so every legal page is styled
 * by ProseShell alone. Internal links still go through next-intl's Link: a bare
 * <a href="/privacy"> would drop a German reader onto the English page.
 *
 * Site settings reach a document as MDX props (`props.operatorName`, ...);
 * the components below turn a missing value into the localized fallback, so
 * no document spells "Not configured" itself.
 */
export const LEGAL_COMPONENTS: MDXComponents = {
  h2: (props: ComponentPropsWithoutRef<'h2'>) => <h2 {...props} />,
  h3: (props: ComponentPropsWithoutRef<'h3'>) => <h3 {...props} />,
  p: (props: ComponentPropsWithoutRef<'p'>) => <p {...props} />,
  ul: (props: ComponentPropsWithoutRef<'ul'>) => <ul {...props} />,
  ol: (props: ComponentPropsWithoutRef<'ol'>) => <ol {...props} />,
  li: (props: ComponentPropsWithoutRef<'li'>) => <li {...props} />,
  a: ({ href, ...props }: ComponentPropsWithoutRef<'a'>) =>
    href?.startsWith('/') ? (
      <Link {...props} href={href} />
    ) : (
      <a {...props} href={href} target="_blank" rel="noopener noreferrer" />
    ),
  Anchor,
  OperatorAddress,
  OperatorContact,
  OperatorDetails,
  SiteSetting,
  WhenSet,
}

/**
 * Deep-link target placed before each section heading. rehype-slug derives
 * heading ids from the translated text, so the German page would otherwise
 * answer a German id and /terms#acceptable-use would not scroll.
 */
export function Anchor({ id }: AnchorProps) {
  return <span id={id} data-terms-anchor="" className="block scroll-mt-20" />
}

/** Operator name and postal address as one paragraph, a line each. */
export function OperatorAddress({ name, address }: OperatorAddressProps) {
  const t = useTranslations('legal')
  const nc = t('notConfigured')
  return <p className="whitespace-pre-line">{`${name ?? nc}\n${address ?? nc}`}</p>
}

/** The labelled contact email as a mailto link. */
export function OperatorContact({ email }: OperatorContactProps) {
  const t = useTranslations('legal')
  return (
    <p>
      {t('emailLabel')} <ContactEmail email={email} fallback={t('notConfigured')} />
    </p>
  )
}

/** Address and contact together, the block the terms and privacy policy open with. */
export function OperatorDetails({ name, address, email }: OperatorDetailsProps) {
  return (
    <>
      <OperatorAddress name={name} address={address} />
      <OperatorContact email={email} />
    </>
  )
}

/** A single site setting inline in running text, e.g. the hosting provider. */
export function SiteSetting({ value }: SiteSettingProps) {
  const t = useTranslations('legal')
  return <>{value ?? t('notConfigured')}</>
}

/**
 * Renders a passage only when an optional setting is filled in. MDX keeps
 * markdown inside the element, so the passage can hold its own heading.
 */
export function WhenSet({ value, children }: WhenSetProps) {
  return value ? <>{children}</> : null
}
```

- [ ] **Step 8: Update the two shared-component comments**

In `app/web/src/components/legal/prose-shell.tsx`, replace

```
 * Narrow centered prose column shared by the privacy and imprint pages so they
 * read as one family. Styles headings/paragraphs/lists/links via arbitrary
```

with

```
 * Narrow centered prose column shared by the legal pages (privacy, imprint,
 * terms) so they read as one family. Styles headings/paragraphs/lists/links via arbitrary
```

In `app/web/src/components/legal/contact-email.tsx`, replace `string when no email is configured. Shared by the privacy and imprint pages.` with `string when no email is configured. Rendered by the legal MDX components.`

- [ ] **Step 9: Run the new tests, the terms page test and the catalog parity test**

Run: `npm test -w web -- src/components/legal/__tests__/legal-mdx.test.tsx src/lib/legal/__tests__/content-parity.test.ts 'src/app/\[locale\]/terms/__tests__/terms.test.tsx' src/lib/__tests__/message-key-parity.test.ts`
Expected: PASS. Component test 10 tests, parity 1 (`terms`), terms page test unchanged and green.

- [ ] **Step 10: Typecheck and lint**

Run: `npm run typecheck && npm run lint -w web`
Expected: PASS. A leftover `terms-documents` import anywhere fails the typecheck; fix it rather than re-adding the old file.

- [ ] **Step 11: Confirm /terms is unchanged in the app**

With the dev server still running: `/usr/local/bin/node $SCRATCH/capture-legal.mjs $SCRATCH/legal-task1 && diff $SCRATCH/legal-before/terms.txt $SCRATCH/legal-task1/terms.txt && diff $SCRATCH/legal-before/de_terms.shape.txt $SCRATCH/legal-task1/de_terms.shape.txt && echo unchanged`
Expected: `unchanged`.

- [ ] **Step 12: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/src/lib/legal app/web/src/components/legal 'app/web/src/app/[locale]/terms/page.tsx' \
  app/web/src/lib/email/messages.ts app/web/messages/en.json app/web/messages/de.json
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "refactor(web): share the legal mdx loader and components across documents" \
  -m "The terms registry and operator block were built for one document.
The privacy policy and imprint need the same loader, the address and
contact email apart from each other, a hosting-provider value inline in
running text, and an imprint section that exists only when a responsible
person is configured. The fallback and email label move to a legal
namespace so no document repeats them."
```

---

### Task 2: Privacy policy as MDX

**Files:**
- Create: `app/web/content/legal/privacy.en.mdx`
- Create: `app/web/content/legal/privacy.de.mdx`
- Modify: `app/web/src/lib/legal/documents.ts` (add `privacy`)
- Modify: `app/web/src/app/[locale]/privacy/page.tsx` (full rewrite)
- Modify: `app/web/src/app/[locale]/privacy/__tests__/privacy.test.tsx` (full rewrite)
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json` (`privacy` shrinks to three keys)

**Interfaces:**
- Consumes: `LEGAL_DOCUMENTS`, `LEGAL_COMPONENTS`, `OperatorDetails`, `SiteSetting` from Task 1.
- Produces: `LEGAL_DOCUMENTS.privacy.{en,de}`; `PrivacyContent({ Document: MDXContent, operatorName, operatorAddress, contactEmail, hostingProvider })`, all settings `string | null`. The MDX reads `props.operatorName`, `props.operatorAddress`, `props.contactEmail`, `props.hostingProvider`.

- [ ] **Step 1: Rewrite the page test against the MDX document**

Every assertion of the old test is kept; the render helper now passes a `Document`, and three tests are added (list rendering, docs styling, last-updated line). Replace the contents of `app/web/src/app/[locale]/privacy/__tests__/privacy.test.tsx` with:

```tsx
import { render, screen, cleanup } from '@testing-library/react'
import type { MDXContent } from 'mdx/types'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

// LEGAL_COMPONENTS imports next-intl's navigation Link, which needs the Next
// router that jsdom lacks. A plain anchor keeps what a test would assert: the href.
vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import PrivacyEn from '@/../content/legal/privacy.en.mdx'
import PrivacyDe from '@/../content/legal/privacy.de.mdx'
import { PrivacyContent } from '../page'

type Settings = Omit<React.ComponentProps<typeof PrivacyContent>, 'Document'>

const FULL: Settings = {
  operatorName: 'Jane Doe',
  operatorAddress: '1 Main St\n12345 Berlin',
  contactEmail: 'hi@example.com',
  hostingProvider: 'Hetzner',
}

const LOCALES = {
  en: { messages: en, Document: PrivacyEn as MDXContent },
  de: { messages: de, Document: PrivacyDe as MDXContent },
}

function renderPrivacy(locale: 'en' | 'de', settings: Settings = FULL) {
  const { messages, Document } = LOCALES[locale]
  return render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <PrivacyContent Document={Document} {...settings} />
    </NextIntlClientProvider>,
  )
}

describe('PrivacyContent', () => {
  it('documents moderation data in both locales', () => {
    renderPrivacy('en')
    expect(screen.getByRole('heading', { name: 'Moderation' })).toBeInTheDocument()
    expect(screen.getByText(/Art\. 17 of the Digital Services Act/)).toBeInTheDocument()
    cleanup()
    renderPrivacy('de')
    expect(screen.getByRole('heading', { name: 'Moderation' })).toBeInTheDocument()
    expect(screen.getByText(/Art\. 6 Abs\. 1 lit\. c DSGVO/)).toBeInTheDocument()
  })

  it('discloses the terms acceptance record in both locales', () => {
    renderPrivacy('en')
    expect(screen.getByText(/which version of the terms of service you accepted and when/)).toBeInTheDocument()
    cleanup()
    renderPrivacy('de')
    expect(screen.getByText(/welcher Fassung der Nutzungsbedingungen Sie wann zugestimmt haben/)).toBeInTheDocument()
  })

  it('renders the English title and injects operator values', () => {
    renderPrivacy('en')
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument()
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument()
    expect(screen.getByText(/hi@example\.com/)).toBeInTheDocument()
    expect(screen.getByText(/Hetzner/)).toBeInTheDocument()
  })

  it('states EU-only transfers', () => {
    renderPrivacy('en')
    expect(screen.getByText(/within the European Union/)).toBeInTheDocument()
  })

  it('renders the contact email as a mailto link', () => {
    renderPrivacy('en')
    const link = screen.getByRole('link', { name: 'hi@example.com' })
    expect(link).toHaveAttribute('href', 'mailto:hi@example.com')
  })

  it('presents the Art. 21 right to object as its own section', () => {
    renderPrivacy('en')
    expect(screen.getByRole('heading', { name: /Right to object/i })).toBeInTheDocument()
  })

  it('documents the Discord connection in both locales', () => {
    renderPrivacy('en')
    expect(screen.getByRole('heading', { name: 'Discord connection' })).toBeInTheDocument()
    cleanup()
    renderPrivacy('de')
    expect(screen.getByRole('heading', { name: 'Discord-Verknüpfung' })).toBeInTheDocument()
  })

  // The EU-only transfer claim and the Discord recipient must not contradict
  // each other: naming Discord as a recipient without carving it out of the
  // transfer section would make the policy untrue.
  it('carves Discord out of the EU-only transfer claim', () => {
    renderPrivacy('en')
    expect(screen.getByText(/may process them in the USA/)).toBeInTheDocument()
  })

  it('renders the German title', () => {
    renderPrivacy('de')
    expect(screen.getByRole('heading', { level: 1, name: 'Datenschutzerklärung' })).toBeInTheDocument()
  })

  it('falls back to "Not configured" when operator values are null', () => {
    renderPrivacy('en', {
      operatorName: null,
      operatorAddress: null,
      contactEmail: null,
      hostingProvider: null,
    })
    expect(screen.getAllByText(/Not configured/).length).toBeGreaterThan(0)
  })

  // Markdown only makes a list of lines that start with "- "; a reflowed
  // paragraph must not turn into one, and the rights must not collapse into one.
  it('lists the five data subject rights as list items in both locales', () => {
    renderPrivacy('en')
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    cleanup()
    renderPrivacy('de')
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
  })

  // The docs component map gives headings and paragraphs their own classes;
  // the privacy policy must be styled by ProseShell alone.
  it('renders headings and paragraphs without the docs styling', () => {
    const { container } = renderPrivacy('en')
    expect(container.querySelector('h2')?.className ?? '').toBe('')
    expect(container.querySelector('p')?.className ?? '').toBe('')
  })

  it('shows the last-updated date', () => {
    renderPrivacy('en')
    expect(screen.getByText(/^Last updated: \w+ \d{1,2}, \d{4}$/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w web -- 'src/app/\[locale\]/privacy/__tests__/privacy.test.tsx'`
Expected: FAIL, cannot resolve `@/../content/legal/privacy.en.mdx`.

- [ ] **Step 3: Write the English document**

`app/web/content/legal/privacy.en.mdx`, verbatim:

```mdx
We take the protection of your personal data seriously. This privacy policy explains
what personal data we process when you use Revelio, on what legal basis, and what
rights you have under the General Data Protection Regulation (GDPR).

## 1. Controller

The controller responsible for the processing of personal data on this website within
the meaning of Art. 4(7) GDPR is:

<OperatorDetails name={props.operatorName} address={props.operatorAddress} email={props.contactEmail} />

Owing to the nature and scope of our processing, we are not required to appoint a
data protection officer (Art. 37 GDPR, § 38 BDSG).

## 2. Legal bases and general information

We process personal data only where a legal basis under Art. 6(1) GDPR permits it:
with your consent (lit. a), for the performance of a contract or pre-contractual
measures (lit. b), to comply with a legal obligation (lit. c), or on the basis of our
legitimate interests (lit. f). Where processing rests on a legitimate interest, that
interest is the secure, stable, and functional operation of the service.

This site uses TLS encryption for security and to protect the transmission of
confidential content. You can recognise an encrypted connection by the “https://”
prefix and the lock icon in your browser’s address bar.

## 3. Data we process

### Account data

When you create an account we process your email address, username, display name,
role, and email-verification status so that we can provide your account and its
features. Legal basis: performance of a contract (Art. 6(1)(b) GDPR). When you
register, or later accept updated terms of service, we also store which version of
the terms of service you accepted and when, so that we can prove which terms apply to
your account. Legal basis: our legitimate interest in being able to prove the terms
agreed (Art. 6(1)(f) GDPR).

### Session data

To keep you signed in and to protect the service against misuse, we store a session
token together with your IP address and your browser’s user-agent until the session
expires. Legal basis: our legitimate interest in operating and securing the service
(Art. 6(1)(f) GDPR).

### Server log files

When you access the site, our hosting provider automatically collects and stores
information that your browser transmits in server log files: browser type and
version, operating system, referrer URL, host name of the accessing device, time of
the request, and IP address. This data is not merged with other data sources. Legal
basis: our legitimate interest in the technically error-free presentation and
security of the site (Art. 6(1)(f) GDPR).

### Content you create

Decks, deck likes, and collection entries you create are stored and linked to your
account so we can provide these features. Legal basis: performance of a contract
(Art. 6(1)(b) GDPR).

### Login emails

To sign you in we send one-time passcodes to your email address via our email
processor. Legal basis: performance of a contract (Art. 6(1)(b) GDPR).

### Contact requests

If you contact us through the contact form or by email, we process the name, email
address, and the content of your message in order to handle your enquiry. These
messages are delivered to the operator by email and are not stored in our database.
Legal basis: our legitimate interest in answering enquiries and, where your request
relates to a contract, the performance of that contract (Art. 6(1)(f) and (b) GDPR).

### Moderation

If we suspend an account for a breach of our terms of service, we store the reason
and the end of the suspension with the account and send both to the affected user by
email, as Art. 17 of the Digital Services Act requires. This data is deleted when the
suspension is lifted or the account is deleted. Legal basis: compliance with a legal
obligation (Art. 6(1)(c) GDPR in conjunction with Art. 17 DSA).

### Discord connection

If you link your Discord account, Discord tells us your Discord user ID, username,
avatar and the email address on that Discord account. We store the user ID together
with your Revelio account so the Revelio bot can recognise you, alongside the access
tokens Discord issues for the connection and the permissions you granted. We do not
store your Discord email address, and we never receive your Discord password or your
messages. When you use the bot, the card, deck and collection data in the reply is
transmitted to Discord, which delivers it to you; replies containing your own
collection or decks are sent privately and are visible only to you. You can unlink at
any time under Settings, Connections. That deletes the stored connection and asks
Discord to revoke Revelio's authorization, so the app also disappears from your
Discord authorised apps. Legal basis: Art. 6(1)(b) GDPR, since the connection is
needed to provide the service you asked for.

## 4. Cookies

We use only cookies and local storage that are necessary to operate the site or to
remember choices you make; we set no analytics or tracking cookies and load no
third-party tracking technologies, so no consent banner is required. In detail:
strictly necessary authentication cookies set when you sign in (for example
revelio.session_token, prefixed __Secure- when served over HTTPS) keep you signed in;
functional cookies remember your language (revelio.locale), your theme
(revelio.theme), your deck overview layout (revelio.deck-view) and, in the admin
area, the section you last opened (revelio.admin.section); and your browser's local
storage temporarily holds an unsaved deck draft (revelio.deck.draft) and notes which
one-off animations you have already seen (revelio.constellation.day,
revelio.cardNav.hintSeen). These are stored solely to provide functions you have
expressly requested, on the basis of § 25(2) TDDDG; any associated processing rests
on Art. 6(1)(f) GDPR.

## 5. Recipients and processors

We use carefully selected processors who act only on our instructions and with whom
we have concluded data processing agreements pursuant to Art. 28 GDPR. Your data is
processed on the servers of our hosting provider. Login and contact emails are sent
via STRATO (STRATO GmbH, Germany). Card images are stored in object storage and
contain no personal data. If you have linked your Discord account, Discord (Discord
Netherlands B.V., Netherlands, and Discord Inc., USA) additionally receives the
content of the bot replies you request.

Hosting provider: <SiteSetting value={props.hostingProvider} />

## 6. Transfers to third countries

Our servers and our email processor are located within the European Union. We do not
transfer your personal data to a country outside the EU/EEA or to an international
organisation. The one exception is the optional Discord connection: if you choose to
link your Discord account, the replies you request from the Revelio bot are
transmitted to Discord, which may process them in the USA under the safeguards set
out in Discord’s own privacy policy. This transfer happens only for users who link an
account, and only for the replies they themselves request; unlinking ends it.

## 7. Storage period

We store personal data only for as long as necessary for the purposes described above
or as required by statutory retention periods. Account data is stored until you
delete your account; sessions until they expire; server log data only for as long as
necessary and is then deleted or anonymised; contact emails until your enquiry has
been dealt with and any statutory retention periods have expired.

## 8. Your rights

As a data subject you have the following rights with respect to your personal data:

- the right of access (Art. 15 GDPR),
- the right to rectification (Art. 16 GDPR),
- the right to erasure (Art. 17 GDPR),
- the right to restriction of processing (Art. 18 GDPR),
- the right to data portability (Art. 20 GDPR).

To exercise any of these rights, please contact us using the details in section 1.

## 9. Right to object (Art. 21 GDPR)

You have the right to object, on grounds relating to your particular situation, at
any time to the processing of your personal data that is based on Art. 6(1)(f) GDPR.
If you object, we will no longer process the personal data concerned unless we can
demonstrate compelling legitimate grounds that override your interests, rights, and
freedoms, or the processing serves to establish, exercise, or defend legal claims.

## 10. Withdrawal of consent

Where processing is based on your consent, you may withdraw that consent at any time
with effect for the future (Art. 7(3) GDPR). The lawfulness of processing carried out
before the withdrawal remains unaffected.

## 11. Right to lodge a complaint

Without prejudice to any other remedy, you have the right to lodge a complaint with a
supervisory authority, in particular in the Member State of your habitual residence,
place of work, or the place of the alleged infringement (Art. 77 GDPR). In Germany,
the competent authority is the data protection supervisory authority of the
respective federal state (Land).

## 12. No automated decision-making

We do not use automated decision-making, including profiling, within the meaning of
Art. 22 GDPR.

## 13. Obligation to provide data

You are not legally or contractually obliged to provide personal data. However, we
can only offer an account and its features if you provide the data required for that
purpose; without it, use of those features is not possible.

## 14. Changes to this policy

We may amend this privacy policy to keep it consistent with current legal
requirements or to reflect changes to our service. The current version always
applies.
```

- [ ] **Step 4: Write the German document**

`app/web/content/legal/privacy.de.mdx`, verbatim:

```mdx
Der Schutz Ihrer personenbezogenen Daten ist uns wichtig. Diese Datenschutzerklärung
informiert Sie darüber, welche personenbezogenen Daten wir bei der Nutzung von
Revelio verarbeiten, auf welcher Rechtsgrundlage dies geschieht und welche Rechte
Ihnen nach der Datenschutz-Grundverordnung (DSGVO) zustehen.

## 1. Verantwortlicher

Verantwortlich für die Verarbeitung personenbezogener Daten auf dieser Website im
Sinne des Art. 4 Nr. 7 DSGVO ist:

<OperatorDetails name={props.operatorName} address={props.operatorAddress} email={props.contactEmail} />

Aufgrund der Art und des Umfangs unserer Verarbeitung sind wir nicht verpflichtet,
eine Datenschutzbeauftragte oder einen Datenschutzbeauftragten zu benennen (Art. 37
DSGVO, § 38 BDSG).

## 2. Rechtsgrundlagen und allgemeine Hinweise

Wir verarbeiten personenbezogene Daten nur, soweit eine Rechtsgrundlage nach Art. 6
Abs. 1 DSGVO dies erlaubt: mit Ihrer Einwilligung (lit. a), zur Erfüllung eines
Vertrags oder vorvertraglicher Maßnahmen (lit. b), zur Erfüllung einer rechtlichen
Verpflichtung (lit. c) oder auf Grundlage unserer berechtigten Interessen (lit. f).
Soweit die Verarbeitung auf einem berechtigten Interesse beruht, besteht dieses im
sicheren, stabilen und funktionsfähigen Betrieb des Dienstes.

Diese Website nutzt aus Sicherheitsgründen und zum Schutz der Übertragung
vertraulicher Inhalte eine TLS-Verschlüsselung. Eine verschlüsselte Verbindung
erkennen Sie an der Zeichenfolge „https://“ und dem Schloss-Symbol in der Adresszeile
Ihres Browsers.

## 3. Welche Daten wir verarbeiten

### Kontodaten

Wenn Sie ein Konto anlegen, verarbeiten wir Ihre E-Mail-Adresse, Ihren Benutzernamen,
Ihren Anzeigenamen, Ihre Rolle und den Status der E-Mail-Bestätigung, um Ihnen Ihr
Konto und dessen Funktionen bereitzustellen. Rechtsgrundlage: Erfüllung eines
Vertrags (Art. 6 Abs. 1 lit. b DSGVO). Wenn Sie sich registrieren oder später
geänderten Nutzungsbedingungen zustimmen, speichern wir außerdem, welcher Fassung der
Nutzungsbedingungen Sie wann zugestimmt haben, damit wir nachweisen können, welche
Bedingungen für Ihr Konto gelten. Rechtsgrundlage: unser berechtigtes Interesse am
Nachweis der vereinbarten Bedingungen (Art. 6 Abs. 1 lit. f DSGVO).

### Sitzungsdaten

Um Sie angemeldet zu halten und den Dienst vor Missbrauch zu schützen, speichern wir
ein Sitzungs-Token zusammen mit Ihrer IP-Adresse und der User-Agent-Kennung Ihres
Browsers bis zum Ablauf der Sitzung. Rechtsgrundlage: unser berechtigtes Interesse am
Betrieb und an der Sicherheit des Dienstes (Art. 6 Abs. 1 lit. f DSGVO).

### Server-Logfiles

Beim Zugriff auf die Website erhebt und speichert unser Hosting-Anbieter automatisch
Informationen, die Ihr Browser übermittelt, in sogenannten Server-Logfiles:
Browsertyp und -version, Betriebssystem, Referrer-URL, Hostname des zugreifenden
Geräts, Uhrzeit der Anfrage und IP-Adresse. Diese Daten werden nicht mit anderen
Datenquellen zusammengeführt. Rechtsgrundlage: unser berechtigtes Interesse an der
technisch fehlerfreien Darstellung und der Sicherheit der Website (Art. 6 Abs. 1 lit.
f DSGVO).

### Von Ihnen erstellte Inhalte

Decks, Deck-Likes und Sammlungseinträge, die Sie anlegen, werden gespeichert und mit
Ihrem Konto verknüpft, damit wir Ihnen diese Funktionen bereitstellen können.
Rechtsgrundlage: Erfüllung eines Vertrags (Art. 6 Abs. 1 lit. b DSGVO).

### Login-E-Mails

Zur Anmeldung senden wir Einmalcodes an Ihre E-Mail-Adresse über unseren
E-Mail-Auftragsverarbeiter. Rechtsgrundlage: Erfüllung eines Vertrags (Art. 6 Abs. 1
lit. b DSGVO).

### Kontaktanfragen

Wenn Sie uns über das Kontaktformular oder per E-Mail kontaktieren, verarbeiten wir
den Namen, die E-Mail-Adresse und den Inhalt Ihrer Nachricht, um Ihre Anfrage zu
bearbeiten. Diese Nachrichten werden dem Betreiber per E-Mail zugestellt und nicht in
unserer Datenbank gespeichert. Rechtsgrundlage: unser berechtigtes Interesse an der
Beantwortung von Anfragen sowie, soweit Ihre Anfrage auf einen Vertrag gerichtet ist,
dessen Erfüllung (Art. 6 Abs. 1 lit. f und b DSGVO).

### Moderation

Sperren wir ein Konto wegen eines Verstoßes gegen unsere Nutzungsbedingungen,
speichern wir den Grund und das Ende der Sperre beim Konto und senden beides per
E-Mail an die betroffene Person, wie es Art. 17 des Digital Services Act verlangt.
Diese Daten werden gelöscht, wenn die Sperre aufgehoben oder das Konto gelöscht wird.
Rechtsgrundlage: Erfüllung einer rechtlichen Verpflichtung (Art. 6 Abs. 1 lit. c
DSGVO i. V. m. Art. 17 DSA).

### Discord-Verknüpfung

Wenn Sie Ihr Discord-Konto verknüpfen, übermittelt uns Discord Ihre
Discord-Benutzer-ID, Ihren Benutzernamen, Ihr Profilbild und die E-Mail-Adresse
dieses Discord-Kontos. Wir speichern die Benutzer-ID zusammen mit Ihrem
Revelio-Konto, damit der Revelio-Bot Sie erkennen kann, sowie die von Discord
ausgestellten Zugriffstokens für die Verbindung und die von Ihnen erteilten
Berechtigungen. Ihre Discord-E-Mail-Adresse speichern wir nicht; Ihr Discord-Passwort
und Ihre Nachrichten erhalten wir zu keiner Zeit. Bei der Nutzung des Bots werden die
Karten-, Deck- und Sammlungsdaten der Antwort an Discord übermittelt, das sie Ihnen
zustellt; Antworten mit Ihrer eigenen Sammlung oder Ihren Decks werden privat
gesendet und sind nur für Sie sichtbar. Sie können die Verknüpfung jederzeit unter
Einstellungen, Verknüpfungen aufheben. Dabei wird die gespeicherte Verbindung
gelöscht und Discord aufgefordert, die Berechtigung für Revelio zu widerrufen, sodass
die Anwendung auch aus Ihren autorisierten Discord-Apps verschwindet.
Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO, da die Verknüpfung zur Erbringung der
von Ihnen gewünschten Leistung erforderlich ist.

## 4. Cookies

Wir verwenden ausschließlich Cookies und lokalen Speicher, die für den Betrieb der
Website erforderlich sind oder Ihre Einstellungen speichern; wir setzen keine
Analyse- oder Tracking-Cookies ein und laden keine Tracking-Technologien Dritter, ein
Cookie-Banner ist daher nicht erforderlich. Im Einzelnen: Technisch notwendige
Authentifizierungs-Cookies, die bei der Anmeldung gesetzt werden (zum Beispiel
revelio.session_token, über HTTPS mit dem Präfix __Secure-), halten Sie angemeldet;
funktionale Cookies speichern Ihre Sprachwahl (revelio.locale), Ihre Darstellung
(revelio.theme), die Ansicht Ihrer Deck-Übersicht (revelio.deck-view) und im
Admin-Bereich den zuletzt geöffneten Abschnitt (revelio.admin.section); zudem hält
der lokale Speicher Ihres Browsers vorübergehend einen ungespeicherten Deck-Entwurf
vor (revelio.deck.draft) und merkt sich, welche einmaligen Animationen Sie bereits
gesehen haben (revelio.constellation.day, revelio.cardNav.hintSeen). Die Speicherung
erfolgt ausschließlich zur Bereitstellung von Ihnen ausdrücklich gewünschter
Funktionen auf Grundlage des § 25 Abs. 2 TDDDG; eine damit verbundene Verarbeitung
stützt sich auf Art. 6 Abs. 1 lit. f DSGVO.

## 5. Empfänger und Auftragsverarbeiter

Wir setzen sorgfältig ausgewählte Auftragsverarbeiter ein, die ausschließlich nach
unseren Weisungen handeln und mit denen wir Auftragsverarbeitungsverträge nach Art.
28 DSGVO geschlossen haben. Ihre Daten werden auf den Servern unseres
Hosting-Anbieters verarbeitet. Login- und Kontakt-E-Mails werden über STRATO (STRATO
GmbH, Deutschland) versendet. Kartenbilder werden in einem Objektspeicher abgelegt
und enthalten keine personenbezogenen Daten. Wenn du dein Discord-Konto verknüpft
hast, erhält zusätzlich Discord (Discord Netherlands B.V., Niederlande, und Discord
Inc., USA) die Inhalte der von dir abgerufenen Bot-Antworten.

Hosting-Anbieter: <SiteSetting value={props.hostingProvider} />

## 6. Übermittlung in Drittländer

Unsere Server und unser E-Mail-Auftragsverarbeiter befinden sich innerhalb der
Europäischen Union. Wir übermitteln Ihre personenbezogenen Daten nicht in ein Land
außerhalb der EU/des EWR oder an eine internationale Organisation. Die einzige
Ausnahme ist die freiwillige Discord-Verknüpfung: Wenn Sie Ihr Discord-Konto
verknüpfen, werden die von Ihnen abgerufenen Antworten des Revelio-Bots an Discord
übermittelt, das sie unter den in der eigenen Datenschutzerklärung von Discord
beschriebenen Garantien auch in den USA verarbeiten kann. Diese Übermittlung erfolgt
nur für Nutzerinnen und Nutzer mit verknüpftem Konto und nur für die von ihnen selbst
abgerufenen Antworten; mit dem Trennen der Verknüpfung endet sie.

## 7. Speicherdauer

Wir speichern personenbezogene Daten nur so lange, wie es für die genannten Zwecke
erforderlich ist oder gesetzliche Aufbewahrungsfristen es verlangen. Kontodaten
werden gespeichert, bis Sie Ihr Konto löschen; Sitzungen bis zu ihrem Ablauf;
Server-Logdaten nur so lange wie nötig und werden anschließend gelöscht oder
anonymisiert; Kontakt-E-Mails, bis Ihre Anfrage abschließend bearbeitet ist und
etwaige gesetzliche Aufbewahrungsfristen abgelaufen sind.

## 8. Ihre Rechte

Als betroffene Person stehen Ihnen hinsichtlich Ihrer personenbezogenen Daten
folgende Rechte zu:

- das Recht auf Auskunft (Art. 15 DSGVO),
- das Recht auf Berichtigung (Art. 16 DSGVO),
- das Recht auf Löschung (Art. 17 DSGVO),
- das Recht auf Einschränkung der Verarbeitung (Art. 18 DSGVO),
- das Recht auf Datenübertragbarkeit (Art. 20 DSGVO).

Zur Ausübung dieser Rechte kontaktieren Sie uns bitte über die in Abschnitt 1
genannten Angaben.

## 9. Widerspruchsrecht (Art. 21 DSGVO)

Sie haben das Recht, aus Gründen, die sich aus Ihrer besonderen Situation ergeben,
jederzeit gegen die Verarbeitung Ihrer personenbezogenen Daten, die auf Art. 6 Abs. 1
lit. f DSGVO beruht, Widerspruch einzulegen. Legen Sie Widerspruch ein, verarbeiten
wir die betroffenen personenbezogenen Daten nicht mehr, es sei denn, wir können
zwingende schutzwürdige Gründe für die Verarbeitung nachweisen, die Ihre Interessen,
Rechte und Freiheiten überwiegen, oder die Verarbeitung dient der Geltendmachung,
Ausübung oder Verteidigung von Rechtsansprüchen.

## 10. Widerruf der Einwilligung

Soweit die Verarbeitung auf Ihrer Einwilligung beruht, können Sie diese jederzeit mit
Wirkung für die Zukunft widerrufen (Art. 7 Abs. 3 DSGVO). Die Rechtmäßigkeit der bis
zum Widerruf erfolgten Verarbeitung bleibt davon unberührt.

## 11. Beschwerderecht bei der Aufsichtsbehörde

Unbeschadet eines anderweitigen Rechtsbehelfs steht Ihnen das Recht zu, sich bei
einer Aufsichtsbehörde zu beschweren, insbesondere in dem Mitgliedstaat Ihres
gewöhnlichen Aufenthaltsorts, Ihres Arbeitsplatzes oder des Orts des mutmaßlichen
Verstoßes (Art. 77 DSGVO). In Deutschland ist die Datenschutz-Aufsichtsbehörde des
jeweiligen Bundeslandes zuständig.

## 12. Keine automatisierte Entscheidungsfindung

Eine automatisierte Entscheidungsfindung einschließlich Profiling im Sinne des Art.
22 DSGVO findet nicht statt.

## 13. Bereitstellung der Daten

Sie sind weder gesetzlich noch vertraglich verpflichtet, personenbezogene Daten
bereitzustellen. Wir können ein Konto und dessen Funktionen jedoch nur anbieten, wenn
Sie die dafür erforderlichen Daten bereitstellen; ohne diese ist die Nutzung der
entsprechenden Funktionen nicht möglich.

## 14. Änderungen dieser Datenschutzerklärung

Wir können diese Datenschutzerklärung anpassen, um sie an geänderte Rechtslagen oder
an Änderungen unseres Dienstes anzupassen. Es gilt jeweils die aktuelle Fassung.
```

- [ ] **Step 5: Register the document**

In `app/web/src/lib/legal/documents.ts`, add after the `terms` entry:

```ts
  privacy: {
    en: () => import('@/../content/legal/privacy.en.mdx'),
    de: () => import('@/../content/legal/privacy.de.mdx'),
  },
```

- [ ] **Step 6: Rewrite the page**

Replace the contents of `app/web/src/app/[locale]/privacy/page.tsx` with:

```tsx
import type { Metadata } from 'next'
import type { MDXContent } from 'mdx/types'
import { notFound } from 'next/navigation'
import { hasLocale, useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { routing } from '@/../i18n/routing'
import { ProseShell } from '@/components/legal/prose-shell'
import { LEGAL_COMPONENTS } from '@/components/legal/legal-mdx'
import { LEGAL_DOCUMENTS } from '@/lib/legal/documents'
import { getCachedSiteSettings } from '@/lib/server/site-settings'

type PrivacyContentProps = {
  Document: MDXContent
  operatorName: string | null
  operatorAddress: string | null
  contactEmail: string | null
  hostingProvider: string | null
}

type PrivacyPageProps = { params: Promise<{ locale: string }> }

export const dynamic = 'force-dynamic'

const LAST_UPDATED = new Date('2026-09-16T00:00:00Z')

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('privacy')
  return { title: t('metaTitle') }
}

/**
 * Sync and prop-driven so it renders in a test tree as well as on the server.
 * The site settings reach the MDX as props, where the legal components read
 * them from `props`.
 */
export function PrivacyContent({
  Document,
  operatorName,
  operatorAddress,
  contactEmail,
  hostingProvider,
}: PrivacyContentProps) {
  const t = useTranslations('privacy')
  return (
    <ProseShell>
      <h1>{t('title')}</h1>
      <Document
        components={LEGAL_COMPONENTS}
        operatorName={operatorName}
        operatorAddress={operatorAddress}
        contactEmail={contactEmail}
        hostingProvider={hostingProvider}
      />
      <p className="mt-8 text-xs text-muted-foreground/70">
        {t('lastUpdated', { date: LAST_UPDATED })}
      </p>
    </ProseShell>
  )
}

export default async function PrivacyPage({ params }: PrivacyPageProps) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  const [{ default: Document }, settings] = await Promise.all([
    LEGAL_DOCUMENTS.privacy[locale](),
    getCachedSiteSettings(),
  ])
  return (
    <PrivacyContent
      Document={Document}
      operatorName={settings?.operatorName ?? null}
      operatorAddress={settings?.operatorAddress ?? null}
      contactEmail={settings?.contactEmail ?? null}
      hostingProvider={settings?.hostingProvider ?? null}
    />
  )
}
```

- [ ] **Step 7: Drop the migrated keys from the catalogs**

In `app/web/messages/en.json`, replace the whole `privacy` block (every key from `metaTitle` through `lastUpdated`) with exactly:

```json
  "privacy": {
    "metaTitle": "Privacy Policy",
    "title": "Privacy Policy",
    "lastUpdated": "Last updated: {date, date, long}"
  },
```

In `app/web/messages/de.json`, same:

```json
  "privacy": {
    "metaTitle": "Datenschutzerklärung",
    "title": "Datenschutzerklärung",
    "lastUpdated": "Zuletzt aktualisiert: {date, date, long}"
  },
```

Then confirm nothing else reads a removed key:

Run: `grep -rnE "privacy\.(intro|controller|dpo|bases|ssl|processing|account|session|logs|content|email|contact|moderation|discord|cookies|recipients|transfers|retention|rights|objection|withdraw|complaint|automated|provision|changes|notConfigured)" app/web/src app/web/e2e`
Expected: no output.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test -w web -- 'src/app/\[locale\]/privacy/__tests__/privacy.test.tsx' src/lib/legal/__tests__/content-parity.test.ts src/lib/__tests__/message-key-parity.test.ts`
Expected: PASS. Privacy 13 tests, parity 2 (`terms`, `privacy`), catalog parity green.

If a text assertion fails only because MDX kept a source line break inside the matched phrase, widen that regex with `\s+`; do not reflow the MDX to suit a test.

- [ ] **Step 9: Diff the real page against the baseline**

With the dev server running:

```bash
/usr/local/bin/node $SCRATCH/capture-legal.mjs $SCRATCH/legal-task2
for f in privacy de_privacy; do
  diff $SCRATCH/legal-before/$f.txt $SCRATCH/legal-task2/$f.txt &&
  diff $SCRATCH/legal-before/$f.shape.txt $SCRATCH/legal-task2/$f.shape.txt && echo "$f unchanged"
done
```

Expected: `privacy unchanged` and `de_privacy unchanged`. A `.txt` diff is a content regression: fix the MDX, not the baseline. A `.shape.txt` diff with docs classes (`mt-4 max-w-[65ch] ...`) means the provider map is winning; confirm `components={LEGAL_COMPONENTS}` reaches `Document`. Compare `privacy.png` side by side as a last check.

- [ ] **Step 10: Typecheck and lint**

Run: `npm run typecheck && npm run lint -w web`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/content/legal/privacy.en.mdx app/web/content/legal/privacy.de.mdx \
  app/web/src/lib/legal/documents.ts 'app/web/src/app/[locale]/privacy' \
  app/web/messages/en.json app/web/messages/de.json
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "refactor(web): move the privacy policy body into mdx" \
  -m "Fifty-odd message keys held one legal text, so every disclosure change
was a JSON diff split across keys and read nowhere as prose. The body now
lives in content/legal/privacy.{en,de}.mdx like the terms. The rendered
text is unchanged, so the last-updated date stays."
```

---

### Task 3: Imprint as MDX

**Files:**
- Create: `app/web/content/legal/imprint.en.mdx`
- Create: `app/web/content/legal/imprint.de.mdx`
- Modify: `app/web/src/lib/legal/documents.ts` (add `imprint`)
- Modify: `app/web/src/app/[locale]/imprint/page.tsx` (full rewrite)
- Modify: `app/web/src/app/[locale]/imprint/__tests__/imprint.test.tsx` (full rewrite)
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json` (`imprint` shrinks to two keys)

**Interfaces:**
- Consumes: `LEGAL_DOCUMENTS`, `LEGAL_COMPONENTS`, `OperatorAddress`, `OperatorContact`, `WhenSet` from Task 1.
- Produces: `LEGAL_DOCUMENTS.imprint.{en,de}`; `ImprintContent({ Document: MDXContent, operatorName, operatorAddress, contactEmail, responsiblePerson })`, all settings `string | null`. The MDX reads `props.operatorName`, `props.operatorAddress`, `props.contactEmail`, `props.responsiblePerson`.

- [ ] **Step 1: Rewrite the page test against the MDX document**

Every assertion of the old test is kept; one is added for the docs styling. Replace the contents of `app/web/src/app/[locale]/imprint/__tests__/imprint.test.tsx` with:

```tsx
import { render, screen } from '@testing-library/react'
import type { MDXContent } from 'mdx/types'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

// LEGAL_COMPONENTS imports next-intl's navigation Link, which needs the Next
// router that jsdom lacks. A plain anchor keeps what a test would assert: the href.
vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import ImprintEn from '@/../content/legal/imprint.en.mdx'
import ImprintDe from '@/../content/legal/imprint.de.mdx'
import { ImprintContent } from '../page'

type Settings = Omit<React.ComponentProps<typeof ImprintContent>, 'Document'>

const BASE: Settings = {
  operatorName: 'Jane Doe',
  operatorAddress: '1 Main St\n12345 Berlin',
  contactEmail: 'hi@example.com',
  responsiblePerson: null,
}

const LOCALES = {
  en: { messages: en, Document: ImprintEn as MDXContent },
  de: { messages: de, Document: ImprintDe as MDXContent },
}

function renderImprint(locale: 'en' | 'de', settings: Settings = BASE) {
  const { messages, Document } = LOCALES[locale]
  return render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <ImprintContent Document={Document} {...settings} />
    </NextIntlClientProvider>,
  )
}

describe('ImprintContent', () => {
  it('renders the English title and provider info', () => {
    renderImprint('en')
    expect(screen.getByRole('heading', { level: 1, name: 'Imprint' })).toBeInTheDocument()
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument()
    expect(screen.getByText(/hi@example\.com/)).toBeInTheDocument()
  })

  it('renders the contact email as a mailto link', () => {
    renderImprint('en')
    const link = screen.getByRole('link', { name: 'hi@example.com' })
    expect(link).toHaveAttribute('href', 'mailto:hi@example.com')
  })

  it('renders the German title (Impressum)', () => {
    renderImprint('de')
    expect(screen.getByRole('heading', { level: 1, name: 'Impressum' })).toBeInTheDocument()
  })

  it('shows the responsible-person section only when set', () => {
    renderImprint('en', { ...BASE, responsiblePerson: 'Jane Doe' })
    expect(screen.getByRole('heading', { name: /Responsible for content/i })).toBeInTheDocument()
  })

  it('repeats the operator address under the responsible person', () => {
    renderImprint('en', { ...BASE, responsiblePerson: 'Max Mustermann' })
    expect(screen.getByText(/Max Mustermann/)).toBeInTheDocument()
    // The address shows in both the section 5 provider block and the section 18 block.
    expect(screen.getAllByText(/12345 Berlin/)).toHaveLength(2)
  })

  it('hides the responsible-person section when null', () => {
    renderImprint('en')
    expect(screen.queryByRole('heading', { name: /Responsible for content/i })).not.toBeInTheDocument()
  })

  it('includes the § 36 VSBG consumer dispute-resolution statement', () => {
    renderImprint('en')
    expect(screen.getByRole('heading', { name: /Consumer dispute resolution/i })).toBeInTheDocument()
    expect(screen.getByText(/§ 36 VSBG/)).toBeInTheDocument()
  })

  it('reuses the footer fan-project disclaimer', () => {
    renderImprint('en')
    expect(screen.getByText(/unofficial, non-commercial fan project/i)).toBeInTheDocument()
  })

  it('falls back to "Not configured" when provider fields are null', () => {
    renderImprint('en', {
      operatorName: null,
      operatorAddress: null,
      contactEmail: null,
      responsiblePerson: null,
    })
    expect(screen.getAllByText(/Not configured/).length).toBeGreaterThan(0)
  })

  // The docs component map gives headings and paragraphs their own classes;
  // the imprint must be styled by ProseShell alone.
  it('renders headings without the docs styling', () => {
    const { container } = renderImprint('en')
    expect(container.querySelector('h2')?.className ?? '').toBe('')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -w web -- 'src/app/\[locale\]/imprint/__tests__/imprint.test.tsx'`
Expected: FAIL, cannot resolve `@/../content/legal/imprint.en.mdx`.

- [ ] **Step 3: Write the English document**

`app/web/content/legal/imprint.en.mdx`, verbatim. The blank lines inside `<WhenSet>` matter: without them MDX treats `## ...` as literal text, not a heading.

```mdx
## Information pursuant to § 5 DDG

<OperatorAddress name={props.operatorName} address={props.operatorAddress} />

## Contact

<OperatorContact email={props.contactEmail} />

{/* Section 18(2) MStV wants name and address. The responsible person is the operator,
    so this reuses the operator address from the section 5 DDG block. */}

<WhenSet value={props.responsiblePerson}>

## Responsible for content pursuant to § 18(2) MStV

<OperatorAddress name={props.responsiblePerson} address={props.operatorAddress} />

</WhenSet>

## Consumer dispute resolution

We are neither willing nor obliged to take part in dispute resolution proceedings
before a consumer arbitration board (§ 36 VSBG).

## Liability for content

As a service provider we are responsible under § 7(1) DDG for our own content on
these pages in accordance with general law. Under §§ 8 to 10 DDG, however, we are not
obliged as a service provider to monitor transmitted or stored third-party
information or to investigate circumstances that indicate unlawful activity.
Obligations to remove or block the use of information under general law remain
unaffected; liability in this respect is, however, only possible from the point in
time at which we become aware of a specific infringement. Upon becoming aware of such
infringements, we will remove the content in question promptly.

## Liability for links

Our pages contain links to external third-party websites over whose content we have
no influence. We therefore cannot accept any liability for this third-party content.
The respective provider or operator of the linked pages is always responsible for
their content. The linked pages were checked for possible legal violations at the
time of linking; no unlawful content was identifiable at that time. Permanent
monitoring of the content of the linked pages is, however, unreasonable without
concrete evidence of an infringement. Upon becoming aware of legal violations, we
will remove such links promptly.

## Copyright

The content and works created by the site operators on these pages are subject to
German copyright law. Reproduction, editing, distribution, and any kind of use beyond
the limits of copyright require the written consent of the respective author or
creator. Downloads and copies of this site are permitted only for private,
non-commercial use. Insofar as the content on this site was not created by the
operator, the copyrights of third parties are respected; in particular, third-party
content is marked as such. Should you nevertheless become aware of a copyright
infringement, please let us know, and we will remove such content promptly.
```

- [ ] **Step 4: Write the German document**

`app/web/content/legal/imprint.de.mdx`, verbatim:

```mdx
## Angaben gemäß § 5 DDG

<OperatorAddress name={props.operatorName} address={props.operatorAddress} />

## Kontakt

<OperatorContact email={props.contactEmail} />

{/* Section 18(2) MStV wants name and address. The responsible person is the operator,
    so this reuses the operator address from the section 5 DDG block. */}

<WhenSet value={props.responsiblePerson}>

## Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV

<OperatorAddress name={props.responsiblePerson} address={props.operatorAddress} />

</WhenSet>

## Verbraucherstreitbeilegung

Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer
Verbraucherschlichtungsstelle teilzunehmen (§ 36 VSBG).

## Haftung für Inhalte

Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen
Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG sind wir
als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde
Informationen zu überwachen oder nach Umständen zu forschen, die auf eine
rechtswidrige Tätigkeit hinweisen. Verpflichtungen zur Entfernung oder Sperrung der
Nutzung von Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt.
Eine diesbezügliche Haftung ist jedoch erst ab dem Zeitpunkt der Kenntnis einer
konkreten Rechtsverletzung möglich. Bei Bekanntwerden von entsprechenden
Rechtsverletzungen werden wir diese Inhalte umgehend entfernen.

## Haftung für Links

Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir
keinen Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr
übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter
oder Betreiber der Seiten verantwortlich. Die verlinkten Seiten wurden zum Zeitpunkt
der Verlinkung auf mögliche Rechtsverstöße überprüft; rechtswidrige Inhalte waren zum
Zeitpunkt der Verlinkung nicht erkennbar. Eine permanente inhaltliche Kontrolle der
verlinkten Seiten ist jedoch ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht
zumutbar. Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Links
umgehend entfernen.

## Urheberrecht

Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten
unterliegen dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung,
Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechts
bedürfen der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers.
Downloads und Kopien dieser Seite sind nur für den privaten, nicht kommerziellen
Gebrauch gestattet. Soweit die Inhalte auf dieser Seite nicht vom Betreiber erstellt
wurden, werden die Urheberrechte Dritter beachtet; insbesondere werden Inhalte
Dritter als solche gekennzeichnet. Sollten Sie trotzdem auf eine
Urheberrechtsverletzung aufmerksam werden, bitten wir um einen entsprechenden
Hinweis; bei Bekanntwerden von Rechtsverletzungen werden wir derartige Inhalte
umgehend entfernen.
```

- [ ] **Step 5: Register the document**

In `app/web/src/lib/legal/documents.ts`, add after the `privacy` entry:

```ts
  imprint: {
    en: () => import('@/../content/legal/imprint.en.mdx'),
    de: () => import('@/../content/legal/imprint.de.mdx'),
  },
```

- [ ] **Step 6: Rewrite the page**

The fan-project disclaimer stays in the page: it is the footer's catalog string, shared, and not part of the imprint text. Replace the contents of `app/web/src/app/[locale]/imprint/page.tsx` with:

```tsx
import type { Metadata } from 'next'
import type { MDXContent } from 'mdx/types'
import { notFound } from 'next/navigation'
import { hasLocale, useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { routing } from '@/../i18n/routing'
import { ProseShell } from '@/components/legal/prose-shell'
import { LEGAL_COMPONENTS } from '@/components/legal/legal-mdx'
import { BRAND_NAME } from '@/lib/brand'
import { LEGAL_DOCUMENTS } from '@/lib/legal/documents'
import { getCachedSiteSettings } from '@/lib/server/site-settings'

type ImprintContentProps = {
  Document: MDXContent
  operatorName: string | null
  operatorAddress: string | null
  contactEmail: string | null
  responsiblePerson: string | null
}

type ImprintPageProps = { params: Promise<{ locale: string }> }

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('imprint')
  return { title: t('metaTitle') }
}

/**
 * Sync and prop-driven so it renders in a test tree as well as on the server.
 * The site settings reach the MDX as props, where the legal components read
 * them from `props`.
 */
export function ImprintContent({
  Document,
  operatorName,
  operatorAddress,
  contactEmail,
  responsiblePerson,
}: ImprintContentProps) {
  const t = useTranslations('imprint')
  const tf = useTranslations('footer')
  return (
    <ProseShell>
      <h1>{t('title')}</h1>
      <Document
        components={LEGAL_COMPONENTS}
        operatorName={operatorName}
        operatorAddress={operatorAddress}
        contactEmail={contactEmail}
        responsiblePerson={responsiblePerson}
      />
      <p className="mt-8 text-xs leading-relaxed text-muted-foreground/70">
        {tf('disclaimer', { brand: BRAND_NAME })}
      </p>
    </ProseShell>
  )
}

export default async function ImprintPage({ params }: ImprintPageProps) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  const [{ default: Document }, settings] = await Promise.all([
    LEGAL_DOCUMENTS.imprint[locale](),
    getCachedSiteSettings(),
  ])
  return (
    <ImprintContent
      Document={Document}
      operatorName={settings?.operatorName ?? null}
      operatorAddress={settings?.operatorAddress ?? null}
      contactEmail={settings?.contactEmail ?? null}
      responsiblePerson={settings?.responsiblePerson ?? null}
    />
  )
}
```

- [ ] **Step 7: Drop the migrated keys from the catalogs**

In `app/web/messages/en.json`, replace the whole `imprint` block with exactly:

```json
  "imprint": {
    "metaTitle": "Imprint",
    "title": "Imprint"
  },
```

In `app/web/messages/de.json`:

```json
  "imprint": {
    "metaTitle": "Impressum",
    "title": "Impressum"
  },
```

Run: `grep -rnE "imprint\.(notConfigured|provider|contact|responsible|dispute|liability|copyright)" app/web/src app/web/e2e`
Expected: no output.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test -w web -- 'src/app/\[locale\]/imprint/__tests__/imprint.test.tsx' src/lib/legal/__tests__/content-parity.test.ts src/lib/__tests__/message-key-parity.test.ts`
Expected: PASS. Imprint 10 tests, parity 3 (`terms`, `privacy`, `imprint`), catalog parity green.

- [ ] **Step 9: Diff the real page against both baselines**

With the dev server running and site settings in their original state:

```bash
/usr/local/bin/node $SCRATCH/capture-legal.mjs $SCRATCH/legal-task3
for f in imprint de_imprint; do
  diff $SCRATCH/legal-before/$f.txt $SCRATCH/legal-task3/$f.txt &&
  diff $SCRATCH/legal-before/$f.shape.txt $SCRATCH/legal-task3/$f.shape.txt && echo "$f unchanged"
done
```

Then flip "Responsible person" exactly as in Task 1 Step 1, capture to `$SCRATCH/legal-task3-flipped`, run the same loop against `legal-before-flipped`, and restore the setting.

Expected: `imprint unchanged` and `de_imprint unchanged` in both states. A diff only in the flipped state points at the `<WhenSet>` passage: check the blank lines around its heading.

- [ ] **Step 10: Typecheck and lint**

Run: `npm run typecheck && npm run lint -w web`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/content/legal/imprint.en.mdx app/web/content/legal/imprint.de.mdx \
  app/web/src/lib/legal/documents.ts 'app/web/src/app/[locale]/imprint' \
  app/web/messages/en.json app/web/messages/de.json
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "refactor(web): move the imprint body into mdx" \
  -m "Completes the move of the legal pages to content/legal/. The optional
responsible-person section is a WhenSet passage in the document, so the
heading stays in the prose instead of in the page component. The
rendered text is unchanged."
```

---

### Task 4: Verify and open the PR

**Files:** none changed, unless a check below fails.

- [ ] **Step 1: Look for stale references**

Run from the repo root:

```bash
grep -rn "TERMS_DOCUMENTS\|terms-documents\|operatorContactLabel\|controllerContactLabel\|recipientsHostLabel" app/web CLAUDE.md --include='*.ts' --include='*.tsx' --include='*.mdx' --include='*.json' --include='*.md' | grep -v node_modules
```

Expected: no output. Historical plans and specs under `docs/superpowers/` may still name the old identifiers; leave them, they describe what was built at the time.

- [ ] **Step 2: Full web test suite**

Run: `npm test -w web`
Expected: PASS. Note the test count for the PR body.

- [ ] **Step 3: Typecheck and lint everything**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Production build**

Vitest compiles MDX with `@mdx-js/rollup`; the app uses `@next/mdx` under Turbopack. Only the build proves the new files compile there.

Run: `npm run build -w web` (needs `web/.env.local`)
Expected: build succeeds; `/[locale]/privacy` and `/[locale]/imprint` are listed as dynamic routes.

- [ ] **Step 5: Final real-app capture**

Run: `/usr/local/bin/node $SCRATCH/capture-legal.mjs $SCRATCH/legal-after && diff -r -x '*.png' $SCRATCH/legal-before $SCRATCH/legal-after && echo "all six pages unchanged"`
Expected (settings in their original state): `all six pages unchanged`. Also look at `privacy.png` and `de_imprint.png` at 375px width once (`page.setViewportSize({ width: 375, height: 800 })` in a copy of the script) to confirm the prose column still fits without horizontal scroll.

- [ ] **Step 6: Push and open the PR**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git push -u origin refactor/legal-pages-mdx
```

Open the PR with `/opt/homebrew/bin/gh pr create`. Title: `refactor(web): move the privacy policy and imprint into mdx`. The body follows `.github/pull_request_template.md`:

- Opening prose: `/terms` already keeps its body in MDX; the privacy policy and imprint were still assembled from about seventy message keys between them, so a disclosure change was a JSON diff that read nowhere as prose. This moves both into `content/legal/` on the same loader and component map, with no change to the rendered text.
- `## What changed`: the shared `LEGAL_DOCUMENTS` registry and legal components (Task 1), privacy (Task 2), imprint (Task 3); the new `legal` message namespace and the shrunken `privacy`/`imprint`/`terms` namespaces; the heading-shape parity test over every legal document.
- `## Verification`: one bullet per command actually run with its real result (`npm test -w web` with the count, `npm run typecheck`, `npm run lint`, `npm run build -w web`), plus the before/after Playwright capture: rendered text and per-block computed styles of all six legal URLs identical to `main`, and both states of the responsible-person section checked.
- `## Deployment`: nothing outside the diff. No env var, migration or ingest run.
- `## Notes for review`: the MDX was generated from the catalogs and each rendered block diffed against its source key, so review it for structure (components, headings, the `WhenSet` passage) rather than rereading the legal text. `LAST_UPDATED` is deliberately unchanged. Link this plan and the terms spec.

---

### Task 5: Review follow-up - date in the document, stronger parity

Two gaps a best-practice pass found after the PR opened. Neither changes a rendered word.

1. **The privacy date lived apart from its text.** `LAST_UPDATED` stayed in `privacy/page.tsx` while the body moved to MDX, so an edit made where the text lives leaves the date stale. `/terms` is not affected: its effective date is `TERMS_EFFECTIVE_DATE`, which is tied to `TERMS_VERSION` and the acceptance record, and stays in code.
2. **The parity test compared heading depths only.** A German file that lost `<OperatorDetails>` or `<SiteSetting>` still passed, which would drop a mandatory disclosure silently.

**Files:**
- Modify: `app/web/src/components/legal/legal-mdx.tsx` (add `LastUpdated`)
- Modify: `app/web/src/components/legal/__tests__/legal-mdx.test.tsx`
- Modify: `app/web/content/legal/privacy.{en,de}.mdx` (append `<LastUpdated date="2026-09-16" />`)
- Modify: `app/web/src/app/[locale]/privacy/page.tsx` (drop `LAST_UPDATED` and the footer paragraph)
- Modify: `app/web/src/lib/legal/__tests__/content-parity.test.ts`
- Modify: `app/web/messages/{en,de}.json` (`privacy.lastUpdated` -> `legal.lastUpdated`)

**Interfaces:**
- `LastUpdated({ date: string })`, `date` as `YYYY-MM-DD`. Renders `<p className="mt-8 text-xs text-muted-foreground/70">` with `legal.lastUpdated`, the date read as UTC midnight: the same element the page rendered, in the same position (last child of `ProseShell`).

- [ ] **Step 1: Failing tests.**
  - `legal-mdx.test.tsx`: `LastUpdated` renders `Last updated: September 16, 2026` (en) / `Zuletzt aktualisiert: 16. September 2026` (de) with the muted classes.
  - `content-parity.test.ts`: render each document to static markup with every capitalized entry of `LEGAL_COMPONENTS` replaced by a recorder that logs `[name, props minus children]` and renders its children, and every MDX prop set to its own name (`operatorName: 'operatorName'`, ...). Assert the en and de logs are equal, which covers settings, `Anchor` ids and the date. Assert every `LastUpdated` date matches `YYYY-MM-DD`. Keep the heading-depth assertion.
  - Run both and see the `LastUpdated` tests fail.
- [ ] **Step 2: Implement.** Add `LastUpdated`, move the message key, append the element to both privacy documents, remove `LAST_UPDATED` from the page.
- [ ] **Step 3: Verify.** Web tests, typecheck, lint; real-app capture of all six pages diffed against `legal-before` (text and shape identical); mutation check: delete `<SiteSetting>` from `privacy.de.mdx` and confirm the parity test fails, then restore.
- [ ] **Step 4: Commit** as `refactor(web): date the privacy policy in its document and compare legal components across locales`, then update the PR body.

---

### Task 6: Format the terms effective date in UTC

`terms/page.tsx` formats `TERMS_EFFECTIVE_DATE` (UTC midnight) without a time zone, and none is configured app-wide, so a server west of UTC prints "Effective from" the day before. Task 5 fixed the same thing for `LastUpdated`. The version string and the acceptance check are unaffected; only the rendered line is wrong.

**Files:**
- Create: `app/web/src/lib/legal/date-formats.ts` - `UTC_LONG_DATE`, moved out of `legal-mdx.tsx` so the page and the component share one definition
- Modify: `app/web/src/components/legal/legal-mdx.tsx` (import it)
- Modify: `app/web/src/app/[locale]/terms/page.tsx` (pass it to `t('effective', ...)`)
- Modify: `app/web/src/app/[locale]/terms/__tests__/terms.test.tsx`

- [ ] **Step 1: Failing test.** Render `TermsContent` in `de` under `timeZone="America/Los_Angeles"` and expect `Gültig ab 16. September 2026`, derived from `TERMS_VERSION` rather than hardcoded so a version bump does not break it. Run it and see it print the 15th.
- [ ] **Step 2: Fix.** Move `UTC_LONG_DATE` to `lib/legal/date-formats.ts`, import it in both places.
- [ ] **Step 3: Verify.** Web tests, typecheck, lint; `/terms` and `/de/terms` capture unchanged against `legal-before`.
- [ ] **Step 4: Commit** as `fix(web): print the terms effective date in utc`, push, add it to the PR body.
