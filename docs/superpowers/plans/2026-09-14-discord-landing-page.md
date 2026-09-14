# Discord Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/[locale]/discord`, a landing page that converts a visitor into a bot install and then tells them what they can type.

**Architecture:** A server component shaped exactly like `/about` — an async default export that reads site settings, plus an exported presentational view that tests render directly. The page is a split hero (pitch + install button beside a static Discord channel mockup) over a command grid. The install URL is a new nullable `site_settings` column, so an admin can set it without a deploy and every install affordance hides itself when it is null. Discord embeds in the channel mockup are hand-built HTML, not screenshots.

**Tech Stack:** Next.js 16 App Router, React 19, next-intl, Tailwind v4 + shadcn, Drizzle (Postgres), Vitest + Testing Library.

**Spec:** No spec file — this was a bounded design agreed in chat. The visual design of record is the mockup artifact at https://claude.ai/code/artifact/a422251d-dfdb-4aa7-a32f-ed7ac598a396 ("The page", marked *Agreed*). Consult it for layout, copy and the embed anatomy before writing any markup.

## Global Constraints

- **All commands run from `app/`.** It is the npm workspaces root. There is no root-level `package.json`.
- **Every user-facing string comes from `web/messages/en.json` and `de.json`.** No hardcoded copy, including button labels, the channel mockup's embed text, and image alt text.
- **`type` aliases, never `interface`.** Type-only imports say `type`. Declaration order in a file: types → constants → helpers → exported functions.
- **`src/lib/server/` modules start with `import 'server-only'`.** The new page reads settings through the existing `getCachedSiteSettings()`; do not add a new server module.
- **No barrel files in `src/components`.** Import the leaf path.
- **Components live in the domain folder that owns them:** `web/src/components/discord/`.
- **Code comments are ASCII only.** No em-dashes, no unicode arrows.
- **Commits are Conventional Commits**, `type(scope): subject`, imperative, lower case, no trailing period, no tool attribution. Scope is `discord` for the new domain, `db` for the schema, `admin` for the settings form.
- **The schema edit and its generated migration are one commit**, and that commit lands *before* `npm run verify` runs — verify's git-clean step deletes an uncommitted migration.
- **Never `rm` or regenerate `db/drizzle/0000_*.sql`.** Migrations are append-only. The next file is `0014_*.sql`.

---

### Task 1: `discord_invite_url` on site settings

Adds the nullable column, threads it through the DTO, the Zod schema, the server action and the admin form, so an admin can save the bot install URL. Nothing renders it yet.

**Files:**
- Modify: `app/db/src/schema.ts:213-222` (the `siteSettings` table)
- Create: `app/db/drizzle/0014_*.sql` (generated, do not hand-write)
- Modify: `app/db/src/queries/site-settings.ts` (the `SiteSettingsInput` type)
- Modify: `app/web/src/lib/schemas/site-settings.ts`
- Modify: `app/web/src/lib/actions/site-settings-actions.ts`
- Modify: `app/web/src/components/admin/site-settings-form.tsx`
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json` (the `adminSettings` block)
- Test: `app/web/src/lib/actions/__tests__/site-settings-actions.test.ts`
- Test: `app/web/src/components/admin/__tests__/site-settings-form.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `SiteSettings.discordInviteUrl: string | null` (from `typeof siteSettings.$inferSelect`), reachable in `web` via `getCachedSiteSettings()`. Tasks 3 and 6 read it.

- [x] **Step 1: Write the failing action test**

Append to `app/web/src/lib/actions/__tests__/site-settings-actions.test.ts`, inside the existing top-level `describe`. Read the file first: it already mocks `requireRole`, `getDb` and `upsertSiteSettings`; reuse those mocks rather than adding new ones, and copy the shape of the neighbouring "persists" test for the valid-input payload.

```ts
it('persists a discord invite url', async () => {
  const result = await updateSiteSettings({
    operatorName: 'Someone',
    operatorAddress: '',
    contactEmail: '',
    hostingProvider: '',
    responsiblePerson: '',
    githubUrl: '',
    discordInviteUrl: 'https://discord.com/oauth2/authorize?client_id=1',
  })
  expect(result).toEqual({ ok: true })
  expect(upsertSiteSettings).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ discordInviteUrl: 'https://discord.com/oauth2/authorize?client_id=1' }),
  )
})

it('rejects a non-http discord invite url', async () => {
  const result = await updateSiteSettings({
    operatorName: '',
    operatorAddress: '',
    contactEmail: '',
    hostingProvider: '',
    responsiblePerson: '',
    githubUrl: '',
    discordInviteUrl: 'javascript:alert(1)',
  })
  expect(result).toEqual({ ok: false, error: 'invalid' })
})

it('stores an empty discord invite url as null', async () => {
  await updateSiteSettings({
    operatorName: '',
    operatorAddress: '',
    contactEmail: '',
    hostingProvider: '',
    responsiblePerson: '',
    githubUrl: '',
    discordInviteUrl: '',
  })
  expect(upsertSiteSettings).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ discordInviteUrl: null }),
  )
})
```

