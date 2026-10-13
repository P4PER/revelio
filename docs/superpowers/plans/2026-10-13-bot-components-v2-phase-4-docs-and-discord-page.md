# Bot Components V2, Phase 4: Docs and the `/discord` page - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make everything a visitor reads about the bot match what phases 1-3 shipped: the docs
pages, the `/discord` landing page (its command grid and its hand-drawn chat mock), the README,
and the one sentence in the terms of service that this work makes untrue.

**Architecture:** The command grid stops restating command structure and derives it from
`BOT_COMMANDS`, the manifest the bot is already tested against. The chat mock is redrawn as the
two V2 messages a channel actually sees: a `/card` reply and a shared result list. Prose is
rewritten in English and German with identical heading structure (the docs parity test checks it).

**Tech Stack:** Next.js 16, next-intl, MDX content under `app/web/content/docs`, Vitest +
Testing Library, Playwright (for the visual check).

**Spec:** `docs/superpowers/specs/2026-10-13-bot-components-v2-design.md`, section 9.

**Depends on:** phases 1-3 on this branch (`BOT_COMMANDS` already has `decks` and the `/search`
changes; `docs.commands.*` option notes already exist for both).

## Global Constraints

- Branch `feat/bot-components-v2`. Conventional Commits, scope `web` (or `docs`), signed with
  `git -c gpg.program=/opt/homebrew/bin/gpg commit`, no tool attribution.
- Commands run from `app/` with `/usr/local/bin/npm`.
- Every visitor-facing string comes from `web/messages/{en,de}.json` or the MDX content, never
  hardcoded in a component; both locales hold the same keys (`discord-i18n.test.ts`).
- English and German MDX pages keep the same headings at the same depths
  (`content-parity.test.ts`); the commands page keeps exactly one `<Callout>`
  (`content-render.test.tsx` uses `getByRole('note')`).
- German docs say "du", German legal text says "Sie" - keep each file's register.
- Card names in the mock are data and identical in both catalogs.
- Code comments ASCII only.
- **The terms of service are a legal document**: Task 5 stops for the user's go-ahead before it
  commits.

## Review Focus

- The grid must never again list an option the bot no longer registers (`page` on `/search`
  survived phase 2 there). Pinned in Task 1 by comparing against `BOT_COMMANDS`.
- Seven tiles (six commands and the reference tile) in a three-column grid leave one orphan; the
  reference tile must span its row instead of sitting alone. Pinned in Task 1 and checked by eye
  in Task 6.
- The mock must show the share list without a "used /search" line: it is a plain channel
  message, not an interaction reply. Pinned in Task 2.
- The privacy page must not keep claiming `/search` answers in the channel. Pinned in Task 3 by
  the rewritten text itself; checked in Task 6 by reading both locales.
- The German pages must keep the same headings as the English ones. Pinned by the existing
  parity test, run in every task that edits MDX.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `app/web/src/components/discord/command-grid.tsx` | modify | derive tiles from `BOT_COMMANDS`; reference tile spans its row |
| `app/web/src/components/discord/command-channel.tsx` | modify | redraw the mock as V2 messages |
| `app/web/public/discord/*-thumb.webp` | create | three card thumbs for the shared-list mock |
| `app/web/messages/{en,de}.json` | modify | `discord.commands.*`, `discord.sample.*`, `docs.sections.discord.summary` |
| `app/web/content/docs/discord{,-commands,-privacy,-troubleshooting}.{en,de}.mdx` | modify | prose |
| `app/web/content/legal/terms.{en,de}.mdx` | modify | section 9 (2), after the user's go-ahead |
| `README.md` | modify | the bot line |
| `app/web/src/components/discord/__tests__/*` | modify | follow the changes |

---

### Task 1: The command grid reads the manifest

**Files:**
- Modify: `app/web/src/components/discord/command-grid.tsx`
- Modify: `app/web/messages/{en,de}.json` (`discord.commands`)
- Test: `app/web/src/components/discord/__tests__/command-grid.test.tsx`, `discord-i18n.test.ts`

**Interfaces:**
- Consumes: `BOT_COMMANDS`, `type BotCommandName` from `@revelio/core`.

- [ ] **Step 1: Write the failing tests**

In `command-grid.test.tsx`, add `import { BOT_COMMANDS } from '@revelio/core'` and replace the
three affected cases:

