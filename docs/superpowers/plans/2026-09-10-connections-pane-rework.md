# Connections Pane Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/settings/connections` from three stacked text blocks into a Discord provider row that carries the Discord mark, names the linked account, and confirms before unlinking.

**Architecture:** The pane keeps its card shell and its existing link/unlink logic untouched; only the render half changes, from `h3` + paragraph + button into one flex-wrap provider row (logo tile, identity, controls, caption). The linked account's display name has no home in the database - Better Auth's `account` row stores only the Discord snowflake - so a new server helper asks Discord for it at render through `auth.api.getAccessToken`, which decrypts and refreshes the stored token. The name is decoration: every failure path returns `null` and the row falls back to today's plain "Linked" badge. Unlinking gains an `AlertDialog` in front of it, reusing the pattern `delete-account-section.tsx` already established.

**Tech Stack:** Next.js 16 App Router, React 19, next-intl, Better Auth 1.6, Tailwind v4 + shadcn primitives (`Badge`, `Button`, `AlertDialog`), Vitest + Testing Library.

**Spec:** No separate spec document - this is a single-phase bounded change whose design was agreed in session. The design is restated in full below, and the visual reference is the mockup at https://claude.ai/code/artifact/00292bb5-c27d-4698-b75a-fdf1906b4c71 (states: today, not linked, linked, unconfigured, narrow viewport, unlink dialog).

## Global Constraints

- All app commands run from `app/`. Run tests per workspace: `npm test -w web`. A bare `npm test` runs `@revelio/ingest`'s tests, which delete the local `cards-en`/`cards-de` Meilisearch indexes.
- Node and npm are not on the default shell PATH: prefix with `/usr/local/bin`. `gh` and `gpg` live at `/opt/homebrew/bin`.
- Commit signing needs the explicit gpg path: `git -c gpg.program=/opt/homebrew/bin/gpg commit`.
- Conventional Commits. No Claude/Claude Code attribution in commits or PR bodies.
- Every user-facing string comes from `web/messages/en.json` **and** `web/messages/de.json`. `src/lib/__tests__/message-key-parity.test.ts` fails if the two catalogs drift.
- Code comments are ASCII only: no em-dashes, no unicode arrows.
- Declaration order within a file: types, then constants, then unexported helpers, then exported functions.
- `src/lib/server/` modules must start with `import 'server-only'`; a test in `lib/server/__tests__/server-only-guard.test.ts` enforces it.
- No barrel files: import the leaf path.
- Work on branch `feat/connections-pane-rework`, never on `main`.
- Web test files are not typechecked (a known vitest/better-auth version skew), so a type error in a test surfaces only when vitest runs it.

---

## Design (what the tasks are building)

The card keeps `<h2>Connections</h2>` plus its lead paragraph as the section title. Below it, Discord becomes one row:

```
┌ Connections ───────────────────────────────────────────────────┐
│  Link an account to use Revelio outside the website.           │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ ┌────┐  Discord            ● Linked      [   Unlink   ]  │  │
│  │ │ Dc │  @timonw                                          │  │
│  │ └────┘  ------------------------------------------------  │  │
│  │  Use /collection and /mydecks with the Revelio bot.      │  │
│  │  Only you can see those replies.                         │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

Three states, one row shape:

| State | Subline | Controls |
| --- | --- | --- |
| Not linked | "Not linked" | gold **Link Discord** with the mark as leading icon |
| Linked, name known | `@handle` | outline "Linked" badge with a `bg-chart-4` dot, outline **Unlink** |
| Linked, name unavailable | (omitted) | same badge and button |
| Not configured | (omitted) | dimmed tile, `unavailable` sentence, no button |

Decisions the tasks must not quietly revise:

- **The tile is Discord blurple `#5865F2`, white mark.** A provider mark is recognised before it is read, and full colour on a plain tile is what Discord's brand rules permit. It goes into `globals.css` as `--brand-discord`, theme-independent, because that file's stated convention is that every hex appears exactly once there.
- **The dot is `bg-chart-4`,** following `deck/deck-list.tsx`, which already uses that token as its "complete" dot. Revelio has no dedicated success token and this plan does not add one.
- **`Unlink` in the row is an outline button, not destructive.** Unlinking is reversible in seconds, so red would overstate it; the red lands on the dialog's confirm, where the consequence is spelled out. This deliberately differs from `delete-account-section.tsx`, whose trigger is destructive because deleting an account is not reversible.
- **The dialog follows `delete-account-section.tsx`:** plain `Button`s inside `AlertDialogFooter` rather than `AlertDialogAction`/`AlertDialogCancel`, because the component owns when it closes.
- **No Discord avatar.** It would mean a per-render request from the reader's browser to Discord's CDN plus a privacy-policy line, for less than the logo tile already gives.
- **The handle is fetched, not stored.** No migration, no column that goes stale when someone renames at Discord.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `app/web/src/app/globals.css` | Add `--brand-discord` to the palette and expose it as a Tailwind color. |
| `app/web/src/components/discord-mark.tsx` | **New.** The Discord Clyde glyph as an inline SVG. Domain-free, so it sits at the components root beside `date-picker.tsx`. |
| `app/web/src/components/__tests__/discord-mark.test.tsx` | **New.** Guards the two contracts the row depends on: an optional `className` and `currentColor`. |
| `app/web/src/lib/server/discord-oauth.ts` | Gains `getDiscordAccountName(userId)`. This module already owns every Discord REST call in `web`. |
| `app/web/src/lib/server/__tests__/discord-oauth.test.ts` | Extended with the name-fetch happy path and each failure path. |
| `app/web/src/app/[locale]/settings/connections/page.tsx` | Resolves the account name server-side and passes it down. |
| `app/web/src/components/settings/connections-pane.tsx` | Render half rewritten as the provider row plus the confirm dialog. Link/unlink logic unchanged. |
| `app/web/src/components/settings/__tests__/connections-pane.test.tsx` | Existing unlink tests re-routed through the dialog; new tests for the handle, the fallback, and cancel. |
| `app/web/messages/en.json`, `app/web/messages/de.json` | Six new keys plus reworded `discordBody`. |

---

## Task 0: Branch

- [ ] **Step 1: Branch off main**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git checkout main && git pull
git checkout -b feat/connections-pane-rework
```

---

## Task 1: The Discord display name, server-side

**Files:**
- Modify: `app/web/src/lib/server/discord-oauth.ts`
- Test: `app/web/src/lib/server/__tests__/discord-oauth.test.ts`

**Interfaces:**
- Consumes: `auth` from `@/lib/server/auth` (already imported by this module).
- Produces: `getDiscordAccountName(userId: string): Promise<string | null>` - the Discord display name without a leading `@`, or `null` when it cannot be determined for any reason.

**Why `auth.api.getAccessToken` and not `account.accessToken`:** the stored token is ciphertext (`account.encryptOAuthTokens` is on) and Discord access tokens expire after a week. `getValidAccessToken` inside Better Auth decrypts the stored token, refreshes it through the provider's `refreshAccessToken` when it is within 5s of expiry, persists the refreshed pair, and returns plaintext. Calling it with `body.userId` and **no** headers is the server-trusted path: `resolveUserId` only throws `UNAUTHORIZED` when a request or headers are present, so a bare server call resolves to the `userId` passed in. Any failure throws a Better Auth `APIError`, hence the `try`/`catch`.

- [ ] **Step 1: Write the failing tests**

Add to the top of `app/web/src/lib/server/__tests__/discord-oauth.test.ts` - extend the import and the `auth` mock, and add one mock fn:

```ts
import { revokeDiscordAuthorization, unlinkAndRevokeDiscord, getDiscordAccountName } from '../discord-oauth'
```

```ts
const getAccessTokenMock = vi.fn()

// The real module builds a Postgres client and a mailer at import time. What is
// needed here is the key the tokens were encrypted with, plus the endpoint the
// display-name lookup borrows to decrypt and refresh a stored token.
vi.mock('@/lib/server/auth', () => ({
  auth: {
    $context: Promise.resolve({ secretConfig: 'test-secret' }),
    api: { getAccessToken: (...args: unknown[]) => getAccessTokenMock(...args) },
  },
}))
```

Add to the existing `beforeEach`:

```ts
  getAccessTokenMock.mockReset().mockResolvedValue({ accessToken: 'access-token' })
```

Append these tests to the end of the file:

```ts
// The account row holds only the snowflake, so the name has to come from
// Discord. global_name is the display name Discord shows everywhere now;
// username is the legacy handle and the fallback for accounts without one.
it('reads the display name from the Discord profile', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ global_name: 'Timon', username: 'timonw' }),
  })
  expect(await getDiscordAccountName('user-1')).toBe('Timon')
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('https://discord.com/api/users/@me')
  expect(init.headers.Authorization).toBe('Bearer access-token')
})