- [x] **Step 2: Run it to make sure it fails**

Run: `npm test -w web -- src/lib/actions/__tests__/site-settings-actions.test.ts`
Expected: FAIL. The valid-url case fails because `upsertSiteSettings` is called without `discordInviteUrl`; the `javascript:` case fails because Zod strips the unknown key instead of rejecting it, so the action returns `{ ok: true }`.

- [x] **Step 3: Add the column to the schema**

In `app/db/src/schema.ts`, add one line to the `siteSettings` table, after `githubUrl`:

```ts
  githubUrl: text('github_url'),
  discordInviteUrl: text('discord_invite_url'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
```

- [x] **Step 4: Generate the migration**

Run from `app/db`: `npm run generate`

Then read the generated `app/db/drizzle/0014_*.sql`. It must contain exactly one statement:

```sql
ALTER TABLE "site_settings" ADD COLUMN "discord_invite_url" text;
```

If it contains anything else — a dropped table, a recreated `site_settings`, a touched `0000` — stop and report. Do not edit `0000_*.sql` and do not delete the `drizzle/` folder.

- [x] **Step 5: Extend the DTO input**

In `app/db/src/queries/site-settings.ts`, add the field to `SiteSettingsInput`:

```ts
export type SiteSettingsInput = {
  operatorName: string | null
  operatorAddress: string | null
  contactEmail: string | null
  hostingProvider: string | null
  responsiblePerson: string | null
  githubUrl: string | null
  discordInviteUrl: string | null
}
```

`SiteSettings` needs no change — it is inferred from the table.

- [x] **Step 6: Extend the Zod schema**

In `app/web/src/lib/schemas/site-settings.ts`, add one field to the object returned by `makeSiteSettingsSchema`, reusing the existing `isUrl` refinement:

```ts
    githubUrl: z.string().trim().max(500).refine(isUrl, t('url')),
    discordInviteUrl: z.string().trim().max(500).refine(isUrl, t('url')),
```

- [x] **Step 7: Pass it through the action**

In `app/web/src/lib/actions/site-settings-actions.ts`, add one line to the `upsertSiteSettings` call:

```ts
    githubUrl: nullify(d.githubUrl),
    discordInviteUrl: nullify(d.discordInviteUrl),
```

- [x] **Step 8: Run the action tests**

Run: `npm test -w web -- src/lib/actions/__tests__/site-settings-actions.test.ts`
Expected: PASS, all three new cases included.

- [x] **Step 9: Write the failing form test**

Append to `app/web/src/components/admin/__tests__/site-settings-form.test.tsx`, matching the existing tests' render helper:

```tsx
it('renders the discord invite url field with its saved value', () => {
  renderForm({
    ...EMPTY_SETTINGS,
    discordInviteUrl: 'https://discord.com/oauth2/authorize?client_id=1',
  })
  expect(screen.getByLabelText('Discord install URL')).toHaveValue(
    'https://discord.com/oauth2/authorize?client_id=1',
  )
})
```

Read the file first. If it has no `EMPTY_SETTINGS` constant or `renderForm` helper, follow whatever shape the neighbouring tests use to build a `SiteSettings | null` and render `<SiteSettingsForm initial={...} />`.

- [x] **Step 10: Run it to make sure it fails**

Run: `npm test -w web -- src/components/admin/__tests__/site-settings-form.test.tsx`
Expected: FAIL with `Unable to find a label with the text of: Discord install URL`.

- [x] **Step 11: Add the field to the form**

In `app/web/src/components/admin/site-settings-form.tsx`, three edits:

```ts
type TextField = 'operatorName' | 'contactEmail' | 'hostingProvider' | 'responsiblePerson' | 'githubUrl' | 'discordInviteUrl'
```

```ts
    githubUrl: initial?.githubUrl ?? '',
    discordInviteUrl: initial?.discordInviteUrl ?? '',
```

```tsx
        {textField('githubUrl')}
        {textField('discordInviteUrl')}
```

- [x] **Step 12: Add the label copy**

In `app/web/messages/en.json`, `adminSettings`:

```json
    "discordInviteUrl": "Discord install URL",
```

In `app/web/messages/de.json`, `adminSettings`:

```json
    "discordInviteUrl": "Discord-Installationslink",
```

Also update `adminSettings.intro` in both, which currently promises only the GitHub link:

```json
    "intro": "Operator and legal details shown on the Imprint and Privacy pages, plus the footer GitHub link and the Discord bot install link.",
```

```json
    "intro": "Betreiber- und Rechtsangaben für Impressum und Datenschutz, dazu der GitHub-Link im Footer und der Installationslink des Discord-Bots.",
```

- [x] **Step 13: Run the form tests**

Run: `npm test -w web -- src/components/admin/__tests__/site-settings-form.test.tsx`
Expected: PASS.

- [x] **Step 14: Typecheck**

