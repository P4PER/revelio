# Legal & About Pages (`/about`, `/privacy`, `/imprint`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the three footer-linked content pages that currently 404 — an About page, a GDPR Privacy Policy (`/privacy`), and a German Impressum (`/imprint`) — as bilingual (en + de) server components that render next-intl message prose and inject operator/legal values from the Spec 1 site-settings store.

**Architecture:** One shared prose layout (`ProseShell`) wraps all three pages so they read as one family. Each page is a `[locale]` route with a default async server component that awaits `params`, calls `setRequestLocale`, reads `getCachedSiteSettings()`, and renders a **sync, prop-driven named view component** (exported from the same module) that uses `useTranslations`. The view is what tests render, wrapped in `NextIntlClientProvider` with the real message JSON — exactly the pattern `site-footer.tsx` / `SiteFooterView` and `page.tsx` / `Home` already use. Legal/operator *values* come from settings (one source of truth, Spec 1); all *prose* lives in the `about` / `privacy` / `imprint` message namespaces, authored natively in both locales.

**Tech Stack:** Next.js 16 (App Router, React 19), next-intl, Tailwind v4, Vitest + React Testing Library + jsdom.

## Global Constraints

Every task's requirements implicitly include this section.

- **Bilingual, native.** Add every new key to **both** `app/web/messages/en.json` and `app/web/messages/de.json`. German legal prose (Datenschutzerklärung, Impressum) is authored natively — never machine-translated.
- **Operator values come from settings.** Read them via `getCachedSiteSettings()` (`@/lib/site-settings`, Spec 1). **Never hardcode** the operator name, address, contact email, hosting provider, or responsible person in code or messages.
- **Settings shape.** `getCachedSiteSettings(): Promise<SiteSettings | null>` — **the whole object is `null` when the singleton row is absent.** All content fields are `string | null`. Exact field names (not `name`/`address`): `operatorName`, `operatorAddress`, `contactEmail`, `hostingProvider`, `responsiblePerson`, `githubUrl`.
- **Locale-aware links.** Import `Link` from `@/../i18n/navigation` (the `@` alias = `src/`, so this resolves to `app/web/i18n/navigation.ts`). Use it for internal links; use a bare `<a target="_blank" rel="noopener noreferrer">` only for external URLs (GitHub).
- **`BRAND_NAME`** comes from `@/lib/brand`.
- **Page conventions** (match `src/app/[locale]/sets/page.tsx`): `export const dynamic = 'force-dynamic'`; `params` is a `Promise<{ locale: string }>`, always awaited; call `setRequestLocale(locale)` first in both `generateMetadata` and the page body; `getTranslations`/`setRequestLocale` from `next-intl/server`; `useTranslations` from `next-intl`.
- **Testability.** Each page exports a sync, prop-driven named view component (`AboutContent` / `PrivacyContent` / `ImprintContent`) alongside its default async page, so it renders in jsdom without the RSC/async data layer.
- **Test harness.** Vitest + RTL. Wrap the view in `NextIntlClientProvider` with real JSON imported via `@/../messages/en.json` / `@/../messages/de.json`. Mock `@/../i18n/navigation` to stub `Link`. `server-only` is already aliased to a stub in `vitest.config.ts`, so importing the page module is safe. Test files must match `src/**/*.test.{ts,tsx}`.
- **Legal facts (locked decisions):** servers and email provider are **EU-hosted** → the Privacy Policy states no third-country transfers. **`/privacy` shows a "last updated" date; `/imprint` does not.** About-page credits are generic (no named individuals).
- **New routes are filesystem-routed** — no middleware/registration needed. A concrete `page.tsx` takes precedence over the existing `[...rest]` catch-all.
- **Commit style:** Conventional Commits.

## File Structure

**Create:**
- `app/web/src/components/legal/prose-shell.tsx` — shared narrow-column prose layout for all three pages (one responsibility: typographic shell).
- `app/web/src/components/legal/__tests__/prose-shell.test.tsx`
- `app/web/src/app/[locale]/about/page.tsx` — About page (default async `AboutPage` + named `AboutContent`).
- `app/web/src/app/[locale]/about/__tests__/about.test.tsx`
- `app/web/src/app/[locale]/privacy/page.tsx` — Privacy page (default async `PrivacyPage` + named `PrivacyContent`).
- `app/web/src/app/[locale]/privacy/__tests__/privacy.test.tsx`
- `app/web/src/app/[locale]/imprint/page.tsx` — Imprint page (default async `ImprintPage` + named `ImprintContent`).
- `app/web/src/app/[locale]/imprint/__tests__/imprint.test.tsx`

**Modify:**
- `app/web/messages/en.json` — add `about`, `privacy`, `imprint` namespaces.
- `app/web/messages/de.json` — add `about`, `privacy`, `imprint` namespaces (native German).

