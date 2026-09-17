# Web Date Formatting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Print stored calendar days in UTC explicitly, and format deck timestamps through next-intl so they follow the app time zone on the server and in the browser.

**Architecture:** Two kinds of date are shown today. *Calendar days* (terms effective date, legal "last updated", a ban's end) are stored at UTC midnight and currently print correctly only because `TIME_ZONE = 'Europe/Berlin'` is always ahead of UTC. They get a named next-intl format, `calendarDay`, that carries `timeZone: 'UTC'` itself. *Instants* (a deck's `updatedAt`) are formatted with plain `Intl.DateTimeFormat` in two client components. That uses the host zone during SSR and the browser zone after hydration, so they move to `useFormatter()`, which applies the configured `TIME_ZONE`. Showing instants in the viewer's own zone is a separate follow-up and out of scope here.

**Tech Stack:** Next.js 16, next-intl 4.14.2 (use-intl), Vitest + Testing Library.

**Spec:** none; the design was agreed in conversation on 2026-09-17 and is summarised here. Follow-up (not this plan): a viewer time zone cookie read by `i18n/request.ts`.

## Global Constraints

- Every user-facing string stays in `messages/en.json` + `messages/de.json`.
- Code comments are ASCII-only (no em-dashes, no unicode arrows).
- `type` aliases, `import type` for type-only imports.
- Commits: Conventional Commits, scope `web`, no tool attribution. Sign with `git -c gpg.program=/opt/homebrew/bin/gpg commit`.
- Run commands from `app/` with `/usr/local/bin/npm` (npm is not on the default PATH).
- `rejects.toThrow` is broken in this workspace; not needed here.

## Why these mechanics (verified in node_modules)

- `use-intl/dist/esm/development/format-message/index.js` `convertFormatsToIntlMessageFormat` merges the global zone as `{ timeZone, ...value }`, so a named format that sets its own `timeZone` keeps it.
- `intl-messageformat` treats an unknown style name (`{date, date, calendarDay}` with no `calendarDay` format registered) as "no options": it prints a short numeric date in the global zone and does **not** throw. So every provider and translator that renders these messages must receive `FORMATS`; the tests below match the long month name, which fails loudly if it is missing.
- `NextIntlClientProviderServer` fills `formats` from `getFormats()` when the prop is omitted, so `[locale]/layout.tsx` needs no change once `i18n/request.ts` returns `formats`.
- `date-picker.tsx` is deliberately **not** changed: `parseYMD` builds a *local* midnight and `Intl.DateTimeFormat` formats it in the same local zone, so server and browser each print the stored `YYYY-MM-DD`. Routing it through `TIME_ZONE` would shift it a day for a viewer east of Berlin.

## File Structure

- Create `app/web/i18n/formats.ts`: the app-wide next-intl `FORMATS` (one entry, `dateTime.calendarDay`).
- Modify `app/web/i18n/time-zone.ts`: comment no longer relies on Berlin being ahead of UTC.
- Modify `app/web/i18n/request.ts`: return `formats: FORMATS`.
- Modify `app/web/messages/en.json`, `app/web/messages/de.json`: three messages switch `long` to `calendarDay`.
- Modify `app/web/src/lib/email/ban-template.tsx`: pass `formats: FORMATS` to `createTranslator`.
- Modify `app/web/src/test/intl.tsx`: pass `formats={FORMATS}`.
- Modify tests: `i18n/__tests__/request.test.ts`, `src/components/legal/__tests__/legal-mdx.test.tsx`, `src/app/[locale]/terms/__tests__/terms.test.tsx`, `src/app/[locale]/privacy/__tests__/privacy.test.tsx`, `src/lib/email/__tests__/ban-template.test.tsx`.
- Modify `app/web/src/components/deck/deck-header.tsx`, `app/web/src/components/deck/deck-list.tsx` and their tests.

---

### Task 1: Calendar days format in UTC

**Files:**
- Create: `app/web/i18n/formats.ts`
- Modify: `app/web/i18n/time-zone.ts`, `app/web/i18n/request.ts`, `app/web/messages/en.json:672,959,968`, `app/web/messages/de.json:917,927,936`, `app/web/src/lib/email/ban-template.tsx:25`, `app/web/src/test/intl.tsx`
- Test: `app/web/i18n/__tests__/request.test.ts`, `app/web/src/components/legal/__tests__/legal-mdx.test.tsx`, `app/web/src/app/[locale]/terms/__tests__/terms.test.tsx`, `app/web/src/app/[locale]/privacy/__tests__/privacy.test.tsx`, `app/web/src/lib/email/__tests__/ban-template.test.tsx`