Run from `app/`: `npm run typecheck`
Expected: clean. A failure here most likely means a caller of `SiteSettingsInput` is missing the new required key.

- [x] **Step 15: Commit**

The schema edit and its generated migration go in one commit, and it must land before `verify` runs.

```bash
git add app/db/src/schema.ts app/db/drizzle app/db/src/queries/site-settings.ts \
        app/web/src/lib/schemas/site-settings.ts app/web/src/lib/actions/site-settings-actions.ts \
        app/web/src/components/admin/site-settings-form.tsx app/web/messages/en.json app/web/messages/de.json \
        app/web/src/lib/actions/__tests__/site-settings-actions.test.ts \
        app/web/src/components/admin/__tests__/site-settings-form.test.tsx
git commit -m "feat(db): store the discord bot install url in site settings"
```

- [x] **Step 16: Verify the migration is consistent**

Run from `app/db`: `npm run check && npm run verify`
Expected: both pass. `verify` fails if the schema drifted from the migrations; if it does, the generate step was skipped or the migration was not committed.

---

### Task 2: The `discord` message catalog

Every string the page renders, in both locales, with a parity test. Tasks 3 to 6 consume these keys, so they land first and land together.

**Files:**
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json`
- Test: `app/web/src/components/discord/__tests__/discord-i18n.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: the `discord` namespace. Component tasks read it with `useTranslations('discord')`.

- [x] **Step 1: Write the failing parity test**

Create `app/web/src/components/discord/__tests__/discord-i18n.test.ts`, modelled on `src/components/auth/__tests__/auth-i18n.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

// The page is copy-heavy and bilingual; a key present in one catalog and
// missing in the other renders the raw key path to a visitor.
describe('discord i18n', () => {
  it('has a discord namespace in both locales', () => {
    expect(en.discord).toBeTruthy()
    expect(de.discord).toBeTruthy()
  })

  it('holds the same keys in both locales', () => {
    const keys = (o: object): string[] =>
      Object.entries(o)
        .flatMap(([k, v]) =>
          v !== null && typeof v === 'object' ? keys(v).map((c) => `${k}.${c}`) : [k],
        )
        .sort()
    expect(keys(en.discord)).toEqual(keys(de.discord))
  })

  it('names all five commands in both locales', () => {
    for (const m of [en, de]) {
      for (const name of ['card', 'search', 'deck', 'collection', 'mydecks']) {
        expect(m.discord.commands[name].description).toBeTruthy()
      }
    }
  })
})
```

- [x] **Step 2: Run it to make sure it fails**

Run: `npm test -w web -- src/components/discord/__tests__/discord-i18n.test.ts`
Expected: FAIL — `en.discord` is undefined.

- [x] **Step 3: Add the English catalog**

Add to `app/web/messages/en.json`, as a new top-level `discord` key (place it after `about` to keep related page namespaces together):

```json
  "discord": {
    "metaTitle": "Revelio for Discord",
    "metaDescription": "Look up any Harry Potter TCG card, share a decklist and check your collection without leaving Discord.",
    "heading": "Summon any card <b>without leaving the chat</b>",
    "tagline": "Look up a card mid-argument. Share a decklist without a screenshot. Check what you are missing from a set - privately.",
    "install": "Add to Discord",
    "seeAnswers": "See what it answers",
    "availability": "Works in any server. Personal answers stay private to you.",
    "channelName": "deck-talk",
    "usedCommand": "{user} used {command}",
    "botName": "Revelio",
    "appTag": "App",
    "you": "you",
    "cardImageAlt": "{name} card",
    "commandsTitle": "What you can type",
    "commandsIntro": "Type / in any channel the bot can see. Discord fills in the rest.",
    "ephemeral": "Only you see it",
    "commands": {
      "card": {
        "options": "name",
        "description": "The full card: text, flavour, cost, lesson, rarity, legality, rulings, and the art."
      },
      "search": {
        "options": "query, lesson, type, set, page",
        "description": "The same search as the site, paged, with a link back to the full results."
      },
      "deck": {
        "options": "deck",
        "description": "Any public decklist by link or id: character, main deck, sideboard, legality."
      },
      "collection": {
        "options": "set",
        "description": "How far along you are, overall or in one set."
      },
      "mydecks": {
        "options": "",
        "description": "Your decks, public and private, with their formats and sizes."
      }
    },
    "reference": {
      "title": "Full reference",
      "description": "Every option each command takes, how account linking works, and exactly what the bot can and cannot read."
    },
    "steps": {
      "addTitle": "Add the bot",
      "addBody": "One click, no permissions beyond posting.",
      "linkTitle": "Link your account",
      "linkBody": "Only needed for /collection and /mydecks, from Settings then Connections.",
      "typeTitle": "Type a slash",
      "typeBody": "Commands appear in every channel the bot can see."
    },
    "sample": {
      "cardName": "Alohomora",
      "cardText": "Search your deck. You may take a Location or Adventure card from your deck, show it to your opponent and put it into your hand. Then shuffle your deck.",
      "cardFooter": "Adventures at Hogwarts - #32",
      "fieldType": "Type",
      "fieldTypeValue": "Spell",
      "fieldLesson": "Lesson",
      "fieldLessonValue": "Charms",
      "fieldCost": "Cost",
      "fieldCostValue": "4",
      "searchTitle": "42 cards",
      "searchFooter": "Page 1 of 5 - view all on revelio.cards",
      "typing": "set: Chamber of Secrets"
    }
  }
```