```tsx
  it('lists every command the bot registers', () => {
    renderGrid()
    for (const command of BOT_COMMANDS) {
      expect(screen.getByText(`/${command.name}`, { selector: 'span' })).toBeInTheDocument()
    }
  })

  // The grid used to keep its own option list and kept showing /search's
  // removed page option. Structure comes from the manifest now.
  it('shows exactly the options the manifest declares', () => {
    renderGrid()
    for (const command of BOT_COMMANDS) {
      const tile = screen.getByText(`/${command.name}`, { selector: 'span' }).closest('li')!
      const chips = [...tile.querySelectorAll('code')].map((c) => c.textContent)
      expect(chips, command.name).toEqual(command.options.map((o) => o.name))
    }
  })

  it('marks every command that answers privately', () => {
    renderGrid()
    expect(screen.getAllByText('Only you see it')).toHaveLength(BOT_COMMANDS.filter((c) => c.ephemeral).length)
  })

  // Six commands fill two rows of three; the reference tile takes the third
  // row whole instead of sitting in it alone.
  it('lets the reference tile span its row', () => {
    renderGrid('/docs/discord')
    const tile = screen.getByRole('link', { name: /Full reference/i }).closest('li')!
    expect(tile.className).toMatch(/col-span-full/)
  })
```

(Delete `lists all five commands` and `marks exactly the two personal commands as private`.)

In `discord-i18n.test.ts`, replace `describes all five commands in both locales` with:

```ts
  it('describes every command in both locales', () => {
    for (const messages of [en, de]) {
      for (const { name } of BOT_COMMANDS) {
        expect((messages.discord.commands as Record<string, { description: string }>)[name]?.description, name).toBeTruthy()
      }
    }
  })
```

with `import { BOT_COMMANDS } from '@revelio/core'`.

Run: `/usr/local/bin/npm test -w web -- src/components/discord`
Expected: FAIL (no `/decks` tile, `page` chip on `/search`, no `decks` description, tile not spanning).

- [ ] **Step 2: Update the copy**

`web/messages/en.json`, `discord.commands`:

```json
      "search": {
        "description": "The site's search, privately: page through, filter, open a card, then share the ones you mean."
      },
      "deck": {
        "description": "Any deck you can see, found by name, link or id, as a picture of its cards or as a text list."
      },
      "decks": {
        "description": "Browse public decks by name, author, format or lesson, open one as a picture, and post it."
      },
      "mydecks": {
        "description": "Your decks, public and private, to page through, open and post."
      }
```

`web/messages/de.json`, same keys:

```json
      "search": {
        "description": "Die Suche der Website, privat: blättern, filtern, eine Karte öffnen und dann die passenden teilen."
      },
      "deck": {
        "description": "Jedes Deck, das du sehen darfst, per Name, Link oder ID - als Bild seiner Karten oder als Textliste."
      },
      "decks": {
        "description": "Öffentliche Decks nach Name, Autor, Format oder Lektion durchsuchen, eins als Bild öffnen und posten."
      },
      "mydecks": {
        "description": "Deine Decks, öffentlich und privat, zum Durchblättern, Öffnen und Posten."
      }
```

(`card` and `collection` keep their descriptions.)

- [ ] **Step 3: Derive the grid from the manifest**

In `command-grid.tsx`, replace `CommandKey`, `Command` and `COMMANDS` with:

```tsx
import { BOT_COMMANDS, type BotCommandName, type BotCommandSpec } from '@revelio/core'

// Display order only - most-used first. Everything else about a command (its
// options, whether only the caller sees the answer) comes from BOT_COMMANDS,
// which bot/test/command-manifest.test.ts holds to what the bot registers. The
// grid used to keep its own copy and kept showing an option the bot had dropped.
const ORDER: readonly BotCommandName[] = ['card', 'search', 'deck', 'decks', 'collection', 'mydecks']

const COMMANDS: readonly BotCommandSpec[] = ORDER.flatMap((name) => BOT_COMMANDS.filter((c) => c.name === name))
```

`CommandCard` takes `{ command }: { command: BotCommandSpec }`, renders
`command.options.map((option) => <CommandCode key={option.name}>{option.name}</CommandCode>)`,
and shows the tag when `command.ephemeral`. Update its comment: "`ephemeral` drives the 'only you
see it' tag: those commands defer ephemerally in the bot, and command-manifest.test.ts checks it."

`ReferenceTile`'s `<li>` gets `className="col-span-full"` and its link a row layout from `sm` up:

```tsx
    <li className="col-span-full">
      <Link
        href={href}
        className="flex h-full flex-col justify-center gap-1.5 rounded-xl border border-dashed border-primary/50 bg-card p-4 transition-colors hover:bg-accent/40 sm:flex-row sm:items-center sm:gap-4"
      >
```

and its doc comment's last sentence becomes: "Six command tiles fill two rows of three, so the
tile spans the row below them rather than sitting in it alone; passing no `docsHref` drops it
and the six still fill their rows."

- [ ] **Step 4: Run the tests**

Run: `/usr/local/bin/npm test -w web -- src/components/discord && /usr/local/bin/npm run lint -w web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/web/src/components/discord app/web/messages
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): derive the discord command grid from the bot manifest"
```

---

### Task 2: Redraw the chat mock as V2 messages

**Files:**
- Modify: `app/web/src/components/discord/command-channel.tsx`
- Create: `app/web/public/discord/obliviate-thumb.webp`, `incendio-thumb.webp`, `confundus-thumb.webp`
- Modify: `app/web/messages/{en,de}.json` (`discord.sample`)
- Test: `app/web/src/components/discord/__tests__/command-channel.test.tsx`