**Interfaces:**
- Produces: `export const FORMATS` from `i18n/formats.ts`, typed `satisfies Formats` (from `next-intl`), with `FORMATS.dateTime.calendarDay = { dateStyle: 'long', timeZone: 'UTC' }`. ICU usage: `{date, date, calendarDay}`.

- [ ] **Step 1: Write the failing tests**

The zone used to prove the bug is `America/Los_Angeles`: UTC midnight there is the previous evening, so any path still formatting in the provider zone prints the day before.

`i18n/__tests__/request.test.ts`: add the import and a test after "formats every date in the app time zone":

```ts
import { FORMATS } from '../formats'
```

```ts
  // Calendar days carry their own zone; the provider only has to hand it on.
  it('registers the app date formats', async () => {
    rootLocale.mockResolvedValue('en')
    const config = await loadConfig({})
    expect(config.formats).toBe(FORMATS)
  })
```

`src/components/legal/__tests__/legal-mdx.test.tsx`: replace the import of `TIME_ZONE` with `import { FORMATS } from '@/../i18n/formats'`, add `formats={FORMATS}` to the provider in `renderIn`, and replace the test "keeps the calendar day in the app time zone" with:

```tsx
  // The date is UTC midnight; a zone behind UTC must not print the day before.
  it('keeps the calendar day in a zone behind UTC', () => {
    const { container } = render(
      <NextIntlClientProvider locale="de" messages={de} timeZone="America/Los_Angeles" formats={FORMATS}>
        <LastUpdated date="2026-09-16" />
      </NextIntlClientProvider>,
    )
    expect(container.querySelector('p')?.textContent).toBe('Zuletzt aktualisiert: 16. September 2026')
  })
```

`src/app/[locale]/terms/__tests__/terms.test.tsx`: replace the `TIME_ZONE` import with `import { FORMATS } from '@/../i18n/formats'`, add `formats={FORMATS}` to the provider in `renderTerms`, and replace the test "keeps the effective day in the app time zone" with:

```tsx
  // The effective date is UTC midnight; a zone behind UTC must not print it as
  // the day before, or the page would contradict TERMS_VERSION.
  it('keeps the effective day in a zone behind UTC', () => {
    render(
      <NextIntlClientProvider locale="de" messages={de} timeZone="America/Los_Angeles" formats={FORMATS}>
        <TermsContent Document={TermsDe as MDXContent} {...FULL} />
      </NextIntlClientProvider>,
    )
    const [year, month, day] = TERMS_VERSION.split('-').map(Number)
    const expected = `Gültig ab ${day}. ${GERMAN_MONTHS[month - 1]} ${year}`
    expect(screen.getByText(expected)).toBeInTheDocument()
  })
```

`src/app/[locale]/privacy/__tests__/privacy.test.tsx`: add `import { FORMATS } from '@/../i18n/formats'` and `formats={FORMATS}` to the provider in `renderPrivacy` (its existing `/^Last updated: \w+ \d{1,2}, \d{4}$/` assertion is the guard).

`src/lib/email/__tests__/ban-template.test.tsx`: add a test. The template reads `TIME_ZONE` at module scope, so mock it to a zone behind UTC for this file only by putting the case in its own file, `src/lib/email/__tests__/ban-template-time-zone.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderBanEmail } from '../ban-template'

// A ban ends on a calendar day stored at UTC midnight. With the app zone behind
// UTC the notice must still name that day, not the evening before.
vi.mock('@/../i18n/time-zone', () => ({ TIME_ZONE: 'America/Los_Angeles' }))

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://revelio.test')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('renderBanEmail time zone', () => {
  it('names the stored end day whatever the app zone', async () => {
    const { text } = await renderBanEmail({
      reason: 'Spam',
      expiresAt: new Date('2030-01-01T00:00:00Z'),
      contactEmail: '',
    })
    expect(text).toContain('January 1, 2030')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `app/`): `/usr/local/bin/npm test -w web -- i18n/__tests__/request.test.ts src/components/legal/__tests__/legal-mdx.test.tsx 'src/app/[locale]/terms/__tests__/terms.test.tsx' 'src/app/[locale]/privacy/__tests__/privacy.test.tsx' src/lib/email/__tests__/ban-template-time-zone.test.tsx`

Expected: FAIL. The test files importing `@/../i18n/formats` fail to resolve the module; once it exists (Step 3) and before the messages change, the Los Angeles cases print "15. September 2026" / "December 31, 2029".

- [ ] **Step 3: Implement**

Create `app/web/i18n/formats.ts`:

```ts
import type { Formats } from 'next-intl'