The five `sample.searchLine*` card names are not translated — they are card names, which render the same in both catalogs. Hardcode the five lines in the component (Task 4) as data, not copy.

- [x] **Step 4: Add the German catalog**

Add the same structure to `app/web/messages/de.json`:

```json
  "discord": {
    "metaTitle": "Revelio für Discord",
    "metaDescription": "Jede Karte des Harry-Potter-Sammelkartenspiels nachschlagen, Decks teilen und die eigene Sammlung prüfen, ohne Discord zu verlassen.",
    "heading": "Jede Karte beschwören <b>ohne den Chat zu verlassen</b>",
    "tagline": "Eine Karte mitten in der Diskussion nachschlagen. Ein Deck ohne Screenshot teilen. Nachsehen, was dir in einem Set noch fehlt - privat.",
    "install": "Zu Discord hinzufügen",
    "seeAnswers": "Sieh, was er antwortet",
    "availability": "Funktioniert auf jedem Server. Persönliche Antworten sieht nur du.",
    "channelName": "deck-talk",
    "usedCommand": "{user} nutzte {command}",
    "botName": "Revelio",
    "appTag": "App",
    "you": "du",
    "cardImageAlt": "Karte {name}",
    "commandsTitle": "Was du tippen kannst",
    "commandsIntro": "Tippe / in jedem Kanal, den der Bot sieht. Den Rest ergänzt Discord.",
    "ephemeral": "Nur du siehst es",
    "commands": {
      "card": {
        "options": "name",
        "description": "Die ganze Karte: Text, Flavour, Kosten, Lektion, Seltenheit, Legalität, Rulings und das Artwork."
      },
      "search": {
        "options": "query, lesson, type, set, page",
        "description": "Dieselbe Suche wie auf der Website, seitenweise, mit Link zu den vollständigen Ergebnissen."
      },
      "deck": {
        "options": "deck",
        "description": "Jedes öffentliche Deck per Link oder ID: Startcharakter, Hauptdeck, Sideboard, Legalität."
      },
      "collection": {
        "options": "set",
        "description": "Wie weit du bist, insgesamt oder in einem Set."
      },
      "mydecks": {
        "options": "",
        "description": "Deine Decks, öffentlich und privat, mit Format und Kartenzahl."
      }
    },
    "reference": {
      "title": "Vollständige Referenz",
      "description": "Jede Option jedes Befehls, wie die Kontoverknüpfung funktioniert und was der Bot lesen kann und was nicht."
    },
    "steps": {
      "addTitle": "Bot hinzufügen",
      "addBody": "Ein Klick, keine Rechte außer Schreiben.",
      "linkTitle": "Konto verknüpfen",
      "linkBody": "Nur für /collection und /mydecks nötig, unter Einstellungen und dann Verbindungen.",
      "typeTitle": "Slash tippen",
      "typeBody": "Die Befehle erscheinen in jedem Kanal, den der Bot sieht."
    },
    "sample": {
      "cardName": "Alohomora",
      "cardText": "Durchsuche dein Deck. Du darfst eine Ort- oder Abenteuerkarte aus deinem Deck nehmen, sie deinem Gegner zeigen und auf deine Hand nehmen. Mische danach dein Deck.",
      "cardFooter": "Adventures at Hogwarts - #32",
      "fieldType": "Typ",
      "fieldTypeValue": "Zauber",
      "fieldLesson": "Lektion",
      "fieldLessonValue": "Zauberkunst",
      "fieldCost": "Kosten",
      "fieldCostValue": "4",
      "searchTitle": "42 Karten",
      "searchFooter": "Seite 1 von 5 - alle auf revelio.cards",
      "typing": "set: Kammer des Schreckens"
    }
  }
```

- [x] **Step 5: Run the parity test**

Run: `npm test -w web -- src/components/discord/__tests__/discord-i18n.test.ts`
Expected: PASS, all three cases.

- [x] **Step 6: Commit**

```bash
git add app/web/messages/en.json app/web/messages/de.json \
        app/web/src/components/discord/__tests__/discord-i18n.test.ts
git commit -m "feat(discord): add the landing page message catalog"
```

---

### Task 3: `DiscordCta`

The install button. The single place that decides whether an install affordance renders at all, so a null URL cannot leak a dead button anywhere.

**Files:**
- Create: `app/web/src/components/discord/discord-cta.tsx`
- Test: `app/web/src/components/discord/__tests__/discord-cta.test.tsx`