it('asks Better Auth for the token so an expired one gets refreshed first', async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ username: 'timonw' }) })
  await getDiscordAccountName('user-1')
  expect(getAccessTokenMock).toHaveBeenCalledWith({
    body: { providerId: 'discord', userId: 'user-1' },
  })
})

it('falls back to the username when the account has no display name', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ global_name: null, username: 'timonw' }),
  })
  expect(await getDiscordAccountName('user-1')).toBe('timonw')
})

// The name is decoration: the pane falls back to the plain linked badge, so
// none of these may propagate and break the settings page.
it('returns null when no usable token can be produced', async () => {
  getAccessTokenMock.mockRejectedValue(new Error('FAILED_TO_GET_ACCESS_TOKEN'))
  expect(await getDiscordAccountName('user-1')).toBeNull()
  expect(fetchMock).not.toHaveBeenCalled()
})

it('returns null when Discord rejects the token', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 401 })
  expect(await getDiscordAccountName('user-1')).toBeNull()
})

it('returns null when Discord cannot be reached', async () => {
  fetchMock.mockRejectedValue(new Error('ETIMEDOUT'))
  expect(await getDiscordAccountName('user-1')).toBeNull()
})

it('returns null when the profile carries neither name', async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: '123' }) })
  expect(await getDiscordAccountName('user-1')).toBeNull()
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app
/usr/local/bin/npm test -w web -- src/lib/server/__tests__/discord-oauth.test.ts
```

Expected: the seven new tests fail with `getDiscordAccountName is not a function`. The eleven existing tests in the file must still pass - if one broke, the `auth` mock edit was wrong.

- [ ] **Step 3: Implement `getDiscordAccountName`**

In `app/web/src/lib/server/discord-oauth.ts`, add the endpoint constant next to `REVOKE_ENDPOINT`:

```ts
const USER_ENDPOINT = 'https://discord.com/api/users/@me'
```

Then append the exported function at the end of the file (exported functions come last, per the repo's declaration order):

```ts
// The Connections pane names the linked account, and the account row holds only
// the snowflake - so the display name comes from Discord on demand. Storing it
// would need a migration and would go stale the moment someone renames.
//
// The token comes from Better Auth rather than account.accessToken because the
// stored value is ciphertext and Discord access tokens last a week:
// getAccessToken decrypts it, refreshes it through the provider when it has
// expired, and persists the new pair. Passing userId with no headers is the
// server-trusted path; it throws an APIError on anything it cannot resolve.
//
// Every failure returns null: the name is decoration, and the pane renders the
// plain linked state without it. A settings page must not break because
// Discord is having a bad day.
export async function getDiscordAccountName(userId: string): Promise<string | null> {
  let accessToken: string | undefined
  try {
    const tokens = await auth.api.getAccessToken({ body: { providerId: 'discord', userId } })
    accessToken = tokens.accessToken
  } catch {
    return null
  }
  if (!accessToken) return null

  try {
    const res = await fetch(USER_ENDPOINT, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) return null
    // global_name is the current display name; username is the legacy handle,
    // still the only name on accounts that never set one.
    const profile = (await res.json()) as { global_name?: string | null; username?: string | null }
    return profile.global_name || profile.username || null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app
/usr/local/bin/npm test -w web -- src/lib/server/__tests__/discord-oauth.test.ts
/usr/local/bin/npm run typecheck
```

Expected: 18 tests pass, typecheck clean. If `tokens.accessToken` is typed `string | undefined`, the `if (!accessToken)` guard is what makes the `fetch` call typecheck - do not replace it with a non-null assertion.

- [ ] **Step 5: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/src/lib/server/discord-oauth.ts app/web/src/lib/server/__tests__/discord-oauth.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(settings): resolve the linked Discord display name server-side"
```

---

## Task 2: The Discord mark and the copy it sits next to

**Files:**
- Modify: `app/web/src/app/globals.css`
- Create: `app/web/src/components/discord-mark.tsx`
- Test: `app/web/src/components/__tests__/discord-mark.test.tsx`
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json`

**Interfaces:**
- Produces: `DiscordMark({ className }: { className?: string })` - an inline `<svg>`, `aria-hidden`, painted with `currentColor`. `className` is optional because inside a `Button` the shadcn base class (`[&_svg:not([class*='size-'])]:size-4`) already sizes it, while the 40px tile passes `size-6`.
- Produces: the Tailwind color `bg-brand-discord` / `text-brand-discord`.
- Produces: message keys `settings.connections.{notLinked,unlinkTitle,unlinkBody,unlinkBodyNamed,cancel,confirmUnlink}` and a reworded `discordBody`.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/components/__tests__/discord-mark.test.tsx`:

```tsx
import { it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { DiscordMark } from '../discord-mark'

// The row paints the mark white on the blurple tile and dark on the gold Link
// button, so it must inherit rather than carry its own fill.
it('inherits its colour from the surrounding text', () => {
  const { container } = render(<DiscordMark />)
  expect(container.querySelector('svg')).toHaveAttribute('fill', 'currentColor')
})

// The tile sizes it at size-6; inside a Button the shadcn base class sizes it
// at size-4 only while no size- class is present, so className must stay
// optional and must land on the svg when given.
it('takes the size class the caller passes', () => {
  const { container } = render(<DiscordMark className="size-6" />)
  expect(container.querySelector('svg')).toHaveClass('size-6')
})

// Decorative: the row already prints the word "Discord" right beside it.
it('is hidden from assistive technology', () => {
  const { container } = render(<DiscordMark />)
  expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app
/usr/local/bin/npm test -w web -- src/components/__tests__/discord-mark.test.tsx
```

Expected: FAIL, cannot resolve `../discord-mark`.

- [ ] **Step 3: Create the component**

Create `app/web/src/components/discord-mark.tsx`:

```tsx
// Discord's Clyde mark. lucide-react dropped brand icons, so the official path
// is inlined here rather than pulled from an icon set. Decorative on purpose:
// every place it renders prints the word "Discord" next to it.
export function DiscordMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  )
}
```

- [ ] **Step 4: Add the brand colour to the palette**

In `app/web/src/app/globals.css`, inside the `@theme inline` block, add the alias next to `--color-brand-indigo`:

```css
  --color-brand-discord: var(--brand-discord);
```

Then in the `:root` block, immediately above `--radius: 0.6rem;`, add the value. It sits outside the light and dark value sets because a brand colour does not change with the theme:

```css
  /* Discord blurple, for the provider tile in Connections. Theme-independent:
     it identifies Discord, so it is the one hex here that must not shift
     between parchment and midnight. */
  --brand-discord: #5865F2;
```

- [ ] **Step 5: Add the message keys**

In `app/web/messages/en.json`, replace the `settings.connections` block with:

```json
    "connections": {
      "title": "Connections",
      "lead": "Link an account to use Revelio outside the website.",
      "discordTitle": "Discord",
      "discordBody": "Use /collection and /mydecks with the Revelio bot. Only you can see those replies.",
      "linked": "Linked",
      "notLinked": "Not linked",
      "link": "Link Discord",
      "unlink": "Unlink",
      "unlinkTitle": "Unlink Discord?",
      "unlinkBody": "The Revelio bot will stop answering /collection and /mydecks. Your decks and collection stay on your Revelio account, and you can link again at any time.",
      "unlinkBodyNamed": "The Revelio bot will stop answering /collection and /mydecks for {name}. Your decks and collection stay on your Revelio account, and you can link again at any time.",
      "cancel": "Cancel",
      "confirmUnlink": "Unlink Discord",
      "unavailable": "Discord linking is not configured on this instance.",
      "error": "Linking failed. Please try again.",
      "alreadyLinked": "That Discord account is already linked to another Revelio account.",
      "unverifiedDiscord": "Discord has not verified the email address on that account. Verify it with Discord, then try linking again.",
      "unlinkError": "Couldn’t unlink your Discord account. Please try again."
    },
```

In `app/web/messages/de.json`, replace the `settings.connections` block with:

```json
    "connections": {
      "title": "Verknüpfungen",
      "lead": "Verknüpfe ein Konto, um Revelio außerhalb der Website zu nutzen.",
      "discordTitle": "Discord",
      "discordBody": "Nutze /collection und /mydecks mit dem Revelio-Bot. Diese Antworten sieht nur du.",
      "linked": "Verknüpft",
      "notLinked": "Nicht verknüpft",
      "link": "Discord verknüpfen",
      "unlink": "Trennen",
      "unlinkTitle": "Discord trennen?",
      "unlinkBody": "Der Revelio-Bot antwortet dann nicht mehr auf /collection und /mydecks. Deine Decks und deine Sammlung bleiben in deinem Revelio-Konto, und du kannst jederzeit wieder verknüpfen.",
      "unlinkBodyNamed": "Der Revelio-Bot antwortet dann nicht mehr auf /collection und /mydecks für {name}. Deine Decks und deine Sammlung bleiben in deinem Revelio-Konto, und du kannst jederzeit wieder verknüpfen.",
      "cancel": "Abbrechen",
      "confirmUnlink": "Discord trennen",
      "unavailable": "Discord-Verknüpfung ist auf dieser Instanz nicht eingerichtet.",
      "error": "Verknüpfen fehlgeschlagen. Bitte versuche es erneut.",
      "alreadyLinked": "Dieses Discord-Konto ist bereits mit einem anderen Revelio-Konto verknüpft.",
      "unverifiedDiscord": "Discord hat die E-Mail-Adresse dieses Kontos nicht bestätigt. Bestätige sie bei Discord und versuche es dann erneut.",
      "unlinkError": "Die Verknüpfung konnte nicht getrennt werden. Bitte versuche es erneut."
    },
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app
/usr/local/bin/npm test -w web -- src/components/__tests__/discord-mark.test.tsx src/lib/__tests__/message-key-parity.test.ts
```

Expected: 3 mark tests pass, parity passes. Parity failing means a key is in one catalog only.

- [ ] **Step 7: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/src/components/discord-mark.tsx app/web/src/components/__tests__/discord-mark.test.tsx app/web/src/app/globals.css app/web/messages/en.json app/web/messages/de.json
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(settings): add the Discord mark, brand colour and connections copy"
```

---

## Task 3: The provider row

**Files:**
- Modify: `app/web/src/components/settings/connections-pane.tsx`
- Modify: `app/web/src/app/[locale]/settings/connections/page.tsx`
- Test: `app/web/src/components/settings/__tests__/connections-pane.test.tsx`

**Interfaces:**
- Consumes: `DiscordMark` from `@/components/discord-mark`; `getDiscordAccountName` from `@/lib/server/discord-oauth`; `bg-brand-discord`; the message keys from Task 2.
- Produces: `ConnectionsPane` gains an optional prop `accountName?: string | null`. Optional so the existing tests that omit it keep compiling, and because the page passes `null` whenever the lookup failed.

This task changes only the markup. `onLink`, `onUnlink`, `ERROR_KEYS` and the `error` derivation stay exactly as they are - Task 4 is what touches `onUnlink`.

- [ ] **Step 1: Write the failing tests**

In `app/web/src/components/settings/__tests__/connections-pane.test.tsx`, add these tests after the existing `'shows the linked state and unlinks on request'` test:

```tsx
// The whole point of the rework: you can see which Discord account the bot
// answers for, not just that some account is attached.
it('names the linked Discord account', () => {
  renderWithIntl(<ConnectionsPane linked configured accountName="timonw" />)
  expect(screen.getByText('@timonw')).toBeInTheDocument()
  expect(screen.getByText(c.linked)).toBeInTheDocument()
})

// Discord being unreachable must cost the handle, not the pane.
it('keeps the linked badge when Discord did not give up a name', () => {
  renderWithIntl(<ConnectionsPane linked configured accountName={null} />)
  expect(screen.getByText(c.linked)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: c.unlink })).toBeInTheDocument()
  expect(screen.queryByText(/^@/)).not.toBeInTheDocument()
})