**Depends on (already merged, Spec 1 / PR #31):**
- `app/web/src/lib/site-settings.ts` — `getCachedSiteSettings()`, `SITE_SETTINGS_TAG`.
- `@revelio/db` — `type SiteSettings` (fields listed under Global Constraints).

**No footer changes needed:** `src/components/site-footer.tsx` already links `/about`, `/privacy`, `/imprint` (and `/contact`, Spec 3). The `footer.disclaimer` key (ICU param `{brand}`) already exists in both locale files and is **reused** by the Imprint page.

---

### Task 1: Shared prose layout (`ProseShell`)

Build the narrow-column typographic wrapper all three pages use. It styles `h1`/`h2`/`h3`/`p`/`ul`/`li`/`a` via Tailwind arbitrary variants so pages stay markup-only. No project prose component exists today.

**Files:**
- Create: `app/web/src/components/legal/prose-shell.tsx`
- Test: `app/web/src/components/legal/__tests__/prose-shell.test.tsx`

**Interfaces:**
- Consumes: nothing (leaf component).
- Produces: `export function ProseShell({ children }: { children: ReactNode }): JSX.Element` — renders `<main className="mx-auto max-w-3xl px-6 py-10 …">{children}</main>`. Used by Tasks 2–4.

- [ ] **Step 1: Write the failing test**

```tsx
// app/web/src/components/legal/__tests__/prose-shell.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ProseShell } from '../prose-shell'

describe('ProseShell', () => {
  it('renders children inside a main landmark', () => {
    render(
      <ProseShell>
        <h1>Hello</h1>
        <p>Body text.</p>
      </ProseShell>,
    )
    const main = screen.getByRole('main')
    expect(main).toBeInTheDocument()
    expect(main.className).toContain('max-w-3xl')
    expect(screen.getByRole('heading', { level: 1, name: 'Hello' })).toBeInTheDocument()
    expect(screen.getByText('Body text.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/components/legal/__tests__/prose-shell.test.tsx`
Expected: FAIL — cannot resolve `../prose-shell`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// app/web/src/components/legal/prose-shell.tsx
import type { ReactNode } from 'react'

/**
 * Narrow centered prose column shared by the legal/about content pages so they
 * read as one family. Styles headings/paragraphs/lists/links via arbitrary
 * variants — the project has no Tailwind typography plugin.
 */
export function ProseShell({ children }: { children: ReactNode }) {
  return (
    <main
      className={
        'mx-auto max-w-3xl px-6 py-10 ' +
        '[&_h1]:mb-6 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:text-primary ' +
        '[&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground ' +
        '[&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground ' +
        '[&_p]:mb-4 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-muted-foreground ' +
        '[&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:text-sm [&_ul]:text-muted-foreground ' +
        '[&_li]:mb-1 ' +
        '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2'
      }
    >
      {children}
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- src/components/legal/__tests__/prose-shell.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/web/src/components/legal/prose-shell.tsx app/web/src/components/legal/__tests__/prose-shell.test.tsx
git commit -m "feat(web): add shared ProseShell layout for legal/about pages"
```

---

### Task 2: About page (`/about`)

Warm, concise project narrative with generic credits and a settings-driven GitHub link (rendered only when `githubUrl` is set). Adds the `about` namespace to both locale files.

**Files:**
- Modify: `app/web/messages/en.json` (add `about` namespace)
- Modify: `app/web/messages/de.json` (add `about` namespace)
- Create: `app/web/src/app/[locale]/about/page.tsx`
- Test: `app/web/src/app/[locale]/about/__tests__/about.test.tsx`

**Interfaces:**
- Consumes: `ProseShell` (Task 1); `getCachedSiteSettings` (`@/lib/site-settings`); `Link` (`@/../i18n/navigation`).
- Produces: `export function AboutContent({ githubUrl }: { githubUrl: string | null }): JSX.Element`; `export default async function AboutPage({ params }: { params: Promise<{ locale: string }> })`.

- [ ] **Step 1: Add the `about` namespace to `en.json`**

Add this top-level key to `app/web/messages/en.json` (e.g. after the last existing namespace; mind the comma before it):

```json
  "about": {
    "meta": { "title": "About" },
    "title": "About Revelio",
    "intro": "Revelio is a Scryfall-style searchable database for the Harry Potter Trading Card Game (2001, Wizards of the Coast).",
    "fanProject": "It is an unofficial, non-commercial fan project, built by and for the community of players and collectors.",
    "openSource": "Revelio is open source. <link>Browse the code on GitHub</link> to see how it's built or to contribute.",
    "creditsTitle": "Credits & thanks",
    "credits": "Thanks to the players, collectors, and preservationists whose scans, checklists, and knowledge make a project like this possible.",
    "exploreTitle": "Start exploring",
    "explore": "Browse the <sets>card sets</sets> or jump to a <random>random card</random>."
  }
```

- [ ] **Step 2: Add the `about` namespace to `de.json`**

Add the matching top-level key to `app/web/messages/de.json`:

```json
  "about": {
    "meta": { "title": "Über" },
    "title": "Über Revelio",
    "intro": "Revelio ist eine durchsuchbare Datenbank im Stil von Scryfall für das Harry Potter Trading Card Game (2001, Wizards of the Coast).",
    "fanProject": "Es ist ein inoffizielles, nicht-kommerzielles Fan-Projekt, erstellt von und für die Community aus Spielerinnen, Spielern und Sammelnden.",
    "openSource": "Revelio ist Open Source. <link>Sieh dir den Code auf GitHub an</link>, um zu erfahren, wie es gebaut ist, oder um mitzuwirken.",
    "creditsTitle": "Danksagung",
    "credits": "Danke an alle Spielenden, Sammelnden und Bewahrenden, deren Scans, Checklisten und Wissen ein Projekt wie dieses möglich machen.",
    "exploreTitle": "Loslegen",
    "explore": "Durchstöbere die <sets>Kartensets</sets> oder springe zu einer <random>zufälligen Karte</random>."
  }
```

- [ ] **Step 3: Verify JSON is still valid**

Run: `node -e "require('./app/web/messages/en.json'); require('./app/web/messages/de.json'); console.log('ok')"`
Expected: prints `ok` (no `SyntaxError` — most likely failure is a missing/extra comma).

- [ ] **Step 4: Write the failing test**

```tsx
// app/web/src/app/[locale]/about/__tests__/about.test.tsx
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}))