**Interfaces:**
- Consumes: `discord.install` from Task 2; the existing `DiscordMark` at `@/components/discord-mark`; `Button` from `@/components/ui/button`.
- Produces: `export function DiscordCta({ inviteUrl }: { inviteUrl: string | null }): ReactElement | null`. Tasks 6 renders it.

- [x] **Step 1: Write the failing test**

Create `app/web/src/components/discord/__tests__/discord-cta.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect } from 'vitest'
import en from '@/../messages/en.json'
import { DiscordCta } from '@/components/discord/discord-cta'

function renderCta(inviteUrl: string | null) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DiscordCta inviteUrl={inviteUrl} />
    </NextIntlClientProvider>,
  )
}

describe('DiscordCta', () => {
  it('links to the invite url when one is set', () => {
    renderCta('https://discord.com/oauth2/authorize?client_id=1')
    const link = screen.getByRole('link', { name: /Add to Discord/i })
    expect(link).toHaveAttribute('href', 'https://discord.com/oauth2/authorize?client_id=1')
  })

  it('opens the invite in a new tab safely', () => {
    renderCta('https://discord.com/oauth2/authorize?client_id=1')
    const link = screen.getByRole('link', { name: /Add to Discord/i })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('renders nothing when the invite url is null', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <DiscordCta inviteUrl={null} />
      </NextIntlClientProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [x] **Step 2: Run it to make sure it fails**

Run: `npm test -w web -- src/components/discord/__tests__/discord-cta.test.tsx`
Expected: FAIL — cannot resolve `@/components/discord/discord-cta`.

- [x] **Step 3: Implement the component**

Create `app/web/src/components/discord/discord-cta.tsx`:

```tsx
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { DiscordMark } from '@/components/discord-mark'

// The install link is an admin-editable site setting, so it is legitimately
// absent on a fresh database. Returning null here is what keeps every caller
// from having to guard: no URL, no button, and the page still reads as a
// command reference.
export function DiscordCta({ inviteUrl }: { inviteUrl: string | null }) {
  const t = useTranslations('discord')
  if (!inviteUrl) return null
  return (
    <Button asChild className="bg-brand-discord text-white hover:bg-brand-discord/90">
      <a href={inviteUrl} target="_blank" rel="noopener noreferrer">
        <DiscordMark className="size-4" />
        {t('install')}
      </a>
    </Button>
  )
}
```

`bg-brand-discord` resolves through the existing `--color-brand-discord` token (`#5865F2`) already declared in `globals.css`. Do not add a new colour.

- [x] **Step 4: Run the tests**

Run: `npm test -w web -- src/components/discord/__tests__/discord-cta.test.tsx`
Expected: PASS, all three cases.

- [x] **Step 5: Commit**

```bash
git add app/web/src/components/discord/discord-cta.tsx \
        app/web/src/components/discord/__tests__/discord-cta.test.tsx
git commit -m "feat(discord): add the install button"
```

---

### Task 4: `CommandChannel`

The static Discord channel mockup: two bot answers (a card embed and a search embed) and an input line. Hand-built markup, deliberately not a screenshot.

**Files:**
- Create: `app/web/src/components/discord/command-channel.tsx`
- Test: `app/web/src/components/discord/__tests__/command-channel.test.tsx`

**Interfaces:**
- Consumes: `discord.sample.*`, `discord.channelName`, `discord.usedCommand`, `discord.botName`, `discord.appTag`, `discord.you`, `discord.cardImageAlt` from Task 2.
- Produces: `export function CommandChannel(): ReactElement`. No props. Task 6 renders it.

- [x] **Step 1: Write the failing test**

Create `app/web/src/components/discord/__tests__/command-channel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'
import { CommandChannel } from '@/components/discord/command-channel'

function renderChannel(locale: 'en' | 'de', messages: typeof en | typeof de) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <CommandChannel />
    </NextIntlClientProvider>,
  )
}

describe('CommandChannel', () => {
  it('shows the sample card embed', () => {
    renderChannel('en', en)
    expect(screen.getByText('Alohomora')).toBeInTheDocument()
    expect(screen.getByText(/Search your deck/)).toBeInTheDocument()
    expect(screen.getByText('Adventures at Hogwarts - #32')).toBeInTheDocument()
  })

  it('shows the sample search embed with its card lines', () => {
    renderChannel('en', en)
    expect(screen.getByText('42 cards')).toBeInTheDocument()
    expect(screen.getByText(/Obliviate/)).toBeInTheDocument()
  })

  it('translates the chrome but keeps the card names', () => {
    renderChannel('de', de)
    expect(screen.getByText('42 Karten')).toBeInTheDocument()
    expect(screen.getByText(/Obliviate/)).toBeInTheDocument()
  })

  it('gives the card art a localized alt text', () => {
    renderChannel('en', en)
    expect(screen.getByAltText('Alohomora card')).toBeInTheDocument()
  })
})
```

- [x] **Step 2: Run it to make sure it fails**

Run: `npm test -w web -- src/components/discord/__tests__/command-channel.test.tsx`
Expected: FAIL — cannot resolve `@/components/discord/command-channel`.

