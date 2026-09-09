# Discord Account Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user link their Discord account on revelio.cards, then answer `/collection` and `/mydecks` in Discord with that user's own data, privately.

**Architecture:** Better Auth's Discord social provider does the linking. Its `account` table already stores `providerId` / `accountId` / `userId`, so the Discord snowflake to Revelio user id mapping needs **no schema change and no migration** - the bot reads it through two new queries in `@revelio/db`. Personal replies are ephemeral: a Discord channel is public and a card collection is not.

**Tech Stack:** Better Auth 1.7 social providers, Next.js App Router, discord.js 14, Drizzle, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-discord-bot-design.md` (sections "Account linking" and "Privacy").

## Global Constraints

- All commands run from `app/`. Use `/usr/local/bin/npm`; `gh` and `gpg` live at `/opt/homebrew/bin/`.
- Run tests per workspace. Never run the bare root `npm test` locally.
- Web strings come from `web/messages/en.json` **and** `web/messages/de.json`; bot strings from `bot/src/i18n/{en,de}.json`. Both pairs have a parity test.
- `web/src/lib/server/**` files must start with `import 'server-only'` - enforced by `lib/server/__tests__/server-only-guard.test.ts`.
- Code comments are ASCII only. Conventional Commits. No Claude attribution.
- Commit signing: `git -c gpg.program=/opt/homebrew/bin/gpg commit ...`.
- Branch: `feat/discord-account-linking`, off `main`.
- **`DISCORD_CLIENT_SECRET` is server-only.** It must never be prefixed `NEXT_PUBLIC_`, never reach a client component, and never appear in a log or an error message.
- **Every personal reply is ephemeral.** `/collection` and `/mydecks` must use `MessageFlags.Ephemeral`. A test asserts it.
- **No migration is expected.** If `db/src/schema.ts` is touched at all, run `npm run generate` from `app/db` and commit the SQL with the schema edit, and commit before running `npm run verify` (verify's git clean step deletes an uncommitted migration).

## Prerequisites

1. `feat/discord-bot-deck-lookup` merged.
2. In the Discord application from the foundation plan: add an OAuth2 redirect URI of
   `<SITE_BASE_URL>/api/auth/callback/discord` (add both the production URL and
   `http://localhost:3000/api/auth/callback/discord`), and record the **client secret**.

---

## Design

### Why the social provider, not a code-paste flow

The obvious alternative is `/link` in Discord issuing a one-time code the user pastes on
the site. That needs a new table, an expiry, a rate limit and a second UI. Better Auth
already implements the OAuth round-trip, already writes the `account` row, and already
handles unlinking. The user is signed in when they click Link, so it is one redirect.

### The two new queries

Both live in `app/db/src/queries.ts` beside the other account reads, not in the bot, so a
future HTTP API can reuse them:

```ts
getUserIdByDiscordAccount(db, discordUserId): Promise<string | null>
getLinkedProviderIds(db, userId): Promise<string[]>
```

### Graceful absence

If `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` are unset - which is the normal state for
a local checkout - the provider is not registered and the Connections pane renders a
"linking is not configured" note instead of a broken button. The site must not crash
because a contributor has no Discord app.

### What the personal commands show

| Command | Data |
|---|---|
| `/collection` | `getCollectionSummary` - distinct owned, total copies, percentage of the card pool |
| `/collection set:<code>` | `getCollectionSetProgress`, filtered to that set |
| `/mydecks` | `listDecksByUser` - name, format, main-deck count, visibility, link |

All ephemeral. `/mydecks` shows private decks, which is correct: the reply is visible only
to the user who asked.

### Unlinked users

An ephemeral reply naming the settings URL. Not an error, and not a public message - the
fact that someone has no Revelio account is not the channel's business.

---

## File Structure

**Modify (db):**
- `app/db/src/queries.ts` - the two queries above
- `app/db/src/index.ts` - export them

**Modify (web):**
- `app/web/src/lib/server/auth.ts` - conditional `socialProviders.discord`
- `app/web/src/lib/auth-client.ts` - no change needed (`linkSocial` / `unlinkAccount` are core client methods)
- `app/web/src/components/settings/types.ts` - add `'connections'` to `SettingsSection`
- `app/web/src/components/settings/settings-nav.tsx` - add the section and its icon
- `app/web/messages/en.json`, `app/web/messages/de.json` - settings and privacy copy
- `app/web/src/app/[locale]/privacy/page.tsx` - a Discord subsection
- `app/.env.example`

**Create (web):**
- `app/web/src/app/[locale]/settings/connections/page.tsx`
- `app/web/src/components/settings/connections-pane.tsx`
- `app/web/src/components/settings/__tests__/connections-pane.test.tsx`

**Create (bot):**
- `app/bot/src/data/link.ts`
- `app/bot/src/data/collection.ts`
- `app/bot/src/discord/commands/collection.ts`, `app/bot/src/discord/commands/mydecks.ts`
- `app/bot/test/link.test.ts`, `app/bot/test/personal-commands.test.ts`

**Modify (bot):**
- `app/bot/src/env.ts` - nothing new; the bot needs no Discord client secret
- `app/bot/src/discord/commands/index.ts`
- `app/bot/src/i18n/en.json`, `app/bot/src/i18n/de.json`

---

### Task 1: The account-link queries in `@revelio/db`

**Files:**
- Modify: `app/db/src/queries.ts`, `app/db/src/index.ts`
- Test: `app/ingest/test/discord-link.test.ts` (the db workspace's integration tests live under `ingest/test`, alongside `auth.test.ts`)

**Interfaces:**
- Consumes: the existing `account` table from `app/db/src/auth-schema.ts`.
- Produces:
  - `function getUserIdByDiscordAccount(db: DB, discordUserId: string): Promise<string | null>`
  - `function getLinkedProviderIds(db: DB, userId: string): Promise<string[]>`

- [ ] **Step 1: Write the failing test**

`app/ingest/test/discord-link.test.ts`, following the shape of the existing
`ingest/test/auth.test.ts` (read it first for the Testcontainers helper it uses):

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getUserIdByDiscordAccount, getLinkedProviderIds } from '@revelio/db'
// Reuse the same container + migration helper auth.test.ts uses.
import { withDb } from './helpers'

describe('discord account link', () => {
  it('resolves a Discord snowflake to the Revelio user id', async () => {
    await withDb(async (db) => {
      // seed one user + one account row with providerId 'discord'
      expect(await getUserIdByDiscordAccount(db, '111222333')).toBe('user-1')
    })
  })

  it('returns null for an unlinked snowflake', async () => {
    await withDb(async (db) => {
      expect(await getUserIdByDiscordAccount(db, '999')).toBeNull()
    })
  })

  it('ignores an account row from another provider with the same accountId', async () => {
    await withDb(async (db) => {
      // seed providerId 'github' with accountId '111222333' on a different user
      expect(await getUserIdByDiscordAccount(db, '111222333')).toBe('user-1')
    })
  })

  it('lists the providers linked to a user', async () => {
    await withDb(async (db) => {
      expect(await getLinkedProviderIds(db, 'user-1')).toContain('discord')
    })
  })

  it('returns an empty list for a user with no linked accounts', async () => {
    await withDb(async (db) => {
      expect(await getLinkedProviderIds(db, 'user-2')).toEqual([])
    })
  })
})
```

Read `app/ingest/test/auth.test.ts` and `app/ingest/test/helpers.ts` first and match their
setup exactly - including how they seed `user` rows - rather than inventing a helper. If
`withDb` does not exist under that name, use whatever the neighbouring tests use.

- [ ] **Step 2: Run it to verify it fails**

```bash
cd app && /usr/local/bin/npm test -w @revelio/ingest -- discord-link
```

Expected: FAIL - the two functions are not exported. Docker must be running for the
Testcontainers Postgres.

- [ ] **Step 3: Add the queries**

In `app/db/src/queries.ts`, beside the other `user` / `account` reads:

```ts
// Better Auth writes one account row per linked provider. The Discord bot reads
// this to turn an interaction's snowflake into a Revelio user id: no extra table
// and no custom linking flow.
export async function getUserIdByDiscordAccount(
  db: DB, discordUserId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ userId: account.userId })
    .from(account)
    .where(and(eq(account.providerId, 'discord'), eq(account.accountId, discordUserId)))
    .limit(1)
  return row?.userId ?? null
}

export async function getLinkedProviderIds(db: DB, userId: string): Promise<string[]> {
  const rows = await db
    .select({ providerId: account.providerId })
    .from(account)
    .where(eq(account.userId, userId))
  return rows.map((r) => r.providerId)
}
```

Add `account` to the import from `./auth-schema` at the top of the file if it is not there
already.

- [ ] **Step 4: Export them**

Add both names to the `export { ... } from './queries'` list in `app/db/src/index.ts`.

- [ ] **Step 5: Verify no schema drift**

```bash
cd app && /usr/local/bin/npm test -w @revelio/ingest -- discord-link
/usr/local/bin/npm run check -w @revelio/db && /usr/local/bin/npm run verify -w @revelio/db
```

Expected: tests PASS; check and verify both clean, confirming no migration is needed.

- [ ] **Step 6: Commit**

```bash
git add app/db app/ingest/test/discord-link.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(db): resolve a Discord account to a Revelio user"
```

---

### Task 2: The Discord provider and the Connections settings pane

**Files:**
- Modify: `app/web/src/lib/server/auth.ts`, `app/web/src/components/settings/types.ts`, `app/web/src/components/settings/settings-nav.tsx`, `app/web/messages/en.json`, `app/web/messages/de.json`, `app/.env.example`
- Create: `app/web/src/app/[locale]/settings/connections/page.tsx`, `app/web/src/components/settings/connections-pane.tsx`
- Test: `app/web/src/components/settings/__tests__/connections-pane.test.tsx`

**Interfaces:**
- Consumes: `getLinkedProviderIds` from Task 1; `authClient` from `@/lib/auth-client`.
- Produces: a `/settings/connections` route where a signed-in user links and unlinks Discord.

- [ ] **Step 1: Add the copy**

To `app/web/messages/en.json`, add `"connections": "Connections"` under `settings.nav`, and
a `settings.connections` block:

```json
    "connections": {
      "title": "Connections",
      "lead": "Link an account to use Revelio outside the website.",
      "discordTitle": "Discord",
      "discordBody": "Link your Discord account to use /collection and /mydecks with the Revelio bot. Only you can see those replies.",
      "linked": "Linked",
      "link": "Link Discord",
      "unlink": "Unlink",
      "unavailable": "Discord linking is not configured on this instance.",
      "error": "Linking failed. Please try again."
    }
```

Mirror the block in `app/web/messages/de.json`:

```json
    "connections": {
      "title": "Verknüpfungen",
      "lead": "Verknüpfe ein Konto, um Revelio außerhalb der Website zu nutzen.",
      "discordTitle": "Discord",
      "discordBody": "Verknüpfe dein Discord-Konto, um /collection und /mydecks mit dem Revelio-Bot zu nutzen. Diese Antworten sieht nur du.",
      "linked": "Verknüpft",
      "link": "Discord verknüpfen",
      "unlink": "Trennen",
      "unavailable": "Discord-Verknüpfung ist auf dieser Instanz nicht eingerichtet.",
      "error": "Verknüpfen fehlgeschlagen. Bitte versuche es erneut."
    }
```

with `"connections": "Verknüpfungen"` under `settings.nav`.

- [ ] **Step 2: Write the failing component test**

`app/web/src/components/settings/__tests__/connections-pane.test.tsx`, following the shape
of the neighbouring `profile-pane.test.tsx` (read it for the `renderWithIntl` helper from
`@/test/intl`):

```tsx
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConnectionsPane } from '../connections-pane'

vi.mock('@/lib/auth-client', () => ({
  authClient: { linkSocial: vi.fn(), unlinkAccount: vi.fn() },
}))
const { authClient } = await import('@/lib/auth-client')

describe('ConnectionsPane', () => {
  it('offers to link when Discord is not connected', async () => {
    renderWithIntl(<ConnectionsPane linked={false} configured />)
    expect(screen.getByRole('button', { name: 'Link Discord' })).toBeInTheDocument()
  })

  it('starts the OAuth round-trip on click', async () => {
    renderWithIntl(<ConnectionsPane linked={false} configured />)
    await userEvent.click(screen.getByRole('button', { name: 'Link Discord' }))
    expect(authClient.linkSocial).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'discord' }),
    )
  })

  it('shows the linked state and an unlink control when connected', async () => {
    renderWithIntl(<ConnectionsPane linked configured />)
    expect(screen.getByText('Linked')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Unlink' }))
    expect(authClient.unlinkAccount).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'discord' }),
    )
  })

  it('explains itself instead of rendering a dead button when unconfigured', () => {
    renderWithIntl(<ConnectionsPane linked={false} configured={false} />)
    expect(screen.getByText('Discord linking is not configured on this instance.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Link Discord' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

```bash
cd app && /usr/local/bin/npm test -w web -- connections-pane
```

Expected: FAIL, unresolved import.

- [ ] **Step 4: Register the provider, conditionally**

In `app/web/src/lib/server/auth.ts`, above the `betterAuth({ ... })` call:

```ts
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET

// Registered only when both halves are present. A local checkout without a
// Discord app must still boot, and a half-configured provider fails at the
// callback rather than at startup, which is worse.
export const discordLinkingConfigured = Boolean(DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET)
```

and inside the config object:

```ts
  socialProviders: discordLinkingConfigured
    ? { discord: { clientId: DISCORD_CLIENT_ID!, clientSecret: DISCORD_CLIENT_SECRET! } }
    : {},
```

Do not log either value anywhere.

- [ ] **Step 5: Write the pane**

`app/web/src/components/settings/connections-pane.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'

export function ConnectionsPane({
  linked,
  configured,
}: {
  linked: boolean
  configured: boolean
}) {
  const t = useTranslations('settings.connections')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(false)
    try {
      await action()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h1>{t('title')}</h1>
      <p>{t('lead')}</p>

      <h2>{t('discordTitle')}</h2>
      <p>{t('discordBody')}</p>

      {!configured ? (
        <p>{t('unavailable')}</p>
      ) : linked ? (
        <>
          <p>{t('linked')}</p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => run(() => authClient.unlinkAccount({ providerId: 'discord' }))}
          >
            {t('unlink')}
          </Button>
        </>
      ) : (
        <Button
          disabled={busy}
          onClick={() =>
            run(() =>
              authClient.linkSocial({ provider: 'discord', callbackURL: '/settings/connections' }),
            )
          }
        >
          {t('link')}
        </Button>
      )}

      {error ? <p role="alert">{t('error')}</p> : null}
    </section>
  )
}
```

Match the surrounding panes' markup and Tailwind classes - read `profile-pane.tsx` and
follow it rather than the bare structure above.

- [ ] **Step 6: Write the page**

`app/web/src/app/[locale]/settings/connections/page.tsx`:

```tsx
import { requireSettingsUser } from '@/lib/server/settings-user'
import { getLinkedProviderIds } from '@revelio/db'
import { getDb } from '@/lib/server/db'
import { discordLinkingConfigured } from '@/lib/server/auth'
import { ConnectionsPane } from '@/components/settings/connections-pane'

export default async function ConnectionsSettingsPage() {
  const user = await requireSettingsUser('/settings/connections')
  const providers = await getLinkedProviderIds(getDb(), user.id)
  return (
    <ConnectionsPane
      linked={providers.includes('discord')}
      configured={discordLinkingConfigured}
    />
  )
}
```

- [ ] **Step 7: Add the nav entry**

In `app/web/src/components/settings/types.ts`:

```ts
export type SettingsSection = 'appearance' | 'profile' | 'email' | 'connections' | 'safety'
```

In `app/web/src/components/settings/settings-nav.tsx`, add `'connections'` to `SECTIONS`
before `'safety'`, import `Link2` from `lucide-react`, and add `connections: Link2` to
`ICONS`.

- [ ] **Step 8: Document the environment**

Append to `app/.env.example`, under the existing Discord block:

```
# Web-side OAuth credentials for linking a Discord account (server-only, never
# NEXT_PUBLIC_). Leave unset to disable linking; the Connections pane then says so.
DISCORD_CLIENT_SECRET=
```

`DISCORD_CLIENT_ID` is already there from the foundation plan and is shared by both.

- [ ] **Step 9: Run the checks**

```bash
cd app && /usr/local/bin/npm test -w web && /usr/local/bin/npm run lint -w web && /usr/local/bin/npm run typecheck
```

Expected: PASS, including `message-key-parity` and `server-only-guard`.

- [ ] **Step 10: Commit**

```bash
git add app/web app/.env.example
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): link a Discord account from settings"
```

---

### Task 3: Privacy policy

**Files:**
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json`, `app/web/src/app/[locale]/privacy/page.tsx`
- Test: `app/web/src/app/[locale]/privacy/__tests__/privacy.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: a `privacy.discordTitle` / `privacy.discordBody` subsection.

Linking stores a third-party identifier and makes Discord a recipient of card and deck
data. That belongs in the policy before the feature ships, not after.

- [ ] **Step 1: Add the copy**

In both catalogs, add after `contactBody`:

English:

```json
    "discordTitle": "Discord connection",
    "discordBody": "If you link your Discord account, we store your Discord user ID together with your Revelio account so the Revelio bot can recognise you. We do not receive your Discord password, email address or message history. When you use the bot, the card, deck and collection data in the reply is transmitted to Discord, which delivers it to you; replies containing your own collection or decks are sent privately and are visible only to you. You can unlink at any time under Settings, Connections, which deletes the stored connection. Legal basis: Art. 6(1)(b) GDPR, since the connection is needed to provide the service you asked for.",
```

German:

```json
    "discordTitle": "Discord-Verknüpfung",
    "discordBody": "Wenn du dein Discord-Konto verknüpfst, speichern wir deine Discord-Benutzer-ID zusammen mit deinem Revelio-Konto, damit der Revelio-Bot dich erkennen kann. Dein Discord-Passwort, deine E-Mail-Adresse und deine Nachrichten erhalten wir nicht. Bei der Nutzung des Bots werden die Karten-, Deck- und Sammlungsdaten der Antwort an Discord übermittelt, das sie dir zustellt; Antworten mit deiner eigenen Sammlung oder deinen Decks werden privat gesendet und sind nur für dich sichtbar. Du kannst die Verknüpfung jederzeit unter Einstellungen, Verknüpfungen aufheben; die gespeicherte Verbindung wird dann gelöscht. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO, da die Verknüpfung zur Erbringung der von dir gewünschten Leistung erforderlich ist.",
```

Also extend `recipientsBody` in both catalogs to name Discord as a recipient for users who
have linked. Read the existing sentence and add a clause in the same register - do not
rewrite the paragraph.

- [ ] **Step 2: Render it**

In `app/web/src/app/[locale]/privacy/page.tsx`, inside the `processingTitle` block, after
the `contactTitle` / `contactBody` pair:

```tsx
      <h3>{t('discordTitle')}</h3>
      <p>{t('discordBody')}</p>
```

Bump `LAST_UPDATED` to `new Date('2026-09-09T00:00:00Z')`.

- [ ] **Step 3: Add an assertion**

Extend `app/web/src/app/[locale]/privacy/__tests__/privacy.test.tsx` with a case asserting
the Discord heading renders in both locales, matching the file's existing style.

No cookie or localStorage key is added by this feature, so `cookiesBody` is unchanged.

- [ ] **Step 4: Verify and commit**

```bash
cd app && /usr/local/bin/npm test -w web -- privacy && /usr/local/bin/npm test -w web -- message-key-parity
git add app/web
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "docs(web): document the Discord connection in the privacy policy"
```

---

### Task 4: The bot's link resolution and personal commands

**Files:**
- Create: `app/bot/src/data/link.ts`, `app/bot/src/data/collection.ts`, `app/bot/src/discord/commands/collection.ts`, `app/bot/src/discord/commands/mydecks.ts`
- Modify: `app/bot/src/discord/commands/index.ts`, `app/bot/src/i18n/en.json`, `app/bot/src/i18n/de.json`
- Test: `app/bot/test/link.test.ts`, `app/bot/test/personal-commands.test.ts`

**Interfaces:**
- Consumes: `getUserIdByDiscordAccount` (Task 1); `getCollectionSummary`, `getCollectionSetProgress`, `listDecksByUser` from `@revelio/db`.
- Produces:
  - `function resolveLinkedUser(db: DB, discordUserId: string): Promise<string | null>`
  - `type CollectionReport = { distinctOwned: number; totalCards: number; totalCopies: number; percent: number }`
  - `function getCollectionReport(db: DB, userId: string): Promise<CollectionReport>`
  - `function getSetProgress(db: DB, userId: string, setCode: string): Promise<{ owned: number; total: number } | null>`

- [ ] **Step 1: Add the strings**

`app/bot/src/i18n/en.json`:

```json
  "command.collection.description": "Show your collection progress",
  "command.collection.option.set": "Limit to one set",
  "command.mydecks.description": "List your decks",
  "link.required": "Link your Discord account first: {url}",
  "collection.summary": "You own **{owned}** of **{total}** cards ({percent}%), **{copies}** copies in total.",
  "collection.set": "**{setName}**: {owned} of {total} ({percent}%)",
  "collection.setUnknown": "No set matched that code.",
  "decks.empty": "You have no decks yet. Build one at {url}",
  "decks.line": "**{name}** · {format} · {count} cards · {visibility}",
  "decks.visibility.public": "public",
  "decks.visibility.private": "private",
  "decks.title": "Your decks ({count})"
```

`app/bot/src/i18n/de.json`:

```json
  "command.collection.description": "Deinen Sammlungsfortschritt anzeigen",
  "command.collection.option.set": "Auf ein Set beschränken",
  "command.mydecks.description": "Deine Decks auflisten",
  "link.required": "Verknüpfe zuerst dein Discord-Konto: {url}",
  "collection.summary": "Du besitzt **{owned}** von **{total}** Karten ({percent}%), insgesamt **{copies}** Exemplare.",
  "collection.set": "**{setName}**: {owned} von {total} ({percent}%)",
  "collection.setUnknown": "Zu diesem Code gibt es kein Set.",
  "decks.empty": "Du hast noch keine Decks. Baue eins auf {url}",
  "decks.line": "**{name}** · {format} · {count} Karten · {visibility}",
  "decks.visibility.public": "öffentlich",
  "decks.visibility.private": "privat",
  "decks.title": "Deine Decks ({count})"
```

- [ ] **Step 2: Write the failing tests**

`app/bot/test/link.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as dbModule from '@revelio/db'
import { resolveLinkedUser } from '../src/data/link'

afterEach(() => vi.restoreAllMocks())

describe('resolveLinkedUser', () => {
  it('returns the Revelio user id for a linked snowflake', async () => {
    vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockResolvedValue('user-1')
    expect(await resolveLinkedUser({} as never, '111')).toBe('user-1')
  })

  it('returns null for an unlinked snowflake', async () => {
    vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockResolvedValue(null)
    expect(await resolveLinkedUser({} as never, '999')).toBeNull()
  })
})
```

`app/bot/test/personal-commands.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { MessageFlags } from 'discord.js'
import * as dbModule from '@revelio/db'
import { COMMANDS } from '../src/discord/commands/index'

afterEach(() => vi.restoreAllMocks())

function fakeInteraction(options: Record<string, string | null> = {}, locale = 'en') {
  return {
    locale,
    user: { id: '111' },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    options: { getString: (n: string) => options[n] ?? null },
  }
}

const deps = {
  db: {},
  sets: { name: vi.fn().mockResolvedValue('Base Set'), all: vi.fn().mockResolvedValue([]) },
  env: { SITE_BASE_URL: 'https://revelio.cards' },
}

describe('/collection', () => {
  it('always replies ephemerally', async () => {
    vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockResolvedValue('user-1')
    vi.spyOn(dbModule, 'getCollectionSummary').mockResolvedValue({
      distinctOwned: 50, totalCards: 200, totalCopies: 80,
    } as never)
    const interaction = fakeInteraction()
    await COMMANDS.get('collection')!.execute(interaction as never, deps as never)
    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral })
  })

  it('reports owned, total, percentage and copies', async () => {
    vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockResolvedValue('user-1')
    vi.spyOn(dbModule, 'getCollectionSummary').mockResolvedValue({
      distinctOwned: 50, totalCards: 200, totalCopies: 80,
    } as never)
    const interaction = fakeInteraction()
    await COMMANDS.get('collection')!.execute(interaction as never, deps as never)
    const { content } = interaction.editReply.mock.calls[0][0]
    expect(content).toContain('50')
    expect(content).toContain('200')
    expect(content).toContain('25')
  })

  it('points an unlinked user at the settings page', async () => {
    vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockResolvedValue(null)
    const interaction = fakeInteraction()
    await COMMANDS.get('collection')!.execute(interaction as never, deps as never)
    expect(interaction.editReply.mock.calls[0][0].content)
      .toContain('https://revelio.cards/settings/connections')
  })

  it('does not divide by zero when the card pool is empty', async () => {
    vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockResolvedValue('user-1')
    vi.spyOn(dbModule, 'getCollectionSummary').mockResolvedValue({
      distinctOwned: 0, totalCards: 0, totalCopies: 0,
    } as never)
    const interaction = fakeInteraction()
    await COMMANDS.get('collection')!.execute(interaction as never, deps as never)
    expect(interaction.editReply.mock.calls[0][0].content).not.toContain('NaN')
  })
})

describe('/mydecks', () => {
  it('always replies ephemerally', async () => {
    vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockResolvedValue('user-1')
    vi.spyOn(dbModule, 'listDecksByUser').mockResolvedValue([] as never)
    const interaction = fakeInteraction()
    await COMMANDS.get('mydecks')!.execute(interaction as never, deps as never)
    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral })
  })

  it('lists private decks too, since only the asker sees the reply', async () => {
    vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockResolvedValue('user-1')
    vi.spyOn(dbModule, 'listDecksByUser').mockResolvedValue([
      { id: 'd1', name: 'Secret Brew', format: 'classic', visibility: 'private', mainCount: 60, cardCount: 61, hasCharacter: true, characterName: 'Harry', updatedAt: '2026-01-01' },
    ] as never)
    const interaction = fakeInteraction()
    await COMMANDS.get('mydecks')!.execute(interaction as never, deps as never)
    expect(interaction.editReply.mock.calls[0][0].content).toContain('Secret Brew')
  })

  it('offers the builder link when the user has no decks', async () => {
    vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockResolvedValue('user-1')
    vi.spyOn(dbModule, 'listDecksByUser').mockResolvedValue([] as never)
    const interaction = fakeInteraction()
    await COMMANDS.get('mydecks')!.execute(interaction as never, deps as never)
    expect(interaction.editReply.mock.calls[0][0].content).toContain('/decks/new')
  })
})
```

The two ephemeral assertions are the most important tests in this plan: a regression there
leaks a user's collection into a public channel.

- [ ] **Step 3: Run them to verify they fail**

```bash
cd app && /usr/local/bin/npm test -w @revelio/bot
```

Expected: FAIL.

- [ ] **Step 4: Write `data/link.ts`**

```ts
import { getUserIdByDiscordAccount, type DB } from '@revelio/db'

// One indirection on purpose: every personal command goes through this, so the
// "who is this Discord user" rule has exactly one implementation to audit.
export async function resolveLinkedUser(
  db: DB,
  discordUserId: string,
): Promise<string | null> {
  return getUserIdByDiscordAccount(db, discordUserId)
}
```

- [ ] **Step 5: Write `data/collection.ts`**

```ts
import { getCollectionSetProgress, getCollectionSummary, type DB } from '@revelio/db'

export type CollectionReport = {
  distinctOwned: number
  totalCards: number
  totalCopies: number
  percent: number
}

function percentOf(owned: number, total: number): number {
  // A fresh instance with no cards indexed would otherwise render NaN%.
  return total === 0 ? 0 : Math.round((owned / total) * 100)
}

export async function getCollectionReport(db: DB, userId: string): Promise<CollectionReport> {
  const s = await getCollectionSummary(db, userId)
  return { ...s, percent: percentOf(s.distinctOwned, s.totalCards) }
}

export async function getSetProgress(
  db: DB,
  userId: string,
  setCode: string,
): Promise<{ owned: number; total: number; percent: number } | null> {
  const rows = await getCollectionSetProgress(db, userId)
  const row = rows.find((r) => r.setCode === setCode)
  return row ? { owned: row.owned, total: row.total, percent: percentOf(row.owned, row.total) } : null
}
```

- [ ] **Step 6: Write the two commands**

`app/bot/src/discord/commands/collection.ts`:

```ts
import { MessageFlags, SlashCommandBuilder, type AutocompleteInteraction, type ChatInputCommandInteraction } from 'discord.js'
import type { Deps } from '../../clients'
import { MAX_CHOICES } from '../../data/cards'
import { getCollectionReport, getSetProgress } from '../../data/collection'
import { resolveLinkedUser } from '../../data/link'
import { toRevelioLocale } from '../../i18n/locale'
import { t } from '../../i18n/t'
import { settingsUrl } from '../../links'

export const data = new SlashCommandBuilder()
  .setName('collection')
  .setDescription(t('en', 'command.collection.description'))
  .setDescriptionLocalizations({ de: t('de', 'command.collection.description') })
  .addStringOption((o) =>
    o.setName('set')
      .setDescription(t('en', 'command.collection.option.set'))
      .setDescriptionLocalizations({ de: t('de', 'command.collection.option.set') })
      .setAutocomplete(true),
  )

export async function execute(
  interaction: ChatInputCommandInteraction,
  deps: Deps,
): Promise<void> {
  // Ephemeral before anything else: a collection is not channel business.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  const locale = toRevelioLocale(interaction.locale)

  const userId = await resolveLinkedUser(deps.db, interaction.user.id)
  if (!userId) {
    await interaction.editReply({
      content: t(locale, 'link.required', { url: settingsUrl(deps.env.SITE_BASE_URL, locale) }),
    })
    return
  }

  const setCode = interaction.options.getString('set')
  if (setCode) {
    const progress = await getSetProgress(deps.db, userId, setCode)
    if (!progress) {
      await interaction.editReply({ content: t(locale, 'collection.setUnknown') })
      return
    }
    await interaction.editReply({
      content: t(locale, 'collection.set', {
        setName: await deps.sets.name(setCode, locale),
        owned: progress.owned, total: progress.total, percent: progress.percent,
      }),
    })
    return
  }

  const report = await getCollectionReport(deps.db, userId)
  await interaction.editReply({
    content: t(locale, 'collection.summary', {
      owned: report.distinctOwned, total: report.totalCards,
      percent: report.percent, copies: report.totalCopies,
    }),
  })
}

// Same set suggestions as /search; see the autocomplete plan for the 3 second budget.
export async function autocomplete(
  interaction: AutocompleteInteraction,
  deps: Deps,
): Promise<void> {
  const focused = interaction.options.getFocused().trim().toLowerCase()
  try {
    const sets = await deps.sets.all(toRevelioLocale(interaction.locale))
    const matches = sets
      .filter((s) => !focused
        || s.code.toLowerCase().includes(focused)
        || s.name.toLowerCase().includes(focused))
      .slice(0, MAX_CHOICES)
    await interaction.respond(matches.map((s) => ({ name: s.name, value: s.code })))
  } catch (err) {
    console.error('collection autocomplete failed:', err)
    await interaction.respond([]).catch(() => {})
  }
}
```

`app/bot/src/discord/commands/mydecks.ts`:

```ts
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'
import { listDecksByUser } from '@revelio/db'
import type { Deps } from '../../clients'
import { resolveLinkedUser } from '../../data/link'
import { toRevelioLocale } from '../../i18n/locale'
import { t } from '../../i18n/t'
import { deckUrl, newDeckUrl, settingsUrl } from '../../links'

const MESSAGE_LIMIT = 2000

export const data = new SlashCommandBuilder()
  .setName('mydecks')
  .setDescription(t('en', 'command.mydecks.description'))
  .setDescriptionLocalizations({ de: t('de', 'command.mydecks.description') })

export async function execute(
  interaction: ChatInputCommandInteraction,
  deps: Deps,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  const locale = toRevelioLocale(interaction.locale)

  const userId = await resolveLinkedUser(deps.db, interaction.user.id)
  if (!userId) {
    await interaction.editReply({
      content: t(locale, 'link.required', { url: settingsUrl(deps.env.SITE_BASE_URL, locale) }),
    })
    return
  }

  const decks = await listDecksByUser(deps.db, userId)
  if (!decks.length) {
    await interaction.editReply({
      content: t(locale, 'decks.empty', { url: newDeckUrl(deps.env.SITE_BASE_URL, locale) }),
    })
    return
  }

  // Private decks are included on purpose: this reply is ephemeral, so only the
  // person who ran the command can read it.
  const lines = [t(locale, 'decks.title', { count: decks.length })]
  for (const d of decks) {
    const line = `${t(locale, 'decks.line', {
      name: d.name,
      format: t(locale, `deck.format.${d.format}`),
      count: d.mainCount,
      visibility: t(locale, `decks.visibility.${d.visibility}`),
    })} - ${deckUrl(deps.env.SITE_BASE_URL, d.id, locale)}`
    if (lines.join('\n').length + line.length + 1 > MESSAGE_LIMIT) break
    lines.push(line)
  }
  await interaction.editReply({ content: lines.join('\n') })
}
```

- [ ] **Step 7: Add the two link helpers**

In `app/bot/src/links.ts`:

```ts
export function settingsUrl(siteBase: string, locale: string): string {
  return `${localeRoot(siteBase, locale)}/settings/connections`
}

export function newDeckUrl(siteBase: string, locale: string): string {
  return `${localeRoot(siteBase, locale)}/decks/new`
}
```

Add a test for each in `app/bot/test/links.test.ts`, matching the existing cases' shape.

- [ ] **Step 8: Register the commands**

In `app/bot/src/discord/commands/index.ts`:

```ts
import * as collection from './collection'
import * as mydecks from './mydecks'
...
export const COMMANDS: Map<string, BotCommand> = new Map(
  [card, search, deck, collection, mydecks].map((c) => [c.data.name, c as BotCommand]),
)
```

- [ ] **Step 9: Run everything**

```bash
cd app && /usr/local/bin/npm test -w @revelio/bot && /usr/local/bin/npm run typecheck
```

Expected: PASS, including `catalog-parity`.

- [ ] **Step 10: Commit**

```bash
git add app/bot
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(bot): add /collection and /mydecks for linked accounts"
```

---

### Task 5: End-to-end acceptance

**Files:** none. Verification only.

- [ ] **Step 1: Configure and run both sides**

Set `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` in `app/.env`, confirm
`http://localhost:3000/api/auth/callback/discord` is in the Discord app's OAuth2 redirect
list, then run the web app and the bot side by side.

- [ ] **Step 2: Acceptance checklist**

- [ ] `/collection` **before** linking returns an ephemeral reply (marked "Only you can see this") linking to `/settings/connections`.
- [ ] `/settings/connections` shows the Link Discord button; clicking it completes the OAuth round-trip and returns to the pane in the Linked state.
- [ ] The `account` table now holds one row with `provider_id = 'discord'` and the correct `user_id`.
- [ ] `/collection` now reports the same owned/total numbers the collection page shows.
- [ ] `/collection set:<code>` matches that set's row on the collection page.
- [ ] `/collection set:zzz` returns the "no set matched" line.
- [ ] `/mydecks` lists every deck, **including private ones**, and every reply is ephemeral.
- [ ] A **second** Discord user running `/collection` in the same channel sees their own state, not yours.
- [ ] Unlink on the settings pane; `/collection` reverts to the link prompt and the `account` row is gone.
- [ ] With `DISCORD_CLIENT_SECRET` unset, the site still boots and the pane shows the "not configured" note with no button.
- [ ] `grep -rn "DISCORD_CLIENT_SECRET" app/web/.next` after a build returns nothing outside server chunks - the secret must not be inlined into client JavaScript.

- [ ] **Step 3: Open the PR**

```bash
cd app && /usr/local/bin/npm run lint -w web && /usr/local/bin/npm run typecheck
git push -u origin feat/discord-account-linking
/opt/homebrew/bin/gh pr create --title "feat: link Discord accounts and add /collection and /mydecks" \
  --body "Adds Better Auth's Discord social provider, a Connections settings pane, and the bot's /collection and /mydecks commands. Linking reuses Better Auth's existing account table, so there is no schema change and no migration. Personal replies are ephemeral, with tests asserting the flag on both commands. Privacy policy updated to cover the stored Discord user ID and Discord as a recipient.

Deployment: set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET on the web service and add the production OAuth redirect URI in the Discord developer portal. Without them the provider is not registered and the pane says so."
```

---

## Self-Review Notes

- **Spec coverage:** covers the spec's "Account linking" and "Privacy" sections in full,
  including its claim that no migration is needed - Task 1, Step 5 verifies that rather
  than assuming it.
- **Type consistency:** `resolveLinkedUser` is the single entry point both personal
  commands use; `percentOf` is defined once in `data/collection.ts`.
- **The riskiest thing here** is a personal reply leaking into a public channel. Both
  commands defer ephemerally as their first statement, and both have a test asserting the
  flag. Any future personal command must do the same.
- **Deliberately not built:** a `/link` code-paste flow (the OAuth provider makes it
  redundant), collection writes from Discord (the bot stays read-only), and per-finish
  collection detail (the summary plus a per-set breakdown is the useful level in chat).