**Interfaces:**
- Mirrors: `bot/src/discord/v2/card-view.ts` and `bot/src/discord/v2/share-view.ts`.

- [ ] **Step 1: Fetch the three thumbnails**

The three cards (checked against the local database on 2026-10-13, all Base Set Charms spells):
`bs-14-obliviate`, `bs-25-incendio`, `bs-47-confundus`. With the local stack up
(`docker compose up -d` from `app/`), read each card's `imageVersion` from Meilisearch:

```bash
curl -fsS "http://localhost:7700/indexes/cards-en/search" -H "Authorization: Bearer $MEILI_SEARCH_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"q":"","filter":"id IN [\"bs-14-obliviate\",\"bs-25-incendio\",\"bs-47-confundus\"]","attributesToRetrieve":["id","imageVersion"]}'
```

then fetch each thumb (`NEXT_PUBLIC_IMAGE_BASE_URL` and `MEILI_SEARCH_KEY` from `app/web/.env.local`):

```bash
curl -fsS "$NEXT_PUBLIC_IMAGE_BASE_URL/cards/thumb/bs-14-obliviate.<imageVersion>.webp" -o app/web/public/discord/obliviate-thumb.webp
curl -fsS "$NEXT_PUBLIC_IMAGE_BASE_URL/cards/thumb/bs-25-incendio.<imageVersion>.webp" -o app/web/public/discord/incendio-thumb.webp
curl -fsS "$NEXT_PUBLIC_IMAGE_BASE_URL/cards/thumb/bs-47-confundus.<imageVersion>.webp" -o app/web/public/discord/confundus-thumb.webp
```

with each card's own `imageVersion` from the first call. Each file should be well under 40 KB
(`ls -l app/web/public/discord`); open one to check it is the card face.

- [ ] **Step 2: Replace the sample copy**

`discord.sample` in `en.json` becomes:

```json
    "sample": {
      "cardName": "Alohomora",
      "cardStats": "Spell · Charms · Cost 4",
      "cardText": "Search your deck. You may take a Location or Adventure card from your deck, show it to your opponent and put it into your hand. Then shuffle your deck.",
      "cardFooter": "Adventures at Hogwarts · #32",
      "openSite": "Open on revelio.cards",
      "shareLead": "<mention>@{userName}</mention> shared 3 cards from a search for \"{query}\".",
      "shareQuery": "charm",
      "rowStats": "Spell · Charms · Cost {cost}",
      "viewCard": "View a card...",
      "fullSearch": "Full search on revelio.cards",
      "typing": "set: Chamber of Secrets"
    }
```

`de.json`:

```json
    "sample": {
      "cardName": "Alohomora",
      "cardStats": "Zauber · Zauberkunst · Kosten 4",
      "cardText": "Durchsuche dein Deck. Du darfst eine Ort- oder Abenteuerkarte aus deinem Deck nehmen, sie deinem Gegner zeigen und auf deine Hand nehmen. Mische danach dein Deck.",
      "cardFooter": "Adventures at Hogwarts · #32",
      "openSite": "Auf revelio.cards öffnen",
      "shareLead": "<mention>@{userName}</mention> hat 3 Karten aus einer Suche nach „{query}“ geteilt.",
      "shareQuery": "charm",
      "rowStats": "Zauber · Zauberkunst · Kosten {cost}",
      "viewCard": "Karte ansehen ...",
      "fullSearch": "Ganze Suche auf revelio.cards",
      "typing": "set: Kammer des Schreckens"
    }
```

(These mirror the bot's own `card.stat.cost`, `card.footer`, `card.openSite`,
`post.sharedCards.query`, `share.view.placeholder` and `share.site`.)

- [ ] **Step 3: Write the failing tests**

Replace `command-channel.test.tsx`'s cases with:

```tsx
describe('CommandChannel', () => {
  it('shows the /card reply as card-view.ts builds it', () => {
    renderChannel('en', en)
    expect(screen.getByRole('heading', { name: 'Alohomora' })).toBeInTheDocument()
    expect(screen.getByText('Spell · Charms · Cost 4')).toBeInTheDocument()
    expect(screen.getByText('Adventures at Hogwarts · #32')).toBeInTheDocument()
    expect(screen.getByText('Open on revelio.cards')).toBeInTheDocument()
  })

  // card-view.ts: heading and stats, then the image, then the rules text, then
  // the footer line and the link button.
  it('orders the card as the bot does: image under the stats, above the text', () => {
    renderChannel('en', en)
    const stats = screen.getByText('Spell · Charms · Cost 4')
    const art = screen.getByAltText('Alohomora card')
    const body = screen.getByText(/Search your deck/)
    const footer = screen.getByText('Adventures at Hogwarts · #32')
    const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(stats, art)).toBe(true)
    expect(follows(art, body)).toBe(true)
    expect(follows(body, footer)).toBe(true)
  })

  // A shared list is a plain channel message: no "used /search" line above it.
  it('shows a shared result list with thumbnails and no command line', () => {
    renderChannel('en', en)
    expect(screen.getByText(/shared 3 cards from a search for "charm"/)).toBeInTheDocument()
    expect(screen.getByAltText('Obliviate card')).toBeInTheDocument()
    expect(screen.getByText('View a card...')).toBeInTheDocument()
    expect(screen.getByText('Full search on revelio.cards')).toBeInTheDocument()
    expect(screen.queryByText('/search')).not.toBeInTheDocument()
  })

  it('translates the chrome but keeps the card names', () => {
    renderChannel('de', de)
    expect(screen.getByText(/hat 3 Karten aus einer Suche nach „charm“ geteilt/)).toBeInTheDocument()
    expect(screen.getByText('Obliviate')).toBeInTheDocument()
    expect(screen.queryByText('View a card...')).not.toBeInTheDocument()
  })

  it('localizes the card art alt text in German', () => {
    renderChannel('de', de)
    expect(screen.getByAltText('Karte Alohomora')).toBeInTheDocument()
  })
})
```

Run: `/usr/local/bin/npm test -w web -- src/components/discord/__tests__/command-channel.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Redraw the component**

In `command-channel.tsx`:

1. Rewrite the header comment's checklist against the V2 builders:

```tsx
/*
 * A hand-built rendering of what bot/src/discord/v2/card-view.ts and
 * share-view.ts actually produce. It is markup rather than a screenshot so it
 * stays sharp at any width, works in both locales and costs a few small images
 * instead of a large one. The trade is that it is only as true as this comment
 * keeps it. When those builders change, change this:
 *   - every message is one container; its accent bar is the LESSON colour for a
 *     card (Charms is #0069A9) and BRAND_GOLD (#d4a83a) for a shared list
 *   - the card is: "## name" + stats line, the image, the rules text, the
 *     footer line "{setName} · #{number}" in small muted text, a link button
 *   - a shared list is a plain channel message, so it has no "used /search"
 *     line; it opens with "@user shared N cards from a search for ...", then one
 *     row per card with its thumbnail on the right, a "View a card" menu and a
 *     link button
 *
 * The colours below are Discord's own surface palette, deliberately hardcoded
 * rather than taken from the Revelio theme tokens: this depicts Discord's UI,
 * which does not follow the visitor's light/dark choice.
 */
```

2. Replace `SearchLine`/`SEARCH_LINES` with the rows from Step 1:

```tsx
type ShareRow = { name: string; setCode: string; number: string; cost: number; thumb: string }

// Card names and printings are data, not copy: they read the same in both
// catalogs. All three are Base Set Charms spells; set, number and cost are the
// real ones.
const SHARE_ROWS: readonly ShareRow[] = [
  { name: 'Obliviate', setCode: 'BS', number: '14', cost: 12, thumb: '/discord/obliviate-thumb.webp' },
  { name: 'Incendio', setCode: 'BS', number: '25', cost: 3, thumb: '/discord/incendio-thumb.webp' },
  { name: 'Confundus', setCode: 'BS', number: '47', cost: 5, thumb: '/discord/confundus-thumb.webp' },
]
```

3. Rename `Embed` to `Container` (same markup: a rounded box with the accent bar), delete
   `EmbedField`, and add two small presentational pieces next to it:

```tsx
// Discord's grey link button, with the external-link glyph it draws.
function LinkButton({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded px-3 py-1 text-[0.78rem] font-medium"
      style={{ background: DISCORD_BUTTON, color: DISCORD_HEADING }}
    >
      {children}
      <ExternalLink className="size-3" aria-hidden />
    </span>
  )
}

// A string select, closed: its placeholder and the chevron.
function SelectMenu({ placeholder }: { placeholder: string }) {
  return (
    <span
      className="flex items-center justify-between rounded px-3 py-1.5 text-[0.78rem]"
      style={{ background: DISCORD_SELECT, color: DISCORD_MUTED }}
    >
      {placeholder}
      <ChevronDown className="size-4" aria-hidden />
    </span>
  )
}
```

with `import { ChevronDown, ExternalLink } from 'lucide-react'` and two constants beside the
others: `const DISCORD_BUTTON = '#4e5058'` and `const DISCORD_SELECT = '#1e1f22'`.

4. The `/card` message body becomes:

```tsx
          <Container accent={LESSON_CHARMS}>
            <h3 className="text-base font-bold" style={{ color: DISCORD_HEADING }}>
              {t('sample.cardName')}
            </h3>
            <p className="mb-2 text-[0.8rem]">{t('sample.cardStats')}</p>
            <Image
              src={SAMPLE_CARD_THUMB}
              alt={t('cardImageAlt', { name: t('sample.cardName') })}
              width={300}
              height={419}
              className="mb-2 h-auto w-40 rounded"
            />
            <p className="mb-2 text-[0.8rem]">{t('sample.cardText')}</p>
            <p className="mb-2 text-[0.69rem]" style={{ color: DISCORD_MUTED }}>
              {t('sample.cardFooter')}
            </p>
            <LinkButton>{t('sample.openSite')}</LinkButton>
          </Container>