- [x] **Step 3: Implement the component**

Create `app/web/src/components/discord/command-channel.tsx`. Build the markup from the "The page" mockup in the artifact — its channel panel is the design of record for spacing, colours and the embed anatomy.

Non-negotiable details, and the reason each exists:

```tsx
import { useTranslations } from 'next-intl'

// A hand-built rendering of what bot/src/discord/embeds/card-embed.ts and
// search-embed.ts actually produce. It is markup rather than a screenshot so it
// stays sharp at any width, works in both locales and costs no image request -
// the trade is that it is only as true as this comment keeps it. When those two
// builders change, change this:
//   - the card embed's colour bar is the LESSON colour (Charms is #0069A9)
//   - the search embed's bar is BRAND_GOLD (#d4a83a)
//   - the card footer is `{setName} - #{number}`
//   - the search footer is `Page {page} of {pages} - view all on revelio.cards`
//   - fields are the ones the command adds, in order: Type, Lesson, Cost
const SEARCH_LINES = [
  { name: 'Obliviate', set: 'BS', number: '14' },
  { name: 'Incendio', set: 'BS', number: '25' },
  { name: 'Titillando', set: 'BS', number: '36' },
  { name: 'Bluebell Flames', set: 'BS', number: '44' },
  { name: 'Confundus', set: 'BS', number: '47' },
]

const CHARMS = '#0069A9'
const BRAND_GOLD = '#d4a83a'
```

Requirements the tests and the design both depend on:
- Card names in `SEARCH_LINES` are **data, not copy** — they are identical in both locales.
- The card art is the real thumbnail. Use `next/image` with a `src` built from `NEXT_PUBLIC_IMAGE_BASE_URL` and the `thumbKey` helper from `@revelio/core` for card id `aah-32-alohomora`, matching how `card/card-image` does it; read that component first and follow it. Its `alt` comes from `t('cardImageAlt', { name: t('sample.cardName') })`.
- Discord's own surface colours (`#313338`, `#2b2d31`, `#f2f3f5`, `#949ba4`) are **literals in this component, not theme tokens** — it is a depiction of Discord's UI, which does not follow the visitor's Revelio theme. Add a comment saying so, or a reviewer will flag it as a token violation.
- The panel is decorative chrome around real text: no `role`, no interactive elements, no headings that would pollute the page's heading outline.

- [x] **Step 4: Run the tests**

Run: `npm test -w web -- src/components/discord/__tests__/command-channel.test.tsx`
Expected: PASS, all four cases.

- [x] **Step 5: Commit**

```bash
git add app/web/src/components/discord/command-channel.tsx \
        app/web/src/components/discord/__tests__/command-channel.test.tsx
git commit -m "feat(discord): add the channel mockup with hand-built embeds"
```

---

### Task 5: `CommandGrid`

The five command tiles plus the reference tile. The reference tile is behind a prop because `/discord/docs` does not exist yet — shipping a link to a 404 is the failure mode to avoid.

**Files:**
- Create: `app/web/src/components/discord/command-grid.tsx`
- Test: `app/web/src/components/discord/__tests__/command-grid.test.tsx`

**Interfaces:**
- Consumes: `discord.commands.*`, `discord.commandsTitle`, `discord.commandsIntro`, `discord.ephemeral`, `discord.reference.*`, `discord.steps.*` from Task 2; `Link` from `@/../i18n/navigation`.
- Produces: `export function CommandGrid({ docsHref }: { docsHref?: string | null }): ReactElement`. Task 6 renders it.

- [x] **Step 1: Write the failing test**

Create `app/web/src/components/discord/__tests__/command-grid.test.tsx`:

```tsx
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'
import en from '@/../messages/en.json'

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}))

import { CommandGrid } from '@/components/discord/command-grid'

function renderGrid(docsHref?: string | null) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <CommandGrid docsHref={docsHref} />
    </NextIntlClientProvider>,
  )
}

describe('CommandGrid', () => {
  it('lists all five commands', () => {
    renderGrid()
    for (const name of ['/card', '/search', '/deck', '/collection', '/mydecks']) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
  })

  it('marks the two personal commands as private', () => {
    renderGrid()
    expect(screen.getAllByText('Only you see it')).toHaveLength(2)
  })

  it('hides the reference tile when there is no docs route yet', () => {
    renderGrid(null)
    expect(screen.queryByRole('link', { name: /Full reference/i })).not.toBeInTheDocument()
  })

  it('links the reference tile when a docs route is given', () => {
    renderGrid('/discord/docs')
    expect(screen.getByRole('link', { name: /Full reference/i })).toHaveAttribute(
      'href',
      '/discord/docs',
    )
  })

  it('renders the three getting-started steps', () => {
    renderGrid()
    expect(screen.getByText('Add the bot')).toBeInTheDocument()
    expect(screen.getByText('Link your account')).toBeInTheDocument()
    expect(screen.getByText('Type a slash')).toBeInTheDocument()
  })
})
```