// App-wide named formats for ICU messages ({date, date, calendarDay}).
//
// calendarDay is for days stored at UTC midnight: the terms effective date, a
// legal page's last update, a ban's end. It pins its own zone to UTC, so the
// day prints as stored whatever the app or viewer zone is. next-intl merges the
// global zone in underneath a format's own settings, so this one wins.
//
// Every translator that renders such a message must receive these formats. An
// unregistered style name does not throw; it silently prints a short numeric
// date in the global zone.
export const FORMATS = {
  dateTime: {
    calendarDay: { dateStyle: 'long', timeZone: 'UTC' },
  },
} satisfies Formats
```

Replace the comment in `app/web/i18n/time-zone.ts` (keep the export):

```ts
// The zone instants (a deck's last update) are formatted in, on the server and
// in the browser. Without it next-intl falls back to the host's own zone, so the
// server and the browser could print different days for the same moment.
// Calendar days stored at UTC midnight do not depend on it; they use the
// calendarDay format in formats.ts, which pins UTC.
//
// Its own module rather than request.ts, which pulls in request-scoped Next
// APIs that the email templates must not import.
export const TIME_ZONE = 'Europe/Berlin'
```

`app/web/i18n/request.ts`: add `import { FORMATS } from './formats'` and `formats: FORMATS,` after `timeZone: TIME_ZONE,`.

Messages, replace `{date, date, long}` with `{date, date, calendarDay}` in:
- `messages/en.json`: `email.ban.measureTemporary`, `legal.lastUpdated`, `terms.effective` (the `"effective"` key).
- `messages/de.json`: the same three keys.

`app/web/src/lib/email/ban-template.tsx`: add `import { FORMATS } from '@/../i18n/formats'` and pass it:

```ts
  return createTranslator({
    locale,
    messages: EMAIL_MESSAGES[locale],
    namespace: 'email.ban',
    timeZone: TIME_ZONE,
    formats: FORMATS,
  })
```

`app/web/src/test/intl.tsx`: add `import { FORMATS } from '../../i18n/formats'` and `formats={FORMATS}` on the provider.

Update the `LastUpdated` doc comment in `src/components/legal/legal-mdx.tsx` (last sentence) to: `The day is read as UTC midnight, like every calendar day the app stores, and printed with the calendarDay format; see i18n/formats.ts.`

- [ ] **Step 4: Run the tests to verify they pass**

Same command as Step 2. Expected: PASS.

Then check no other test renders these messages without `FORMATS`:

Run: `grep -rn "Last updated\|Effective from\|Zuletzt\|Gültig ab\|suspended your Revelio account until" app/web/src --include='*.test.tsx'`
Expected: only the files already updated above.

Mutation check: temporarily change `timeZone: 'UTC'` in `formats.ts` to `timeZone: 'America/Los_Angeles'`, rerun Step 2's command, confirm the three zone tests fail, revert.

- [ ] **Step 5: Commit**

```bash
git add app/web/i18n app/web/messages app/web/src/lib/email app/web/src/test/intl.tsx app/web/src/components/legal "app/web/src/app/[locale]/terms/__tests__" "app/web/src/app/[locale]/privacy/__tests__"
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "fix(web): print stored calendar days in UTC" -m "Terms, legal and ban-end dates are stored at UTC midnight and printed
correctly only because Europe/Berlin is ahead of UTC. A calendarDay
format now pins UTC itself, so the day no longer depends on the app
zone."
```

---

### Task 2: Deck dates follow the app time zone

**Files:**
- Modify: `app/web/src/components/deck/deck-header.tsx:2,42-43`, `app/web/src/components/deck/deck-list.tsx:3,39,47,276`
- Test: `app/web/src/components/deck/__tests__/deck-header.test.tsx`, `app/web/src/components/deck/__tests__/deck-list.test.tsx`

**Interfaces:**
- Consumes: the global `timeZone` from the provider (`TIME_ZONE` in the app, set per test here).

- [ ] **Step 1: Write the failing tests**

Test instant: `2026-07-01T10:00:00Z` is 00:00 on July 2 in `Pacific/Kiritimati` (UTC+14) and still July 1 in every host zone from UTC-12 to UTC+13, so a formatter using the host zone instead of the provider zone prints "Jul 1, 2026".

`deck-header.test.tsx`: add imports and a test:

```tsx
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
```

```tsx
  // Formatted in the provider zone, not the host's: SSR and hydration must print
  // the same day.
  it('prints the updated date in the configured time zone', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="Pacific/Kiritimati">
        <DeckHeader {...base} updatedAt="2026-07-01T10:00:00.000Z" />
      </NextIntlClientProvider>,
    )
    expect(screen.getByText(/Jul 2, 2026/)).toBeInTheDocument()
  })