```

5. The second message (still hidden below `sm`) drops its `<CommandContext command="/search" />`
   and becomes:

```tsx
          <BotMessage time="21:05">
            <Container accent={BRAND_GOLD}>
              <p className="mb-2 text-[0.8rem]">
                {t.rich('sample.shareLead', {
                  userName: t('you'),
                  query: t('sample.shareQuery'),
                  mention: (chunks) => (
                    <span className="rounded-sm px-0.5" style={{ background: '#3f4270', color: DISCORD_MENTION }}>
                      {chunks}
                    </span>
                  ),
                })}
              </p>
              <ul className="mb-2 flex flex-col gap-2">
                {SHARE_ROWS.map((row) => (
                  <li key={row.name} className="flex items-center justify-between gap-3">
                    <span className="text-[0.8rem]">
                      <b style={{ color: DISCORD_HEADING }}>{row.name}</b> &middot; {row.setCode} #{row.number}
                      <br />
                      {t('sample.rowStats', { cost: row.cost })}
                    </span>
                    <Image
                      src={row.thumb}
                      alt={t('cardImageAlt', { name: row.name })}
                      width={300}
                      height={419}
                      className="h-auto w-10 shrink-0 rounded-sm"
                    />
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-2">
                <SelectMenu placeholder={t('sample.viewCard')} />
                <span>
                  <LinkButton>{t('sample.fullSearch')}</LinkButton>
                </span>
              </div>
            </Container>
          </BotMessage>
```

Remove the now-unused `DISCORD_LINK` constant if nothing else reads it.

- [ ] **Step 5: Run the tests and lint**

Run: `/usr/local/bin/npm test -w web -- src/components/discord && /usr/local/bin/npm run lint -w web`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/web/src/components/discord/command-channel.tsx app/web/src/components/discord/__tests__ app/web/public/discord app/web/messages
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): redraw the discord page's chat as components v2 messages"
```

---

### Task 3: The docs pages

**Files:**
- Modify: `app/web/content/docs/discord-commands.{en,de}.mdx`, `discord-privacy.{en,de}.mdx`,
  `discord-troubleshooting.{en,de}.mdx`, `discord.{en,de}.mdx`
- Modify: `app/web/messages/{en,de}.json` (`docs.sections.discord.summary`)
- Test: `app/web/src/lib/docs/__tests__/*` (existing)

- [ ] **Step 1: The commands page**

`discord-commands.en.mdx`:

- First line: "Five slash commands" -> "Six slash commands".
- Replace the `## Search` section's prose (keep its `<CommandTable name="search" />`) with:

```mdx
## Search

The same search the site runs, answered privately: only you see the results
until you decide to share some. Five cards to a page, each with its art, and
buttons to page through them. Lesson, card type and set can be changed on the
reply itself, without typing the command again, and filters combine. Leave out
the search terms and the filters alone browse a lesson, a type or a set.

Pick a card from the menu to open it in place, with everything `/card` shows
and a button back to the results. **Post to channel** puts that one card in the
channel. **Share** asks which cards of the page to post, all of them ticked to
start with; the channel gets them as a list that names you, with a menu anyone
can use to open one of the cards - privately, for whoever picked it.
```

  and change its example to `<CommandExample>/search query:lumos lesson:Charms</CommandExample>`
  plus `<CommandExample>/search set:Chamber of Secrets type:Spell</CommandExample>`.
- After the `## Deck lookup` section, add:

```mdx
## Browse decks

Every public deck, privately, five to a page with the starting character's art,
most liked first. The menus on the reply change the format, the order and the
lesson. Search by deck name, or start with `@` to search by author. Open a deck
to see it as a picture of its cards; **Post to channel** shares it, naming you.

<CommandTable name="decks" />

<CommandExample>/decks query:aggro format:Classic</CommandExample>

<CommandExample>/decks query:@hermione sort:Newest</CommandExample>
```

- In `## Your own data`, add after the first paragraph:

```mdx
`/mydecks` lists ten decks to a page, your private ones marked with a lock, and
opens any of them the same way `/decks` does. Posting one of your private decks
to the channel is your choice to make, with its button; nothing else does it.
```

`discord-commands.de.mdx`, the same changes:

- "Fünf Slash-Befehle" -> "Sechs Slash-Befehle".
- `## Suche`:

```mdx
## Suche

Dieselbe Suche wie auf der Website, aber privat beantwortet: Nur du siehst die
Ergebnisse, bis du entscheidest, welche du teilst. Fünf Karten pro Seite, jede
mit ihrem Artwork, und Buttons zum Blättern. Lektion, Kartentyp und Set lassen
sich direkt in der Antwort ändern, ohne den Befehl neu zu tippen, und Filter
lassen sich kombinieren. Lässt du die Suchbegriffe weg, durchsuchen die Filter
allein eine Lektion, einen Kartentyp oder ein Set.

Wähl eine Karte aus dem Menü, um sie an Ort und Stelle zu öffnen - mit allem, was
`/card` zeigt, und einem Button zurück zu den Ergebnissen. **Im Kanal posten**
stellt diese eine Karte in den Kanal. **Teilen** fragt, welche Karten der Seite
gepostet werden sollen; zu Beginn sind alle ausgewählt. Der Kanal bekommt sie als
Liste mit deinem Namen und einem Menü, über das alle eine der Karten öffnen
können - privat, nur für die Person, die sie gewählt hat.
```

  examples: `/search query:lumos lesson:Zauberkunst` and
  `/search set:Kammer des Schreckens type:Zauber`.
- After `## Deck nachschlagen`:

```mdx
## Decks durchsuchen

Alle öffentlichen Decks, privat für dich, fünf pro Seite mit dem Artwork des
Startcharakters, die beliebtesten zuerst. Die Menüs in der Antwort ändern Format,
Reihenfolge und Lektion. Such nach dem Decknamen, oder beginne mit `@`, um nach
Autor zu suchen. Öffne ein Deck, um es als Bild seiner Karten zu sehen; **Im
Kanal posten** teilt es mit deinem Namen.

<CommandTable name="decks" />

<CommandExample>/decks query:aggro format:Classic</CommandExample>

<CommandExample>/decks query:@hermione sort:Neueste</CommandExample>
```

- `## Deine eigenen Daten`, after the first paragraph:

```mdx
`/mydecks` zeigt zehn Decks pro Seite, deine privaten mit einem Schloss markiert,
und öffnet jedes davon so wie `/decks`. Ob eines deiner privaten Decks im Kanal
landet, entscheidest du selbst mit seinem Button; sonst passiert das nie.
```

- [ ] **Step 2: The privacy page**

`discord-privacy.en.mdx`, `## Where answers appear` becomes:

```mdx
## Where answers appear

`/card` and `/deck` answer in the channel, visibly to everyone. They are about
the game, not about you.

`/search` and `/decks` answer privately. You browse, filter and open cards or
decks where only you can see them, and the channel only gets what you post or
share yourself - with your name on it.

The one exception to `/deck` answering in the channel is your own private deck.
`/deck` first asks you, privately, whether to post it to the channel or show it
only to you, and nothing reaches the channel until you choose. The deck browsers
work the same way: a private deck of yours is only posted when you press its
**Post to channel** button.

`/collection` and `/mydecks` answer privately - only you see the reply, even in a
busy channel. That is decided before the command does any work at all, so there
is no path where a slow query or an error turns a private answer into a public
one.

That is also why `/mydecks` lists your private decks alongside your public ones:
nobody else is reading it.
```

(keep the `<Callout>` that follows). `## Limits you may notice` becomes:

```mdx
## Limits you may notice

Search totals are estimates. The result count the search engine reports
over-counts, so the last page of a long result set can be past the end of the
real results. The bot says so on that page, with **Previous** still there - go
back a page.

Long answers are cut, not risked. Discord rejects an oversized message outright
and fails the whole command, so the bot trims first: a message holds at most 40
parts (text blocks, images, buttons, menus) and about 4,000 characters of text,
so a long deck list ends with how many cards it left out rather than stopping
silently.

Card art is the 300-pixel thumbnail, not the full-size scan. It is sharp at the
size Discord displays it, and it keeps the reply quick. Every card but a spell is
printed landscape, and the bot turns those so they read upright. The card page on
revelio.cards - always one click away - has the full image.

The buttons and menus on a reply keep working as long as Discord shows you the
message; a private one disappears when you dismiss it or reload Discord.
```

`discord-privacy.de.mdx`, `## Wo die Antworten erscheinen`:

```mdx
## Wo die Antworten erscheinen

`/card` und `/deck` antworten im Kanal, sichtbar für alle. Es geht dabei um das
Spiel, nicht um dich.

`/search` und `/decks` antworten privat. Du blätterst, filterst und öffnest Karten
oder Decks dort, wo nur du sie siehst, und in den Kanal kommt nur, was du selbst
postest oder teilst - mit deinem Namen daran.

Die eine Ausnahme davon, dass `/deck` im Kanal antwortet, ist dein eigenes
privates Deck. `/deck` fragt dich zuerst privat, ob es im Kanal gepostet oder nur
dir gezeigt werden soll, und im Kanal erscheint nichts, bevor du dich entschieden
hast. Die Deck-Übersichten funktionieren genauso: Ein privates Deck von dir wird
nur gepostet, wenn du seinen Button **Im Kanal posten** drückst.

`/collection` und `/mydecks` antworten privat - nur du siehst die Antwort, auch
in einem vollen Kanal. Das wird entschieden, bevor der Befehl überhaupt etwas
tut. Es gibt also keinen Weg, auf dem eine langsame Abfrage oder ein Fehler aus
einer privaten Antwort eine öffentliche macht.

Genau deshalb listet `/mydecks` deine privaten Decks neben den öffentlichen auf:
Niemand sonst liest mit.
```

`## Grenzen, die dir begegnen`:

```mdx
## Grenzen, die dir begegnen

Suchergebniszahlen sind Schätzungen. Die Trefferzahl, die die Suchmaschine
meldet, fällt zu hoch aus. Die letzte Seite eines langen Ergebnissatzes kann
deshalb hinter dem Ende der echten Ergebnisse liegen. Der Bot sagt das auf dieser
Seite, und **Zurück** ist weiter da - geh eine Seite zurück.

Lange Antworten werden gekürzt, nicht riskiert. Discord weist eine zu große
Nachricht rundheraus ab und lässt den ganzen Befehl scheitern. Deshalb kürzt der
Bot vorher: Eine Nachricht hat höchstens 40 Teile (Textblöcke, Bilder, Buttons,
Menüs) und etwa 4.000 Zeichen Text. Eine lange Deckliste endet deshalb mit der
Zahl der weggelassenen Karten, statt stillschweigend aufzuhören.

Das Artwork ist die 300-Pixel-Vorschau, nicht der Scan in voller Größe. In der
Größe, in der Discord es zeigt, ist es scharf, und die Antwort bleibt schnell.
Jede Karte außer einem Zauber ist im Querformat gedruckt, und der Bot dreht diese,
damit sie aufrecht lesbar sind. Die Kartenseite auf revelio.cards - immer einen
Klick entfernt - zeigt das ganze Bild.

Die Buttons und Menüs einer Antwort funktionieren, solange Discord dir die
Nachricht zeigt; eine private verschwindet, wenn du sie schließt oder Discord neu
lädst.
```

- [ ] **Step 3: Troubleshooting and overview**

`discord-troubleshooting.en.mdx`:

- In `## "I can't post in this channel"`, change the first sentence to "**Post publicly**,
  **Post to channel** and **Share** send a normal message in the channel, so the bot needs to be
  allowed to: view the channel, send messages (or send messages in threads, inside a thread) and
  embed links, and attach files for a deck." Keep the rest; in the last paragraph change "Run
  `/deck` again and choose **Only show me**." to "Everything you looked at privately still
  works; only posting does not."
- Replace `## A page of results is empty` with:

```mdx
## A page of results is empty

Page forward through `/search` or `/decks` and the last page may say there are
no more results, even though the count at the top suggested more.

That is the result count being an estimate. The search engine reports an
approximate total, which runs high, so the page count derived from it is an upper
bound rather than a promise. Press **Previous**: the results up to there are real.

## The buttons say the results are out of date

A reply's buttons and menus carry what you were looking at. After an update to
the bot changes how they do that, older replies answer "These results are out of
date". Run the command again; the new reply works as before.
```

`discord-troubleshooting.de.mdx`, the same:

- "**Öffentlich posten**, **Im Kanal posten** und **Teilen** schicken eine normale Nachricht in
  den Kanal, also muss der Bot das dürfen: den Kanal sehen, Nachrichten senden (in einem Thread:
  Nachrichten in Threads senden) und Links einbetten, und für ein Deck Dateien anhängen." Last
  paragraph: "Führe `/deck` erneut aus und wähle **Nur mir zeigen**." -> "Alles, was du dir privat
  angesehen hast, funktioniert weiter; nur das Posten nicht."
- Replace `## Eine Ergebnisseite ist leer` with:

```mdx
## Eine Ergebnisseite ist leer

Blätterst du in `/search` oder `/decks` vor, kann die letzte Seite sagen, dass es
keine weiteren Ergebnisse gibt - obwohl die Zahl oben mehr nahegelegt hat.

Das liegt daran, dass diese Trefferzahl eine Schätzung ist. Die Suchmaschine
meldet eine ungefähre Gesamtzahl, die zu hoch ausfällt, und die daraus
abgeleitete Seitenzahl ist deshalb eine Obergrenze, keine Zusage. Drück
**Zurück**: Die Ergebnisse bis dorthin sind echt.

## Die Buttons sagen, die Ergebnisse seien veraltet

Die Buttons und Menüs einer Antwort tragen mit, was du dir gerade ansiehst. Ändert
ein Update des Bots, wie sie das tun, antworten ältere Antworten mit "Diese
Ergebnisse sind veraltet". Führe den Befehl erneut aus; die neue Antwort
funktioniert wie gewohnt.
```

`discord.en.mdx`: "can use `/card`, `/search` and `/deck` straight away." -> "can use `/card`,
`/search`, `/deck` and `/decks` straight away." `discord.de.mdx`: "kann `/card`, `/search` und
`/deck` sofort benutzen." -> "kann `/card`, `/search`, `/deck` und `/decks` sofort benutzen."

`messages/en.json` `docs.sections.discord.summary`: "Six slash commands for card, deck and
collection lookups inside Discord." `de.json`: "Sechs Slash-Befehle für Karten-, Deck- und
Sammlungsabfragen direkt in Discord."

- [ ] **Step 4: Run the docs tests**

Run: `/usr/local/bin/npm test -w web -- src/lib/docs src/components/docs src/app`
Expected: PASS (`content-parity` holds: both locales gained the same two headings).

- [ ] **Step 5: Commit**

```bash
git add app/web/content/docs app/web/messages
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "docs(web): describe search browsing, sharing and /decks in the bot docs"
```

---

### Task 4: The README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the bot line**

`README.md`, the `@revelio/bot` bullet:

```markdown
- **`@revelio/bot`** — a Discord bot (`/card`, `/search`, `/deck`, `/decks`,
  `/collection`, `/mydecks`) built on discord.js. It reads Meilisearch and
  Postgres directly, with no HTTP API between it and the web app, and never
  writes.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "docs: list every bot command in the readme"
```

---

### Task 5: The terms of service (needs the user's go-ahead)

**Files:**
- Modify: `app/web/content/legal/terms.en.mdx`, `app/web/content/legal/terms.de.mdx`

Section 9 (2) says "Replies to /card, /search and /deck are visible to everyone in the channel",
which `/search` no longer does, and it does not mention `/decks` or sharing.

- [ ] **Step 1: Ask before editing**

Show the user the proposed text below and ask: (a) whether to change the terms in this PR, and
(b) whether the change needs a new effective date (the terms page renders one from its
frontmatter). Do not commit this task without a yes; if the answer is "not in this PR", skip to
Task 6 and list it under "Notes for review" in the PR.

Proposed `terms.en.mdx` 9 (2):

```mdx
(2) Replies to /card and /deck are visible to everyone in the channel. Replies to
/search and /decks are visible only to you until you post or share something from
them; what you post or share is visible to everyone in the channel and names you.
Replies to /collection and /mydecks show your own data and are visible only to you.
```

Proposed `terms.de.mdx` 9 (2):

```mdx
(2) Antworten auf /card und /deck sind für alle im Kanal sichtbar. Antworten auf
/search und /decks sind nur für Sie sichtbar, bis Sie daraus etwas posten oder
teilen; was Sie posten oder teilen, ist für alle im Kanal sichtbar und nennt Ihren
Namen. Antworten auf /collection und /mydecks zeigen Ihre eigenen Daten und sind
nur für Sie sichtbar.
```

- [ ] **Step 2: Apply, check, commit (only after a yes)**

Apply the text (and the effective date, if the user asked for one), then run
`/usr/local/bin/npm test -w web -- src/app` and commit:

```bash
git add app/web/content/legal
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "docs(web): say in the terms which bot replies are private"
```

---

### Task 6: Verify

- [ ] **Step 1: Run the whole check suite**

From `app/`:
```bash
/usr/local/bin/npm test -w web
/usr/local/bin/npm test -w @revelio/bot
/usr/local/bin/npm run typecheck
/usr/local/bin/npm run lint
/usr/local/bin/npm run build -w web
```
Expected: all green; record the web and bot test counts for the PR.

- [ ] **Step 2: Look at the page**

Start the dev server (`/usr/local/bin/npm run dev -w web`) and screenshot `/discord` and
`/de/discord` at 390 px and 1280 px wide, light and dark, with the repo's Playwright chromium
(import it by absolute path; there is no system Chrome). Check by eye:

- six command tiles in two rows of three, the reference tile spanning the row below;
- `/search` shows `query`, `lesson`, `type`, `set` and the private tag; `/decks` is present;
- the card mock reads top to bottom: heading, stats, art, text, footer, button;
- the shared list (from `sm` up) has three thumbnails on the right and no "used /search" line;
- the German page has no English chrome left.

Then open `/docs/discord/commands`, `/docs/discord/privacy` and
`/docs/discord/troubleshooting` in both locales and read the changed sections through once.

Attach the screenshots to the PR.

- [ ] **Step 3: Open the PR**

Title `feat(bot): browse cards and decks in discord with components v2`. Body: prose first, then
`## What changed` (one paragraph per phase), `## Verification` (every command above with its real
result, the by-hand checks of each phase, the probe findings), `## Deployment` (no env vars, no
migration, no ingest; commands re-register on boot, `/search` loses `page` and `/decks` appears,
global propagation can take up to an hour), `## Notes for review` (the terms change or its
deferral, the accepted trade-offs from the spec), and links to the spec and the four plans.
Push and open it with `gh pr create`; never `--admin` merge.