- [x] **Step 2: Run it to make sure it fails**

Run: `npm test -w web -- src/components/discord/__tests__/command-grid.test.tsx`
Expected: FAIL — cannot resolve `@/components/discord/command-grid`.

- [x] **Step 3: Implement the component**

Create `app/web/src/components/discord/command-grid.tsx`. Drive the tiles from a local constant so the markup stays one loop:

```tsx
type CommandKey = 'card' | 'search' | 'deck' | 'collection' | 'mydecks'

// Order is the order the mockup shows, most-used first. `personal` drives the
// "only you see it" tag: those two commands defer ephemerally in the bot
// (see bot/src/discord/commands/collection.ts), so the page must not imply
// their answers are public.
const COMMANDS: readonly { key: CommandKey; personal: boolean }[] = [
  { key: 'card', personal: false },
  { key: 'search', personal: false },
  { key: 'deck', personal: false },
  { key: 'collection', personal: true },
  { key: 'mydecks', personal: true },
]
```

Requirements from the design:
- Three columns at desktop width, one at mobile, so five commands plus the reference tile fill two clean rows.
- The reference tile is visually a **different kind of object** from a command: dashed indigo border, a document glyph, its title in the sans face and `text-secondary-ink`, no monospace `/name`. A reader must not mistake it for a sixth command.
- The section heading is an `<h2>`; the page's `<h1>` lives in the hero (Task 6).
- The three steps sit below the grid, separated by a top border.

- [x] **Step 4: Run the tests**

Run: `npm test -w web -- src/components/discord/__tests__/command-grid.test.tsx`
Expected: PASS, all five cases.

- [x] **Step 5: Commit**

```bash
git add app/web/src/components/discord/command-grid.tsx \
        app/web/src/components/discord/__tests__/command-grid.test.tsx
git commit -m "feat(discord): add the command grid and reference tile"
```

---

### Task 6: The `/[locale]/discord` page

Composes the three components into the route, with metadata and the settings read.

**Files:**
- Create: `app/web/src/app/[locale]/discord/page.tsx`
- Test: `app/web/src/app/[locale]/discord/__tests__/discord.test.tsx`

**Interfaces:**
- Consumes: `DiscordCta`, `CommandChannel`, `CommandGrid` from Tasks 3 to 5; `getCachedSiteSettings` from `@/lib/server/site-settings`; `StarField` from `@/components/star-field`.
- Produces: `export function DiscordContent({ inviteUrl }: { inviteUrl: string | null })` — the presentational view tests render — and the async default export.

- [x] **Step 1: Write the failing test**

Create `app/web/src/app/[locale]/discord/__tests__/discord.test.tsx`, modelled on `about/__tests__/about.test.tsx`:

```tsx
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}))

import { DiscordContent } from '../page'

const INVITE = 'https://discord.com/oauth2/authorize?client_id=1'

function renderPage(locale: 'en' | 'de', messages: typeof en | typeof de, inviteUrl: string | null) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <DiscordContent inviteUrl={inviteUrl} />
    </NextIntlClientProvider>,
  )
}

describe('DiscordContent', () => {
  it('renders the English headline as the page h1', () => {
    renderPage('en', en, INVITE)
    expect(
      screen.getByRole('heading', { level: 1, name: /Summon any card without leaving the chat/i }),
    ).toBeInTheDocument()
  })

  it('renders the German headline', () => {
    renderPage('de', de, INVITE)
    expect(
      screen.getByRole('heading', { level: 1, name: /Jede Karte beschwören/i }),
    ).toBeInTheDocument()
  })

  it('shows the install button when the invite url is set', () => {
    renderPage('en', en, INVITE)
    expect(screen.getByRole('link', { name: /Add to Discord/i })).toHaveAttribute('href', INVITE)
  })

  it('still renders the commands when there is no invite url', () => {
    renderPage('en', en, null)
    expect(screen.queryByRole('link', { name: /Add to Discord/i })).not.toBeInTheDocument()
    expect(screen.getByText('/card')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'What you can type' }),
    ).toBeInTheDocument()
  })

  it('shows the channel mockup', () => {
    renderPage('en', en, INVITE)
    expect(screen.getByText('Alohomora')).toBeInTheDocument()
  })
})
```

- [x] **Step 2: Run it to make sure it fails**

Run: `npm test -w web -- src/app/\[locale\]/discord/__tests__/discord.test.tsx`
Expected: FAIL — cannot resolve `../page`.

- [x] **Step 3: Implement the page**

Create `app/web/src/app/[locale]/discord/page.tsx`. Copy the structure of `about/page.tsx` exactly: `export const dynamic = 'force-dynamic'`, an async `generateMetadata` building per-locale `alternates.languages` from `routing.locales` plus an `x-default`, the exported presentational component, and the async default export that resolves settings and hands them down.