```

`deck-list.test.tsx`: add a test inside the top-level `describe`:

```tsx
  // Formatted in the provider zone, not the host's: SSR and hydration must print
  // the same day.
  it('prints the updated date in the configured time zone', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="Pacific/Kiritimati">
        <DeckList decks={[{ ...decks[0], updatedAt: '2026-07-01T10:00:00.000Z' }]} />
      </NextIntlClientProvider>,
    )
    expect(screen.getByText(/Jul 2, 2026/)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `app/`): `/usr/local/bin/npm test -w web -- src/components/deck/__tests__/deck-header.test.tsx src/components/deck/__tests__/deck-list.test.tsx -t "configured time zone"`
Expected: FAIL, "Unable to find an element with the text: /Jul 2, 2026/".

- [ ] **Step 3: Implement**

`deck-header.tsx`: import `useFormatter` instead of `useLocale`, and replace lines 42-43:

```tsx
import { useFormatter, useTranslations } from 'next-intl'
```

```tsx
  const format = useFormatter()
  const updated = format.dateTime(new Date(props.updatedAt), { dateStyle: 'medium' })
```

`deck-list.tsx`: import `useFormatter` instead of `useLocale` (check `locale` has no other use in the file first: `grep -n "locale" app/web/src/components/deck/deck-list.tsx`), replace `const locale = useLocale()` with `const format = useFormatter()`, delete the `dateFormatter` line, and at line 276:

```tsx
              <span>{t('list.updatedAt', { date: format.dateTime(new Date(deck.updatedAt), { dateStyle: 'medium' }) })}</span>
```

Apply the same `grep -n "locale"` check to `deck-header.tsx` before removing `useLocale`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `/usr/local/bin/npm test -w web -- src/components/deck/__tests__/deck-header.test.tsx src/components/deck/__tests__/deck-list.test.tsx`
Expected: PASS, whole files.

- [ ] **Step 5: Commit**

```bash
git add app/web/src/components/deck
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "fix(web): format deck dates in the app time zone" -m "Plain Intl.DateTimeFormat used the host zone during SSR and the browser
zone after hydration, so the updated date could differ between the two
around midnight. useFormatter applies the configured zone in both."
```

---

### Task 3: Verify and open the PR

- [ ] **Step 1: Full checks** (from `app/`, Docker stack up for integration tests)

```bash
/usr/local/bin/npm test -w web
/usr/local/bin/npm run typecheck
/usr/local/bin/npm run lint
/usr/local/bin/npm run build -w web
```

Expected: all green. Record the real test counts for the PR.

- [ ] **Step 2: Visual check** of `/en/terms`, `/de/privacy` and a deck page with the repo's Playwright chromium: dates show a long month name (legal) and a medium date (deck), no numeric fallback.

- [ ] **Step 3: Push and open the PR**

Title: `fix(web): format calendar days in utc and deck dates in the app zone`. Body opens with prose, then `## What changed`, `## Verification` (only commands actually run), `## Notes for review` (why `date-picker.tsx` is untouched; the viewer time zone cookie is a separate follow-up). Link this plan. No deployment steps.