it('says so in the row when nothing is linked yet', () => {
  renderWithIntl(<ConnectionsPane linked={false} configured />)
  expect(screen.getByText(c.notLinked)).toBeInTheDocument()
})

// The row is the only place the bot's two commands are explained, in every
// state where linking is possible at all.
it.each([true, false])('explains what the link is for when linked=%s', (linked) => {
  renderWithIntl(<ConnectionsPane linked={linked} configured accountName="timonw" />)
  expect(screen.getByText(c.discordBody)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app
/usr/local/bin/npm test -w web -- src/components/settings/__tests__/connections-pane.test.tsx
```

Expected: the four new tests fail on `@timonw` / `c.notLinked` not being found. The nine existing tests still pass.

- [ ] **Step 3: Rewrite the render half of the pane**

In `app/web/src/components/settings/connections-pane.tsx`, add these imports:

```tsx
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { DiscordMark } from '@/components/discord-mark'
```

Change the component signature to accept the new prop:

```tsx
export function ConnectionsPane({
  linked,
  configured,
  accountName,
  linkError,
}: {
  linked: boolean
  configured: boolean
  accountName?: string | null
  linkError?: string
}) {
```

Then, after the existing `const error = ...` derivation, add the subline derivation and replace everything from `return (` to the end of the function with:

```tsx
  // The badge already says "Linked", so a nameless linked account gets no
  // subline rather than the same word twice.
  const subline = !configured ? null : linked ? (accountName ? `@${accountName}` : null) : t('notLinked')

  return (
    <section aria-labelledby="s-connections" className="rounded-xl border border-border bg-card p-5">
      <h2 id="s-connections" className="text-lg font-semibold">{t('title')}</h2>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">{t('lead')}</p>

      <div className="flex flex-wrap items-center gap-3.5 rounded-lg border border-border bg-muted/50 p-4">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-md bg-brand-discord text-white',
            !configured && 'opacity-50',
          )}
        >
          <DiscordMark className="size-6" />
        </span>

        <span className="flex min-w-0 flex-1 basis-40 flex-col">
          <strong className="text-sm font-semibold">{t('discordTitle')}</strong>
          {subline && <span className="truncate text-xs text-muted-foreground">{subline}</span>}
        </span>

        {!configured ? (
          <span className="flex-1 basis-48 text-xs text-muted-foreground">{t('unavailable')}</span>
        ) : linked ? (
          <span className="flex flex-wrap items-center gap-3">
            <Badge variant="outline" className="gap-1.5">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-chart-4" />
              {t('linked')}
            </Badge>
            <Button variant="outline" size="sm" disabled={pending} onClick={onUnlink}>
              {t('unlink')}
            </Button>
          </span>
        ) : (
          <Button size="sm" disabled={pending} onClick={onLink}>
            <DiscordMark />
            {t('link')}
          </Button>
        )}

        {configured && (
          <p className="basis-full border-t border-border pt-3 text-xs text-muted-foreground">
            {t('discordBody')}
          </p>
        )}
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  )
}
```

- [ ] **Step 4: Pass the name from the page**

Replace the body of `app/web/src/app/[locale]/settings/connections/page.tsx`'s default export with:

```tsx
  const user = await requireSettingsUser('/settings/connections')
  const [providers, { error }] = await Promise.all([
    getLinkedProviderIds(getDb(), user.id),
    searchParams,
  ])
  const linked = providers.includes('discord')
  // Sequential on purpose: there is no name to look up until we know a Discord
  // account is attached, and the lookup answers null rather than throwing.
  const accountName = linked ? await getDiscordAccountName(user.id) : null
  return (
    <ConnectionsPane
      linked={linked}
      configured={discordLinkingConfigured}
      accountName={accountName}
      linkError={typeof error === 'string' ? error : undefined}
    />
  )
```

and add the import:

```tsx
import { getDiscordAccountName } from '@/lib/server/discord-oauth'
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app
/usr/local/bin/npm test -w web -- src/components/settings/__tests__/connections-pane.test.tsx
/usr/local/bin/npm run typecheck
/usr/local/bin/npm run lint -w web
```

Expected: 13 tests pass, typecheck clean, lint clean.

- [ ] **Step 6: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/src/components/settings/connections-pane.tsx "app/web/src/app/[locale]/settings/connections/page.tsx" app/web/src/components/settings/__tests__/connections-pane.test.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(settings): render Discord as a provider row with the linked account"
```

---

## Task 4: Confirm before unlinking

**Files:**
- Modify: `app/web/src/components/settings/connections-pane.tsx`
- Test: `app/web/src/components/settings/__tests__/connections-pane.test.tsx`

**Interfaces:**
- Consumes: `AlertDialog` and friends from `@/components/ui/alert-dialog`; the `unlinkTitle`, `unlinkBody`, `unlinkBodyNamed`, `cancel`, `confirmUnlink` keys from Task 2.
- Produces: nothing new for other tasks. The row's **Unlink** button stops calling `unlinkDiscord` directly and opens the dialog instead.

The dialog closes on both outcomes, success and failure: the failure message renders in the pane's existing `role="alert"` line, which is behind the dialog while it is open.

- [ ] **Step 1: Rewrite the two existing unlink tests and add the confirmation tests**

In `app/web/src/components/settings/__tests__/connections-pane.test.tsx`, replace the existing `'shows the linked state and unlinks on request'` and `'reports a failed unlink instead of silently doing nothing'` tests with:

```tsx
// Unlinking goes through our own server action, not Better Auth's
// /unlink-account: that endpoint's fresh-session middleware answers 403 for any
// session older than a day, which is most of them.
it('unlinks once the dialog is confirmed', async () => {
  renderWithIntl(<ConnectionsPane linked configured accountName="timonw" />)
  await userEvent.click(screen.getByRole('button', { name: c.unlink }))
  await userEvent.click(screen.getByRole('button', { name: c.confirmUnlink }))
  expect(m.unlinkDiscord).toHaveBeenCalled()
  expect(m.refresh).toHaveBeenCalled()
})

// Unlinking also revokes the authorization at Discord, so it must not fire on
// a stray click at the row.
it('asks before touching the account', async () => {
  renderWithIntl(<ConnectionsPane linked configured accountName="timonw" />)
  await userEvent.click(screen.getByRole('button', { name: c.unlink }))
  expect(await screen.findByRole('alertdialog')).toHaveTextContent(c.unlinkTitle)
  expect(m.unlinkDiscord).not.toHaveBeenCalled()
})

it('names the account in the confirmation so it is clear which one goes', async () => {
  renderWithIntl(<ConnectionsPane linked configured accountName="timonw" />)
  await userEvent.click(screen.getByRole('button', { name: c.unlink }))
  expect(await screen.findByRole('alertdialog'))
    .toHaveTextContent(c.unlinkBodyNamed.replace('{name}', '@timonw'))
})

it('falls back to the nameless wording when the handle is unknown', async () => {
  renderWithIntl(<ConnectionsPane linked configured accountName={null} />)
  await userEvent.click(screen.getByRole('button', { name: c.unlink }))
  expect(await screen.findByRole('alertdialog')).toHaveTextContent(c.unlinkBody)
})

it('leaves the account alone when the dialog is cancelled', async () => {
  renderWithIntl(<ConnectionsPane linked configured accountName="timonw" />)
  await userEvent.click(screen.getByRole('button', { name: c.unlink }))
  await userEvent.click(screen.getByRole('button', { name: c.cancel }))
  expect(m.unlinkDiscord).not.toHaveBeenCalled()
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
})

// The error line lives in the pane, behind the dialog, so the dialog has to
// get out of the way for the message to be readable.
it('closes the dialog and reports a failed unlink instead of silently doing nothing', async () => {
  m.unlinkDiscord.mockResolvedValue({ ok: false, error: 'failed' })
  renderWithIntl(<ConnectionsPane linked configured accountName="timonw" />)
  await userEvent.click(screen.getByRole('button', { name: c.unlink }))
  await userEvent.click(screen.getByRole('button', { name: c.confirmUnlink }))
  expect(await screen.findByRole('alert')).toHaveTextContent(c.unlinkError)
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(m.refresh).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app
/usr/local/bin/npm test -w web -- src/components/settings/__tests__/connections-pane.test.tsx
```

Expected: the six replaced/new tests fail - there is no `alertdialog` role in the tree and no button named `c.confirmUnlink`, because **Unlink** still calls the action straight away.

- [ ] **Step 3: Add the dialog**

In `app/web/src/components/settings/connections-pane.tsx`, add the import:

```tsx
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
```

Add the open state next to the existing state:

```tsx
  const [confirming, setConfirming] = useState(false)
```

Replace `onUnlink` with a version that closes the dialog on either outcome:

```tsx
  function onUnlink() {
    start(async () => {
      setFailed(null)
      const res = await unlinkDiscord()
      // Closed either way: the failure line renders in the pane, which the
      // dialog would otherwise cover.
      setConfirming(false)
      if (!res.ok) {
        setFailed('unlinkError')
        return
      }
      // `linked` is server state, so the pane only flips once the page reloads.
      router.refresh()
    })
  }
```

Point the row's **Unlink** button at the dialog instead of the action:

```tsx
            <Button variant="outline" size="sm" disabled={pending} onClick={() => setConfirming(true)}>
              {t('unlink')}
            </Button>
```

Add the dialog between the `error` paragraph and the closing `</section>`. Plain `Button`s in the footer rather than `AlertDialogAction`/`AlertDialogCancel`, matching `delete-account-section.tsx`, because the component decides when it closes:

```tsx
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('unlinkTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {accountName ? t('unlinkBodyNamed', { name: `@${accountName}` }) : t('unlinkBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>
              {t('cancel')}
            </Button>
            <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={onUnlink}>
              {t('confirmUnlink')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app
/usr/local/bin/npm test -w web -- src/components/settings/__tests__/connections-pane.test.tsx
```

Expected: 17 tests pass. If `getByRole('button', { name: c.unlink })` becomes ambiguous, the German `unlink` ("Trennen") and `confirmUnlink` ("Discord trennen") are distinct strings and the English ones are too - an ambiguity means the dialog rendered its own trigger, which it should not.

- [ ] **Step 5: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/src/components/settings/connections-pane.tsx app/web/src/components/settings/__tests__/connections-pane.test.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(settings): confirm before unlinking a Discord account"
```

---

## Task 5: Verify and open the PR

**Files:** none changed unless verification finds something.

- [ ] **Step 1: Run the full web workspace**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app
/usr/local/bin/npm test -w web
/usr/local/bin/npm run typecheck
/usr/local/bin/npm run lint -w web
```

Expected: all green. Do not run a bare `npm test` - `@revelio/ingest`'s tests delete the local `cards-en`/`cards-de` Meilisearch indexes.

- [ ] **Step 2: Build, to prove the pane compiles in a production build**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app
/usr/local/bin/npm run build -w web
```

Expected: build succeeds. It needs the env vars in `web/.env.local`.

- [ ] **Step 3: Manual visual check**

There is no e2e sign-in helper - `e2e/settings.spec.ts` says so and covers only the auth gate, so signed-in settings pages are checked by hand in this repo. Serve the production build on a free port so the dev server can stay up:

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app/web
PORT=3100 /usr/local/bin/npm start
```

Then sign in and walk `/settings/connections` and `/de/settings/connections`:

- [ ] Unlinked: blurple tile, "Not linked", gold **Link Discord** carrying the mark, caption below the hairline.
- [ ] Linked: `@handle` under "Discord", "Linked" badge with the green dot, outline **Unlink**.
- [ ] **Unlink** opens the dialog; **Cancel** closes it and the row is unchanged.
- [ ] Confirm unlinks, the row flips to the unlinked state, and Revelio is gone from Discord's Authorized Apps.
- [ ] Re-link, then narrow the window to ~380px: badge and button wrap under the identity, nothing overflows sideways.
- [ ] Both themes: the blurple tile holds on parchment and on midnight, and the caption hairline is visible in both.
- [ ] German: no clipped strings in the row or the dialog ("Discord verknüpfen" is the longest).

- [ ] **Step 4: Push and open the PR**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git push -u origin feat/connections-pane-rework
/opt/homebrew/bin/gh pr create --title "feat(settings): rework the Connections pane" --body "$(cat <<'BODY'
## What

`/settings/connections` becomes a Discord provider row: the Discord mark on a blurple tile, the linked account's handle, a "Linked" badge, and a confirmation dialog in front of unlinking.

## Notes for review

- The handle is fetched from Discord at render through `auth.api.getAccessToken` (which decrypts and refreshes the stored token) rather than stored in a column that would go stale on a rename. Every failure path returns `null` and the row falls back to the plain badge.
- `Unlink` in the row stays an outline button; the destructive styling lands on the dialog's confirm, since unlinking is reversible. This is deliberately different from the Safety Zone's delete trigger.
- `--brand-discord` is the first theme-independent hex in `globals.css`, added because the value identifies Discord and must not shift between themes.
- No new database column and no migration.

## Verification

- `npm test -w web`, `npm run typecheck`, `npm run lint -w web`, `npm run build -w web` all pass.
- Signed-in states, both locales, both themes and a 380px viewport checked by hand against the plan's checklist (this repo has no e2e sign-in helper).
BODY
)"
```

- [ ] **Step 5: Report the PR URL**

---

## Self-Review

**Design coverage:** logo on the tile (Task 2 + 3), Discord name when linked (Tasks 1 + 3), unlink confirmation dialog (Task 4), unconfigured state preserved (Task 3), narrow-viewport wrap (Task 3, verified in Task 5), both locales (Task 2, verified in Task 5). All three things asked for in session are covered.

**Placeholders:** none. Every code step carries the code, every message key carries both translations, and the manual checklist names concrete observations rather than "check it looks right".

**Type consistency:** `getDiscordAccountName(userId: string): Promise<string | null>` is defined in Task 1 and consumed in Task 3 with exactly that signature. `accountName?: string | null` is the prop name in Task 3's component, Task 3's page, and Tasks 3 and 4's tests. `DiscordMark({ className }: { className?: string })` is defined in Task 2 and called in Task 3 both with (`size-6`) and without a class. The message keys added in Task 2 are the exact keys read in Tasks 3 and 4.