```tsx
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('discord')

  const languages: Record<string, string> = Object.fromEntries(
    routing.locales.map((l) => [l, `${BASE_URL}${getPathname({ href: '/discord', locale: l })}`]),
  )
  languages['x-default'] = `${BASE_URL}${getPathname({ href: '/discord', locale: routing.defaultLocale })}`

  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: { canonical: `${BASE_URL}${getPathname({ href: '/discord', locale })}`, languages },
  }
}
```

```tsx
export default async function DiscordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const settings = await getCachedSiteSettings()
  return <DiscordContent inviteUrl={settings?.discordInviteUrl ?? null} />
}
```

For `DiscordContent`:
- The `<h1>` uses `t.rich('heading', { b: (chunks) => <span className="text-heading">{chunks}</span> })`, the same rich-text pattern the home page uses for its gold emphasis.
- The hero is a two-column grid at `md:` and up, stacking below it, with `CommandChannel` in the second column.
- `<StarField />` sits inside the hero's relatively-positioned wrapper, as on `/about`.
- The secondary "See what it answers" button is an anchor to the `#commands` fragment on the `CommandGrid` section. It is not a `Link` — it does not change route.
- Pass `docsHref={null}` to `CommandGrid`. `/discord/docs` does not exist yet; the tile turns on by passing the path once it does.

- [x] **Step 4: Run the tests**

Run: `npm test -w web -- src/app/\[locale\]/discord/__tests__/discord.test.tsx`
Expected: PASS, all five cases.

- [x] **Step 5: Commit**

```bash
git add "app/web/src/app/[locale]/discord"
git commit -m "feat(discord): add the bot landing page route"
```

---

### Task 7: Footer entry point

The only navigation into the page. Deliberately not in the header nav, which stays on the things a visitor came to the site to do.

**Files:**
- Modify: `app/web/src/components/layout/site-footer.tsx` (the About `FooterColumn`)
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json` (the `footer` block)
- Test: `app/web/src/components/layout/__tests__/site-footer.test.tsx`

**Interfaces:**
- Consumes: the `/discord` route from Task 6.
- Produces: nothing downstream.

- [x] **Step 1: Write the failing test**

Append to `app/web/src/components/layout/__tests__/site-footer.test.tsx`, inside the existing `describe`:

```tsx
it('links the Discord bot page from the About column', () => {
  renderFooter()
  const about = screen.getByRole('navigation', { name: 'About' })
  expect(within(about).getByRole('link', { name: 'Discord bot' })).toHaveAttribute(
    'href',
    '/discord',
  )
})
```

- [x] **Step 2: Run it to make sure it fails**

Run: `npm test -w web -- src/components/layout/__tests__/site-footer.test.tsx`
Expected: FAIL — no link named "Discord bot".

- [x] **Step 3: Add the footer link**

In `app/web/src/components/layout/site-footer.tsx`, add one `FooterLink` to the About column, between Contact and the conditional GitHub link:

```tsx
            <FooterLink href="/contact">{t('contact')}</FooterLink>
            <FooterLink href="/discord">{t('discordBot')}</FooterLink>
            {githubUrl && (
```

It is an internal route, so it uses `FooterLink` (which wraps next-intl's locale-aware `Link`) and carries no `ArrowUpRight` — that glyph means "leaves the site" in this footer.

- [x] **Step 4: Add the label copy**

In `app/web/messages/en.json`, `footer`:

```json
    "discordBot": "Discord bot",
```

In `app/web/messages/de.json`, `footer`:

```json
    "discordBot": "Discord-Bot",
```

- [x] **Step 5: Run the tests**

Run: `npm test -w web -- src/components/layout/__tests__/site-footer.test.tsx`
Expected: PASS.

- [x] **Step 6: Full verification**

Run from `app/`, and record the real numbers — they go in the PR's Verification section:

```bash
npm test
npm run typecheck
npm run lint
```

Expected: all three clean. If `npm test` wipes your local dev Meilisearch, that is known and unrelated to this change.

- [x] **Step 7: Commit**

```bash
git add app/web/src/components/layout/site-footer.tsx \
        app/web/src/components/layout/__tests__/site-footer.test.tsx \
        app/web/messages/en.json app/web/messages/de.json
git commit -m "feat(web): link the discord bot page from the footer"
```

---

## Deployment notes for the PR

These belong under `## Deployment` in the pull request, because none of them are in the diff:

- **Apply the migration.** `0014_*.sql` adds `site_settings.discord_invite_url`. Mind the stale-image trap: `docker compose run --rm migrate` without `--build` reports success while applying nothing. Confirm with `docker compose exec -T postgres psql -U revelio -d revelio -c "\d site_settings"`.
- **Set the install URL** in Admin then Site settings. Until it is set, the page renders without an install button by design.
- **The Discord application must be set to Public** in the developer portal, or the install URL works for nobody but its owner. This is outside the repo entirely.
- **`/docs/discord` does not exist.** The reference tile links it anyway, on purpose: the tile ships ahead of its page, so until that route lands the link is a 404. Setting `DOCS_HREF` back to `null` in `page.tsx` hides the tile again. (Task 5 below planned `/discord/docs`; the route was renamed during review.)