import { AboutContent } from '../page'

function renderAbout(locale: 'en' | 'de', messages: typeof en | typeof de, githubUrl: string | null) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AboutContent githubUrl={githubUrl} />
    </NextIntlClientProvider>,
  )
}

describe('AboutContent', () => {
  it('renders the English title', () => {
    renderAbout('en', en, null)
    expect(screen.getByRole('heading', { level: 1, name: 'About Revelio' })).toBeInTheDocument()
  })

  it('renders the German title', () => {
    renderAbout('de', de, null)
    expect(screen.getByRole('heading', { level: 1, name: 'Über Revelio' })).toBeInTheDocument()
  })

  it('shows the GitHub link only when githubUrl is set', () => {
    renderAbout('en', en, 'https://github.com/P4PER/revelio')
    const link = screen.getByRole('link', { name: /GitHub/i })
    expect(link).toHaveAttribute('href', 'https://github.com/P4PER/revelio')
  })

  it('hides the GitHub paragraph when githubUrl is null', () => {
    renderAbout('en', en, null)
    expect(screen.queryByRole('link', { name: /GitHub/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm test -w web -- "src/app/[locale]/about/__tests__/about.test.tsx"`
Expected: FAIL — cannot resolve `../page`.

- [ ] **Step 6: Write the implementation**

```tsx
// app/web/src/app/[locale]/about/page.tsx
import type { Metadata } from 'next'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { Link } from '@/../i18n/navigation'
import { ProseShell } from '@/components/legal/prose-shell'
import { getCachedSiteSettings } from '@/lib/site-settings'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('about')
  return { title: t('meta.title') }
}

export function AboutContent({ githubUrl }: { githubUrl: string | null }) {
  const t = useTranslations('about')
  return (
    <ProseShell>
      <h1>{t('title')}</h1>
      <p>{t('intro')}</p>
      <p>{t('fanProject')}</p>
      {githubUrl && (
        <p>
          {t.rich('openSource', {
            link: (chunks) => (
              <a href={githubUrl} target="_blank" rel="noopener noreferrer">
                {chunks}
              </a>
            ),
          })}
        </p>
      )}
      <h2>{t('creditsTitle')}</h2>
      <p>{t('credits')}</p>
      <h2>{t('exploreTitle')}</h2>
      <p>
        {t.rich('explore', {
          sets: (chunks) => <Link href="/sets">{chunks}</Link>,
          random: (chunks) => <Link href="/random">{chunks}</Link>,
        })}
      </p>
    </ProseShell>
  )
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const settings = await getCachedSiteSettings()
  return <AboutContent githubUrl={settings?.githubUrl ?? null} />
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -w web -- "src/app/[locale]/about/__tests__/about.test.tsx"`
Expected: PASS (4 tests).

- [ ] **Step 8: Commit**

```bash
git add app/web/messages/en.json app/web/messages/de.json app/web/src/app/[locale]/about
git commit -m "feat(web): add /about page with bilingual project narrative"
```

---

### Task 3: Privacy Policy page (`/privacy`)

GDPR Art. 13 policy grounded in the verified processing inventory. Operator/host values injected from settings; EU-only transfers; a "last updated" date constant; a good-faith / not-legal-advice note. Adds the `privacy` namespace to both locale files.

**Files:**
- Modify: `app/web/messages/en.json` (add `privacy` namespace)
- Modify: `app/web/messages/de.json` (add `privacy` namespace)
- Create: `app/web/src/app/[locale]/privacy/page.tsx`
- Test: `app/web/src/app/[locale]/privacy/__tests__/privacy.test.tsx`

**Interfaces:**
- Consumes: `ProseShell` (Task 1); `getCachedSiteSettings`.
- Produces: `export function PrivacyContent(props: { operatorName: string | null; operatorAddress: string | null; contactEmail: string | null; hostingProvider: string | null }): JSX.Element`; `export default async function PrivacyPage({ params })`.

- [ ] **Step 1: Add the `privacy` namespace to `en.json`**

```json
  "privacy": {
    "meta": { "title": "Privacy Policy" },
    "title": "Privacy Policy",
    "intro": "This policy explains what personal data Revelio processes, why, and the rights you have. It is written to reflect how this project actually works.",
    "notConfigured": "Not configured",
    "controllerTitle": "1. Controller",
    "controllerIntro": "The controller responsible for data processing on this site is:",
    "controllerContactLabel": "Email:",
    "processingTitle": "2. What we process and why",
    "accountTitle": "Account data",
    "accountBody": "When you register, we store your email address, username, display name, role, and email-verification status. Legal basis: performance of a contract (Art. 6(1)(b) GDPR).",
    "sessionTitle": "Sessions",
    "sessionBody": "To keep you signed in and protect the service, we store a session token, your IP address, and your browser's user-agent, each until the session expires. Legal basis: legitimate interest in operating and securing the service (Art. 6(1)(f) GDPR).",
    "contentTitle": "Content you create",
    "contentBody": "Decks, deck likes, and collection entries you create are linked to your account. Legal basis: performance of a contract (Art. 6(1)(b) GDPR).",
    "emailTitle": "Login and contact emails",
    "emailBody": "We send login one-time codes and, if you use the contact form, your message, via our email provider. Legal basis: performance of a contract and legitimate interest (Art. 6(1)(b), (f) GDPR).",
    "contactTitle": "Contact requests",
    "contactBody": "If you contact us, we process the name, email address, and message you provide in order to answer you. These messages are emailed to the operator and are not stored in our database. Legal basis: legitimate interest in answering enquiries (Art. 6(1)(f) GDPR).",
    "cookiesTitle": "3. Cookies",
    "cookiesBody": "We set only a strictly-necessary session cookie (to keep you signed in) and a functional cookie that remembers your language choice (NEXT_LOCALE). We use no analytics or tracking cookies, and load no third-party tracking libraries.",
    "recipientsTitle": "4. Recipients and processors",
    "recipientsBody": "Your data is processed on our hosting provider's servers. Login and contact emails are sent via STRATO (STRATO AG, Germany). Card images are stored in object storage and contain no personal data.",
    "recipientsHostLabel": "Hosting provider:",
    "transfersTitle": "5. International transfers",
    "transfersBody": "Our servers and email provider are located within the European Union. We do not transfer your personal data to countries outside the EU/EEA.",
    "retentionTitle": "6. Retention",
    "retentionBody": "Account data is kept until you delete your account. Sessions are kept until they expire. Contact emails are kept in the operator's mailbox according to normal mailbox practice.",
    "rightsTitle": "7. Your rights",
    "rightsIntro": "Under the GDPR you have the right to:",
    "rightsAccess": "access your personal data,",
    "rightsRectify": "have inaccurate data rectified,",
    "rightsErase": "have your data erased,",
    "rightsRestrict": "restrict processing,",
    "rightsPort": "receive your data in a portable format,",
    "rightsObject": "object to processing based on legitimate interest,",
    "rightsComplain": "lodge a complaint with a supervisory authority.",
    "rightsContact": "To exercise any of these rights, contact us at the email above.",
    "noteTitle": "A note",
    "note": "Revelio is a non-commercial fan project. This policy was drafted in good faith to describe how the project handles data, but it is not legal advice. Operators should have it reviewed independently.",
    "lastUpdated": "Last updated: {date, date, long}"
  }
```

- [ ] **Step 2: Add the `privacy` namespace to `de.json`**

```json
  "privacy": {
    "meta": { "title": "Datenschutzerklärung" },
    "title": "Datenschutzerklärung",
    "intro": "Diese Erklärung beschreibt, welche personenbezogenen Daten Revelio verarbeitet, zu welchem Zweck und welche Rechte du hast. Sie bildet ab, wie dieses Projekt tatsächlich funktioniert.",
    "notConfigured": "Nicht konfiguriert",
    "controllerTitle": "1. Verantwortlicher",
    "controllerIntro": "Verantwortlich für die Datenverarbeitung auf dieser Website ist:",
    "controllerContactLabel": "E-Mail:",
    "processingTitle": "2. Welche Daten wir verarbeiten und warum",
    "accountTitle": "Kontodaten",
    "accountBody": "Bei der Registrierung speichern wir deine E-Mail-Adresse, deinen Benutzernamen, deinen Anzeigenamen, deine Rolle und den Status der E-Mail-Bestätigung. Rechtsgrundlage: Erfüllung eines Vertrags (Art. 6 Abs. 1 lit. b DSGVO).",
    "sessionTitle": "Sitzungen",
    "sessionBody": "Um dich angemeldet zu halten und den Dienst zu schützen, speichern wir ein Sitzungs-Token, deine IP-Adresse und die User-Agent-Kennung deines Browsers, jeweils bis zum Ablauf der Sitzung. Rechtsgrundlage: berechtigtes Interesse am Betrieb und an der Sicherheit des Dienstes (Art. 6 Abs. 1 lit. f DSGVO).",
    "contentTitle": "Von dir erstellte Inhalte",
    "contentBody": "Decks, Deck-Likes und Sammlungseinträge, die du anlegst, sind mit deinem Konto verknüpft. Rechtsgrundlage: Erfüllung eines Vertrags (Art. 6 Abs. 1 lit. b DSGVO).",
    "emailTitle": "Login- und Kontakt-E-Mails",
    "emailBody": "Wir versenden Login-Einmalcodes und – falls du das Kontaktformular nutzt – deine Nachricht über unseren E-Mail-Dienstleister. Rechtsgrundlage: Vertragserfüllung und berechtigtes Interesse (Art. 6 Abs. 1 lit. b, f DSGVO).",
    "contactTitle": "Kontaktanfragen",
    "contactBody": "Wenn du uns kontaktierst, verarbeiten wir den von dir angegebenen Namen, deine E-Mail-Adresse und deine Nachricht, um dir zu antworten. Diese Nachrichten werden per E-Mail an den Betreiber übermittelt und nicht in unserer Datenbank gespeichert. Rechtsgrundlage: berechtigtes Interesse an der Beantwortung von Anfragen (Art. 6 Abs. 1 lit. f DSGVO).",
    "cookiesTitle": "3. Cookies",
    "cookiesBody": "Wir setzen nur ein technisch notwendiges Sitzungs-Cookie (um dich angemeldet zu halten) und ein funktionales Cookie, das deine Sprachwahl speichert (NEXT_LOCALE). Wir verwenden keine Analyse- oder Tracking-Cookies und laden keine Tracking-Bibliotheken von Dritten.",
    "recipientsTitle": "4. Empfänger und Auftragsverarbeiter",
    "recipientsBody": "Deine Daten werden auf den Servern unseres Hosting-Anbieters verarbeitet. Login- und Kontakt-E-Mails werden über STRATO (STRATO AG, Deutschland) versendet. Kartenbilder werden in einem Objektspeicher abgelegt und enthalten keine personenbezogenen Daten.",
    "recipientsHostLabel": "Hosting-Anbieter:",
    "transfersTitle": "5. Übermittlung in Drittländer",
    "transfersBody": "Unsere Server und unser E-Mail-Dienstleister befinden sich innerhalb der Europäischen Union. Wir übermitteln deine personenbezogenen Daten nicht in Länder außerhalb der EU/des EWR.",
    "retentionTitle": "6. Speicherdauer",
    "retentionBody": "Kontodaten werden gespeichert, bis du dein Konto löschst. Sitzungen werden bis zu ihrem Ablauf gespeichert. Kontakt-E-Mails verbleiben gemäß üblicher Postfach-Praxis im Postfach des Betreibers.",
    "rightsTitle": "7. Deine Rechte",
    "rightsIntro": "Nach der DSGVO hast du das Recht:",
    "rightsAccess": "auf Auskunft über deine personenbezogenen Daten,",
    "rightsRectify": "auf Berichtigung unrichtiger Daten,",
    "rightsErase": "auf Löschung deiner Daten,",
    "rightsRestrict": "auf Einschränkung der Verarbeitung,",
    "rightsPort": "auf Datenübertragbarkeit,",
    "rightsObject": "auf Widerspruch gegen eine auf berechtigtem Interesse beruhende Verarbeitung,",
    "rightsComplain": "auf Beschwerde bei einer Aufsichtsbehörde.",
    "rightsContact": "Zur Ausübung dieser Rechte kontaktiere uns unter der oben genannten E-Mail-Adresse.",
    "noteTitle": "Hinweis",
    "note": "Revelio ist ein nicht-kommerzielles Fan-Projekt. Diese Erklärung wurde nach bestem Wissen erstellt, um die Datenverarbeitung des Projekts zu beschreiben; sie stellt keine Rechtsberatung dar. Betreiber sollten sie unabhängig prüfen lassen.",
    "lastUpdated": "Zuletzt aktualisiert: {date, date, long}"
  }
```

- [ ] **Step 3: Verify JSON is still valid**

Run: `node -e "require('./app/web/messages/en.json'); require('./app/web/messages/de.json'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 4: Write the failing test**

```tsx
// app/web/src/app/[locale]/privacy/__tests__/privacy.test.tsx
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'
import { PrivacyContent } from '../page'

type Props = React.ComponentProps<typeof PrivacyContent>

const FULL: Props = {
  operatorName: 'Jane Doe',
  operatorAddress: '1 Main St\n12345 Berlin',
  contactEmail: 'hi@example.com',
  hostingProvider: 'Hetzner',
}

function renderPrivacy(locale: 'en' | 'de', messages: typeof en | typeof de, props: Props) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <PrivacyContent {...props} />
    </NextIntlClientProvider>,
  )
}

describe('PrivacyContent', () => {
  it('renders the English title and injects operator values', () => {
    renderPrivacy('en', en, FULL)
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument()
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument()
    expect(screen.getByText(/hi@example\.com/)).toBeInTheDocument()
    expect(screen.getByText(/Hetzner/)).toBeInTheDocument()
  })

  it('states EU-only transfers', () => {
    renderPrivacy('en', en, FULL)
    expect(screen.getByText(/within the European Union/)).toBeInTheDocument()
  })

  it('renders the German title', () => {
    renderPrivacy('de', de, FULL)
    expect(screen.getByRole('heading', { level: 1, name: 'Datenschutzerklärung' })).toBeInTheDocument()
  })

  it('falls back to "Not configured" when operator values are null', () => {
    renderPrivacy('en', en, {
      operatorName: null,
      operatorAddress: null,
      contactEmail: null,
      hostingProvider: null,
    })
    expect(screen.getAllByText(/Not configured/).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm test -w web -- "src/app/[locale]/privacy/__tests__/privacy.test.tsx"`
Expected: FAIL — cannot resolve `../page`.

- [ ] **Step 6: Write the implementation**

```tsx
// app/web/src/app/[locale]/privacy/page.tsx
import type { Metadata } from 'next'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { ProseShell } from '@/components/legal/prose-shell'
import { getCachedSiteSettings } from '@/lib/site-settings'

export const dynamic = 'force-dynamic'

const LAST_UPDATED = new Date('2026-07-22T00:00:00Z')

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('privacy')
  return { title: t('meta.title') }
}

export function PrivacyContent({
  operatorName,
  operatorAddress,
  contactEmail,
  hostingProvider,
}: {
  operatorName: string | null
  operatorAddress: string | null
  contactEmail: string | null
  hostingProvider: string | null
}) {
  const t = useTranslations('privacy')
  const nc = t('notConfigured')
  return (
    <ProseShell>
      <h1>{t('title')}</h1>
      <p>{t('intro')}</p>

      <h2>{t('controllerTitle')}</h2>
      <p>{t('controllerIntro')}</p>
      <p className="whitespace-pre-line">{`${operatorName ?? nc}\n${operatorAddress ?? nc}`}</p>
      <p>
        {t('controllerContactLabel')} {contactEmail ?? nc}
      </p>

      <h2>{t('processingTitle')}</h2>
      <h3>{t('accountTitle')}</h3>
      <p>{t('accountBody')}</p>
      <h3>{t('sessionTitle')}</h3>
      <p>{t('sessionBody')}</p>
      <h3>{t('contentTitle')}</h3>
      <p>{t('contentBody')}</p>
      <h3>{t('emailTitle')}</h3>
      <p>{t('emailBody')}</p>
      <h3>{t('contactTitle')}</h3>
      <p>{t('contactBody')}</p>

      <h2>{t('cookiesTitle')}</h2>
      <p>{t('cookiesBody')}</p>

      <h2>{t('recipientsTitle')}</h2>
      <p>{t('recipientsBody')}</p>
      <p>
        {t('recipientsHostLabel')} {hostingProvider ?? nc}
      </p>

      <h2>{t('transfersTitle')}</h2>
      <p>{t('transfersBody')}</p>

      <h2>{t('retentionTitle')}</h2>
      <p>{t('retentionBody')}</p>

      <h2>{t('rightsTitle')}</h2>
      <p>{t('rightsIntro')}</p>
      <ul>
        <li>{t('rightsAccess')}</li>
        <li>{t('rightsRectify')}</li>
        <li>{t('rightsErase')}</li>
        <li>{t('rightsRestrict')}</li>
        <li>{t('rightsPort')}</li>
        <li>{t('rightsObject')}</li>
        <li>{t('rightsComplain')}</li>
      </ul>
      <p>{t('rightsContact')}</p>

      <h2>{t('noteTitle')}</h2>
      <p>{t('note')}</p>

      <p className="mt-8 text-xs text-muted-foreground/70">
        {t('lastUpdated', { date: LAST_UPDATED })}
      </p>
    </ProseShell>
  )
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const settings = await getCachedSiteSettings()
  return (
    <PrivacyContent
      operatorName={settings?.operatorName ?? null}
      operatorAddress={settings?.operatorAddress ?? null}
      contactEmail={settings?.contactEmail ?? null}
      hostingProvider={settings?.hostingProvider ?? null}
    />
  )
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -w web -- "src/app/[locale]/privacy/__tests__/privacy.test.tsx"`
Expected: PASS (4 tests).

- [ ] **Step 8: Commit**

```bash
git add app/web/messages/en.json app/web/messages/de.json app/web/src/app/[locale]/privacy
git commit -m "feat(web): add /privacy GDPR policy grounded in processing inventory"
```

---

### Task 4: Imprint page (`/imprint`)

§5 DDG provider info + §18(2) MStV responsible person (only when set) + standard liability/copyright clauses, native in both locales. Reuses the footer's `disclaimer` string. Operator fields fall back to a marked "not configured" rather than blank legal fields. Adds the `imprint` namespace to both locale files. No "last updated" (locked decision).

**Files:**
- Modify: `app/web/messages/en.json` (add `imprint` namespace)
- Modify: `app/web/messages/de.json` (add `imprint` namespace)
- Create: `app/web/src/app/[locale]/imprint/page.tsx`
- Test: `app/web/src/app/[locale]/imprint/__tests__/imprint.test.tsx`

**Interfaces:**
- Consumes: `ProseShell` (Task 1); `getCachedSiteSettings`; `BRAND_NAME` (`@/lib/brand`); the existing `footer.disclaimer` message key.
- Produces: `export function ImprintContent(props: { operatorName: string | null; operatorAddress: string | null; contactEmail: string | null; responsiblePerson: string | null }): JSX.Element`; `export default async function ImprintPage({ params })`.

- [ ] **Step 1: Add the `imprint` namespace to `en.json`**

```json
  "imprint": {
    "meta": { "title": "Imprint" },
    "title": "Imprint",
    "notConfigured": "Not configured",
    "providerTitle": "Information pursuant to § 5 DDG",
    "contactLabel": "Email:",
    "responsibleTitle": "Responsible for content pursuant to § 18(2) MStV",
    "liabilityContentTitle": "Liability for content",
    "liabilityContentBody": "As a service provider we are responsible for our own content on these pages under general law. We are not obliged to monitor transmitted or stored third-party information or to investigate circumstances that indicate unlawful activity. Obligations to remove or block the use of information under general law remain unaffected.",
    "liabilityLinksTitle": "Liability for links",
    "liabilityLinksBody": "Our pages contain links to external websites over whose content we have no control. We accept no liability for this third-party content. The respective provider or operator of the linked pages is always responsible for their content. If we become aware of legal violations, we will remove such links promptly.",
    "copyrightTitle": "Copyright",
    "copyrightBody": "Content created by the operators of these pages is subject to copyright. Contributions by third parties are marked as such. Reproduction, editing, distribution, or any kind of use beyond what copyright permits requires the written consent of the respective author or creator."
  }
```

- [ ] **Step 2: Add the `imprint` namespace to `de.json`**

```json
  "imprint": {
    "meta": { "title": "Impressum" },
    "title": "Impressum",
    "notConfigured": "Nicht konfiguriert",
    "providerTitle": "Angaben gemäß § 5 DDG",
    "contactLabel": "E-Mail:",
    "responsibleTitle": "Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV",
    "liabilityContentTitle": "Haftung für Inhalte",
    "liabilityContentBody": "Als Diensteanbieter sind wir für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Wir sind nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen. Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt.",
    "liabilityLinksTitle": "Haftung für Links",
    "liabilityLinksBody": "Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber verantwortlich. Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Links umgehend entfernen.",
    "copyrightTitle": "Urheberrecht",
    "copyrightBody": "Die durch die Betreiber dieser Seiten erstellten Inhalte unterliegen dem Urheberrecht. Beiträge Dritter sind als solche gekennzeichnet. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechts bedürfen der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers."
  }
```

- [ ] **Step 3: Verify JSON is still valid**

Run: `node -e "require('./app/web/messages/en.json'); require('./app/web/messages/de.json'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 4: Write the failing test**

```tsx
// app/web/src/app/[locale]/imprint/__tests__/imprint.test.tsx
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'
import { ImprintContent } from '../page'

type Props = React.ComponentProps<typeof ImprintContent>

const BASE: Props = {
  operatorName: 'Jane Doe',
  operatorAddress: '1 Main St\n12345 Berlin',
  contactEmail: 'hi@example.com',
  responsiblePerson: null,
}

function renderImprint(locale: 'en' | 'de', messages: typeof en | typeof de, props: Props) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ImprintContent {...props} />
    </NextIntlClientProvider>,
  )
}

describe('ImprintContent', () => {
  it('renders the English title and provider info', () => {
    renderImprint('en', en, BASE)
    expect(screen.getByRole('heading', { level: 1, name: 'Imprint' })).toBeInTheDocument()
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument()
    expect(screen.getByText(/hi@example\.com/)).toBeInTheDocument()
  })

  it('renders the German title (Impressum)', () => {
    renderImprint('de', de, BASE)
    expect(screen.getByRole('heading', { level: 1, name: 'Impressum' })).toBeInTheDocument()
  })

  it('shows the responsible-person section only when set', () => {
    renderImprint('en', en, { ...BASE, responsiblePerson: 'Jane Doe' })
    expect(
      screen.getByRole('heading', { name: /Responsible for content/i }),
    ).toBeInTheDocument()
  })

  it('hides the responsible-person section when null', () => {
    renderImprint('en', en, BASE)
    expect(
      screen.queryByRole('heading', { name: /Responsible for content/i }),
    ).not.toBeInTheDocument()
  })

  it('reuses the footer fan-project disclaimer', () => {
    renderImprint('en', en, BASE)
    expect(screen.getByText(/unofficial, non-commercial fan project/i)).toBeInTheDocument()
  })

  it('falls back to "Not configured" when provider fields are null', () => {
    renderImprint('en', en, {
      operatorName: null,
      operatorAddress: null,
      contactEmail: null,
      responsiblePerson: null,
    })
    expect(screen.getAllByText(/Not configured/).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm test -w web -- "src/app/[locale]/imprint/__tests__/imprint.test.tsx"`
Expected: FAIL — cannot resolve `../page`.

- [ ] **Step 6: Write the implementation**

```tsx
// app/web/src/app/[locale]/imprint/page.tsx
import type { Metadata } from 'next'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { useTranslations } from 'next-intl'
import { ProseShell } from '@/components/legal/prose-shell'
import { getCachedSiteSettings } from '@/lib/site-settings'
import { BRAND_NAME } from '@/lib/brand'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('imprint')
  return { title: t('meta.title') }
}

export function ImprintContent({
  operatorName,
  operatorAddress,
  contactEmail,
  responsiblePerson,
}: {
  operatorName: string | null
  operatorAddress: string | null
  contactEmail: string | null
  responsiblePerson: string | null
}) {
  const t = useTranslations('imprint')
  const tf = useTranslations('footer')
  const nc = t('notConfigured')
  return (
    <ProseShell>
      <h1>{t('title')}</h1>

      <h2>{t('providerTitle')}</h2>
      <p className="whitespace-pre-line">{`${operatorName ?? nc}\n${operatorAddress ?? nc}`}</p>
      <p>
        {t('contactLabel')} {contactEmail ?? nc}
      </p>

      {responsiblePerson && (
        <>
          <h2>{t('responsibleTitle')}</h2>
          <p className="whitespace-pre-line">{responsiblePerson}</p>
        </>
      )}

      <h2>{t('liabilityContentTitle')}</h2>
      <p>{t('liabilityContentBody')}</p>
      <h2>{t('liabilityLinksTitle')}</h2>
      <p>{t('liabilityLinksBody')}</p>
      <h2>{t('copyrightTitle')}</h2>
      <p>{t('copyrightBody')}</p>

      <p className="mt-8 text-xs leading-relaxed text-muted-foreground/70">
        {tf('disclaimer', { brand: BRAND_NAME })}
      </p>
    </ProseShell>
  )
}

export default async function ImprintPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const settings = await getCachedSiteSettings()
  return (
    <ImprintContent
      operatorName={settings?.operatorName ?? null}
      operatorAddress={settings?.operatorAddress ?? null}
      contactEmail={settings?.contactEmail ?? null}
      responsiblePerson={settings?.responsiblePerson ?? null}
    />
  )
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -w web -- "src/app/[locale]/imprint/__tests__/imprint.test.tsx"`
Expected: PASS (6 tests).

- [ ] **Step 8: Commit**

```bash
git add app/web/messages/en.json app/web/messages/de.json app/web/src/app/[locale]/imprint
git commit -m "feat(web): add /imprint (Impressum) with §5 DDG + §18 MStV clauses"
```

---

### Task 5: Full verification

Confirm the whole feature typechecks, lints, and passes the full suite together, and that the pages resolve at runtime in both locales.

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run (from `app/`): `npm run typecheck`
Expected: PASS, no errors.

- [ ] **Step 2: Lint the web workspace**

Run (from `app/`): `npm run lint -w web`
Expected: PASS. (Watch for `react/no-unescaped-entities` on apostrophes in JSX — the plan keeps all prose in message JSON, so there should be none.)

- [ ] **Step 3: Run the full web test suite**

Run (from `app/`): `npm test -w web`
Expected: PASS — all prior tests plus the four new files (prose-shell, about, privacy, imprint).

- [ ] **Step 4: Manual smoke check (optional but recommended)**

Run (from `app/`): `npm run dev -w web`, then visit `/about`, `/de/about`, `/privacy`, `/de/privacy`, `/imprint`, `/de/imprint`. Confirm:
- Operator name/address/email appear on `/privacy` and `/imprint` (or "Not configured" if the settings row is unset).
- `/privacy` shows a "Last updated" line; `/imprint` does not.
- The About GitHub link appears only when `githubUrl` is configured in `/admin/settings`.
- Footer links to all three pages now resolve (no 404 / catch-all).

- [ ] **Step 5: Final commit (if any verification fixups were needed)**

```bash
git add -A
git commit -m "chore(web): verification fixups for legal/about pages"
```

---

## Notes for the implementer

- **JSON insertion.** Add each namespace as a new top-level key. The safest spot is at the end of the object — add a comma after the current last namespace's closing `}`, then paste the new block before the file's final `}`. `en.json` currently ends with the `email` namespace; `de.json` ends with `errors` (a pre-existing en/de structural difference — do **not** try to "fix" it here; just add the three new namespaces to both). Always re-run the Step-3 `node -e` JSON validity check after editing.
- **Why views use `useTranslations` (a "client" hook) in server components.** next-intl's `useTranslations` is isomorphic — it works synchronously in Server Components and inside `NextIntlClientProvider` in tests. This is the exact pattern `SiteFooterView` uses; do not add `'use client'`.
- **`t.rich` tag names** in the About messages (`<link>`, `<sets>`, `<random>`) must match the keys in the `t.rich(...)` handler object. If you rename one, rename both.
- **Do not** add Claude/Claude Code attribution to commits (per project memory).
