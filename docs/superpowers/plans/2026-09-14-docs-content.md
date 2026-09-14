# Docs Content Implementation Plan (Phase 4 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder pages with the real Discord bot reference in both languages, rendering the command tables from `BOT_COMMANDS` so they cannot drift, and put the docs into `/llms.txt` and the sitemap.

**Architecture:** `<CommandTable name="search" />` reads the `@revelio/core` manifest for *structure* and the `docs.commands` message namespace for *prose*, so a new option is a failing test rather than a silently missing row. Content files stay body-only MDX, one per slug per locale, and a structural parity test asserts both locales carry the same heading shape.

**Tech Stack:** MDX, React 19.2, next-intl 4, Tailwind v4, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-14-docs-section-design.md`

**Depends on:** Phase 1 (`2026-09-14-docs-pipeline.md`), phase 2 (`2026-09-14-bot-commands-manifest.md`) and phase 3 (`2026-09-14-docs-shell.md`) must all be merged. This is the first phase that needs phase 2.

## Global Constraints

- **Run every command from `app/`.** On this machine use `/usr/local/bin/npm` and `/opt/homebrew/bin/gpg`.
- **Conventional Commits**, `type(scope): subject`. Scope is `web` or `docs`. **No tool attribution.** **Branch first.**
- `type` aliases, never `interface`. Type-only imports say `type`. Declaration order: types -> constants -> helpers -> exported functions.
- **Code comments are ASCII only.** Content prose is normal English and German and may use any characters the language needs.
- **Every user-facing string comes from `messages/{en,de}.json`** *except* the body prose in `content/docs/*.mdx`, which is itself the per-locale content.
- **Command and option names are never translated.** Discord sends the same option keys in every language, so `/search`, `query:` and `lesson:` read identically in both files. Only the prose around them changes. `CommandGrid` already documents this for the landing page.
- Gold as text takes `text-primary-ink`, never `text-primary`.
- Link internally with next-intl's `Link` from `@/../i18n/navigation`. Inside MDX, a plain markdown link is fine - it renders through the `a` mapping in `mdx-components.tsx`.

## A note on the content tasks

Tasks 3 and 4 give the exact headings for every page (pinned by a test), and for each
section the exact facts it must state, each one sourced to the file it comes from. The
English and German prose for the commands page is written out in full, to set the voice.
For the remaining three pages the sentences are left to the writer rather than dictated
here: this is a content-authoring step, the facts are what must be right, and a plan is a
poor place to freeze 2,000 words of prose in two languages. The facts below are not
placeholders - every one is a specific, checkable claim.

---

### Task 1: The CommandTable component

**Files:**
- Create: `app/web/src/components/docs/command-table.tsx`
- Create: `app/web/src/components/docs/__tests__/command-table.test.tsx`
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json`

**Interfaces:**
- Consumes: `BOT_COMMANDS`, `type BotCommandName`, `attrLabel`, `LESSONS`, `TYPES` from `@revelio/core` (phase 2).
- Produces: `<CommandTable name={BotCommandName} />`. Task 2 registers it in `mdx-components.tsx`; task 3's content uses it.

> `src/lib/__tests__/message-key-parity.test.ts` already asserts that every leaf key exists
> in both catalogs, so there is no need for a generic `docs` parity test. What the tests below
> add is the part it cannot know: that the keys line up with `BOT_COMMANDS` and `DOCS_NAV`.

- [ ] **Step 1: Add the message keys**

In `app/web/messages/en.json`, inside the existing `"docs"` object, add:

```json
    "commandTable": {
      "option": "Option",
      "type": "Type",
      "required": "Required",
      "notes": "Notes",
      "isRequired": "Required",
      "isOptional": "Optional",
      "typeString": "Text",
      "typeInteger": "Number",
      "typeChoice": "Choice",
      "noOptions": "Takes no options.",
      "minimum": "Minimum {min}.",
      "ephemeral": "Only you see it",
      "public": "Posts to the channel",
      "linkRequired": "Needs a linked account"
    },
    "commands": {
      "card": {
        "options": {
          "name": "Autocompletes against every card in the database. Picking a suggestion sends the card id, so exact spelling never matters."
        }
      },
      "search": {
        "options": {
          "query": "Search terms. A match on a card's name always ranks above a match in its text or flavour.",
          "lesson": "Narrows to one lesson.",
          "type": "Narrows to one card type.",
          "set": "Autocompletes against set names.",
          "page": "Which page of results to show. Totals are estimated, so a page inside the reported count can still come back empty."
        }
      },
      "deck": {
        "options": {
          "deck": "A deck link or its id. Only public decks can be looked up this way; your own private decks are listed by /mydecks."
        }
      },
      "collection": {
        "options": {
          "set": "Narrows the summary to one set instead of your whole collection. Autocompletes against set names."
        }
      },
      "mydecks": { "options": {} }
    },
```

In `app/web/messages/de.json`, inside `"docs"`, add the same keys:

```json
    "commandTable": {
      "option": "Option",
      "type": "Typ",
      "required": "Pflicht",
      "notes": "Hinweise",
      "isRequired": "Pflicht",
      "isOptional": "Optional",
      "typeString": "Text",
      "typeInteger": "Zahl",
      "typeChoice": "Auswahl",
      "noOptions": "Nimmt keine Optionen entgegen.",
      "minimum": "Mindestens {min}.",
      "ephemeral": "Nur du siehst es",
      "public": "Antwortet im Kanal",
      "linkRequired": "Braucht ein verknuepftes Konto"
    },
    "commands": {
      "card": {
        "options": {
          "name": "Vervollstaendigt automatisch ueber alle Karten der Datenbank. Wer einen Vorschlag auswaehlt, sendet die Karten-ID - die genaue Schreibweise spielt dann keine Rolle."
        }
      },
      "search": {
        "options": {
          "query": "Suchbegriffe. Ein Treffer im Kartennamen steht immer vor einem Treffer im Kartentext oder im Flavour-Text.",
          "lesson": "Schraenkt auf eine Lektion ein.",
          "type": "Schraenkt auf einen Kartentyp ein.",
          "set": "Vervollstaendigt automatisch ueber die Set-Namen.",
          "page": "Welche Ergebnisseite angezeigt wird. Die Gesamtzahl ist geschaetzt, deshalb kann eine Seite innerhalb der angegebenen Anzahl leer bleiben."
        }
      },
      "deck": {
        "options": {
          "deck": "Ein Deck-Link oder dessen ID. So lassen sich nur oeffentliche Decks nachschlagen; deine privaten Decks listet /mydecks auf."
        }
      },
      "collection": {
        "options": {
          "set": "Schraenkt die Uebersicht auf ein Set statt auf die ganze Sammlung ein. Vervollstaendigt automatisch ueber die Set-Namen."
        }
      },
      "mydecks": { "options": {} }
    },
```

- [ ] **Step 2: Write the failing test**

Create `app/web/src/components/docs/__tests__/command-table.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect } from 'vitest'
import { BOT_COMMANDS, LESSONS, TYPES } from '@revelio/core'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'
import { CommandTable } from '@/components/docs/command-table'

function renderTable(name: string, locale: 'en' | 'de' = 'en', messages: typeof en | typeof de = en) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <CommandTable name={name as 'search'} />
    </NextIntlClientProvider>,
  )
}

describe('CommandTable', () => {
  it('names the command it documents', () => {
    renderTable('search')
    expect(screen.getByText('/search')).toBeInTheDocument()
  })

  // The whole reason the manifest exists: add an option to the bot and this
  // table grows a row without anyone editing a content file.
  it('renders a row for every option the manifest declares', () => {
    renderTable('search')
    for (const option of BOT_COMMANDS.find((c) => c.name === 'search')!.options) {
      expect(screen.getByText(option.name)).toBeInTheDocument()
    }
  })

  it('marks required and optional options differently', () => {
    renderTable('search')
    const row = screen.getByText('query').closest('tr')!
    expect(within(row).getByText('Required')).toBeInTheDocument()
    const optional = screen.getByText('set').closest('tr')!
    expect(within(optional).getByText('Optional')).toBeInTheDocument()
  })

  it('calls an option with choices a choice, not text', () => {
    renderTable('search')
    const row = screen.getByText('lesson').closest('tr')!
    expect(within(row).getByText('Choice')).toBeInTheDocument()
  })

  // The manifest names a scope rather than listing values, so the table has to
  // resolve them - otherwise a new lesson would be missing from the docs.
  it('lists every value a choice option accepts', () => {
    renderTable('search')
    const row = screen.getByText('lesson').closest('tr')!
    for (const lesson of LESSONS) {
      expect(within(row).getByText(lesson.code === 'charms' ? 'Charms' : /.+/)).toBeTruthy()
    }
    expect(within(row).getAllByText(/./).length).toBeGreaterThanOrEqual(LESSONS.length)

    const typeRow = screen.getByText('type').closest('tr')!
    expect(within(typeRow).getAllByRole('listitem')).toHaveLength(TYPES.length)
  })

  it('states the floor on an option that has one', () => {
    renderTable('search')
    const row = screen.getByText('page').closest('tr')!
    expect(within(row).getByText(/Minimum 1/)).toBeInTheDocument()
  })

  // A personal command's answer is nobody else's business, and the page must
  // not imply it lands in the channel.
  it('marks a personal command as private and account-linked', () => {
    renderTable('collection')
    expect(screen.getByText('Only you see it')).toBeInTheDocument()
    expect(screen.getByText('Needs a linked account')).toBeInTheDocument()
  })

  it('marks a public command as posting to the channel', () => {
    renderTable('card')
    expect(screen.getByText('Posts to the channel')).toBeInTheDocument()
    expect(screen.queryByText('Only you see it')).toBeNull()
  })

  it('says so plainly when a command takes no options', () => {
    renderTable('mydecks')
    expect(screen.getByText('Takes no options.')).toBeInTheDocument()
  })

  it('renders German labels and German notes', () => {
    renderTable('search', 'de', de)
    expect(screen.getByText('Pflicht')).toBeInTheDocument()
    expect(screen.getByText('Auswahl')).toBeInTheDocument()
    // Option names stay untranslated: this is what a German user types.
    expect(screen.getByText('query')).toBeInTheDocument()
  })
})

// Structure lives in the manifest, prose lives in the catalog. This is the
// guard on the prose half: a new option with no note renders a blank cell.
describe('every manifest option has a note in both locales', () => {
  it.each(
    BOT_COMMANDS.flatMap((command) =>
      command.options.map((option) => [command.name, option.name] as const),
    ),
  )('%s.%s', (command, option) => {
    for (const messages of [en.docs, de.docs] as const) {
      const notes = (
        messages.commands as Record<string, { options: Record<string, string> }>
      )[command]?.options
      expect(notes?.[option], `${command}.${option}`).toBeTruthy()
    }
  })
})
```

- [ ] **Step 3: Run it to make sure it fails**

```bash
cd app
/usr/local/bin/npm test -w web -- src/components/docs/__tests__/command-table.test.tsx
```

Expected: FAIL - cannot resolve `@/components/docs/command-table`.

- [ ] **Step 4: Write the component**

Create `app/web/src/components/docs/command-table.tsx`:

```tsx
import { useLocale, useTranslations } from 'next-intl'
import {
  BOT_COMMANDS,
  LESSONS,
  TYPES,
  attrLabel,
  type BotCommandName,
  type CommandOptionSpec,
} from '@revelio/core'

const CELL = 'border-b border-border/60 px-4 py-2.5 align-top text-muted-foreground'
const HEAD =
  'border-b border-border px-4 py-2 text-left text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground'

// The manifest names a scope rather than listing values, so a new lesson or
// card type reaches the docs without anyone editing them.
function choiceCodes(scope: CommandOptionSpec['choices']): string[] {
  if (scope === 'lessons') return LESSONS.map((lesson) => lesson.code)
  if (scope === 'types') return TYPES.map((type) => type.code)
  return []
}

/**
 * The reference table for one slash command.
 *
 * Structure comes from BOT_COMMANDS in @revelio/core, which the bot's own
 * registration is tested against, so a renamed or added option cannot leave a
 * stale row here. Prose comes from the docs.commands message catalog, because
 * Discord's own descriptions are capped at 100 characters and read nothing like
 * documentation.
 *
 * Option names are never translated: Discord sends the same keys in every
 * language, so both locales show the same thing to type.
 */
export function CommandTable({ name }: { name: BotCommandName }) {
  const t = useTranslations('docs')
  const locale = useLocale()
  const command = BOT_COMMANDS.find((entry) => entry.name === name)
  if (!command) return null

  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <span className="font-mono text-sm font-medium text-primary-ink">/{command.name}</span>
        <span className="ml-auto flex flex-wrap gap-2">
          <span className="rounded-full border border-border px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider text-muted-foreground">
            {command.ephemeral ? t('commandTable.ephemeral') : t('commandTable.public')}
          </span>
          {command.linkRequired && (
            <span className="rounded-full border border-secondary-ink/45 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider text-secondary-ink">
              {t('commandTable.linkRequired')}
            </span>
          )}
        </span>
      </div>

      {command.options.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">{t('commandTable.noOptions')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={HEAD}>{t('commandTable.option')}</th>
                <th className={HEAD}>{t('commandTable.type')}</th>
                <th className={HEAD}>{t('commandTable.required')}</th>
                <th className={HEAD}>{t('commandTable.notes')}</th>
              </tr>
            </thead>
            <tbody>
              {command.options.map((option) => {
                const codes = choiceCodes(option.choices)
                return (
                  <tr key={option.name}>
                    <td className={`${CELL} font-mono font-medium text-foreground`}>
                      {option.name}
                    </td>
                    <td className={CELL}>
                      {option.choices
                        ? t('commandTable.typeChoice')
                        : option.type === 'integer'
                          ? t('commandTable.typeInteger')
                          : t('commandTable.typeString')}
                    </td>
                    <td className={CELL}>
                      {option.required ? (
                        <span className="font-semibold text-primary-ink">
                          {t('commandTable.isRequired')}
                        </span>
                      ) : (
                        t('commandTable.isOptional')
                      )}
                    </td>
                    <td className={CELL}>
                      {t(`commands.${command.name}.options.${option.name}`)}
                      {option.min !== undefined && ` ${t('commandTable.minimum', { min: option.min })}`}
                      {codes.length > 0 && (
                        <ul className="mt-1.5 flex flex-wrap gap-1">
                          {codes.map((code) => (
                            <li
                              key={code}
                              className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
                            >
                              {attrLabel(option.choices === 'lessons' ? 'lessons' : 'types', code, locale)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd app
/usr/local/bin/npm test -w web -- src/components/docs/__tests__/command-table.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Prove the drift guard bites**

Temporarily add `{ name: 'sort', type: 'string', required: false, autocomplete: false }` to `/search`'s options in `app/core/src/bot-commands.ts`. Re-run the test.

Expected: two failures - `bot/test/command-manifest.test.ts` from phase 2 (the builder has no such option), and `every manifest option has a note in both locales / search.sort` here. That pair is the whole design: structure drift and prose drift each have an owner. Revert and confirm green.

- [ ] **Step 7: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/src/components/docs app/web/messages
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): render command reference tables from the core manifest"
```

---

### Task 2: The Callout component and MDX registration

**Files:**
- Create: `app/web/src/components/docs/callout.tsx`
- Create: `app/web/src/components/docs/__tests__/callout.test.tsx`
- Modify: `app/web/src/mdx-components.tsx`

**Interfaces:**
- Consumes: `CommandTable` (Task 1).
- Produces: `<Callout>` and both components available to every MDX file without an import.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/components/docs/__tests__/callout.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Callout } from '@/components/docs/callout'

describe('Callout', () => {
  it('renders its children', () => {
    render(<Callout>Linking is only needed for two commands.</Callout>)
    expect(screen.getByText('Linking is only needed for two commands.')).toBeInTheDocument()
  })

  // It carries a caution or an aside, not decoration, so it must be reachable
  // as a distinct region rather than an unlabelled coloured box.
  it('is announced as a note', () => {
    render(<Callout>Something worth knowing.</Callout>)
    expect(screen.getByRole('note')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd app
/usr/local/bin/npm test -w web -- src/components/docs/__tests__/callout.test.tsx
```

Expected: FAIL - cannot resolve `@/components/docs/callout`.

- [ ] **Step 3: Write the component**

Create `app/web/src/components/docs/callout.tsx`:

```tsx
import type { ReactNode } from 'react'
import { Info } from 'lucide-react'

/**
 * An aside inside a docs page: the thing a reader needs but that would break
 * the flow of the section it belongs to. Deliberately one variant - a docs
 * section this size does not need a taxonomy of note, tip, warning and danger.
 */
export function Callout({ children }: { children: ReactNode }) {
  return (
    <div
      role="note"
      className="mt-6 flex max-w-[65ch] gap-3 rounded-xl border border-primary/45 bg-primary/8 px-4 py-3.5"
    >
      <Info className="mt-0.5 size-4 shrink-0 text-primary-ink" aria-hidden />
      <div className="text-sm leading-relaxed text-foreground [&>p]:m-0 [&>p]:text-foreground">
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Register both components for MDX**

In `app/web/src/mdx-components.tsx`, add the imports:

```tsx
import { Callout } from '@/components/docs/callout'
import { CommandTable } from '@/components/docs/command-table'
```

and add them to the returned map, just before the `...components` spread:

```tsx
    // Available to every MDX file without an import, which is the whole point
    // of MDX over plain markdown here.
    Callout,
    CommandTable,
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd app
/usr/local/bin/npm test -w web -- src/components/docs src/__tests__/mdx-components.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/src/components/docs app/web/src/mdx-components.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): give MDX pages a callout and the command table"
```

---

### Task 3: The commands page, and the structural parity guard

**Files:**
- Modify: `app/web/content/docs/discord-commands.en.mdx`
- Modify: `app/web/content/docs/discord-commands.de.mdx`
- Create: `app/web/src/lib/docs/__tests__/content-parity.test.ts`

**Interfaces:**
- Consumes: `CommandTable`, `Callout` (Tasks 1 and 2); `loadDoc`, `DOCS_NAV` (phase 3).
- Produces: the parity guard that tasks 4's pages must also satisfy.

- [ ] **Step 1: Write the failing parity test**

Create `app/web/src/lib/docs/__tests__/content-parity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { DOCS_NAV } from '@/lib/docs/nav'
import { loadDoc } from '@/lib/docs/registry'

const slugs = DOCS_NAV.flatMap((section) => section.pages)

// The registry's `satisfies` clause proves a German file exists. It cannot
// prove the German file still says the same things: a section quietly dropped
// in translation leaves a page that looks complete and is not.
describe('content structure is the same in both locales', () => {
  it.each(slugs)('%s has the same heading shape in en and de', async (slug) => {
    const [en, de] = await Promise.all([loadDoc(slug, 'en'), loadDoc(slug, 'de')])
    expect(de.toc.map((entry) => entry.depth)).toEqual(en.toc.map((entry) => entry.depth))
  })

  it.each(slugs)('%s has at least one section in both locales', async (slug) => {
    const [en, de] = await Promise.all([loadDoc(slug, 'en'), loadDoc(slug, 'de')])
    expect(en.toc.length).toBeGreaterThan(0)
    expect(de.toc.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run it and confirm it passes against the placeholders**

```bash
cd app
/usr/local/bin/npm test -w web -- src/lib/docs/__tests__/content-parity.test.ts
```

Expected: PASS - phase 3's placeholders already carry one `##` each in both locales. This guard is written before the content so it is in force while the content is written.

- [ ] **Step 3: Prove the parity guard bites**

Temporarily delete the `## In Kuerze` heading and its paragraph from
`content/docs/discord-linking.de.mdx` and re-run. Expected: both
`discord/linking` cases FAIL. Restore and confirm green.

- [ ] **Step 4: Write the English commands page**

Replace the contents of `app/web/content/docs/discord-commands.en.mdx`:

````mdx
Five slash commands, available in every channel the bot can see. Option names are
the same in every language - only their descriptions are translated, so you type
the same thing whether Discord is set to English or German.

## Card lookup

Looks up one card by name and posts it to the channel: text, flavour, cost,
lesson, rarity, legality, rulings and the art. Autocomplete suggests cards as you
type, and picking a suggestion sends the card's id, so exact spelling never
matters.

<CommandTable name="card" />

```
/card name:Alohomora
```

## Search

The same search the site runs, paged into an embed, with a link back to the full
results on revelio.cards. Filters combine: a lesson and a set together narrow to
both.

<CommandTable name="search" />

```
/search query:lumos lesson:Charms set:Chamber of Secrets
```

## Deck lookup

Shows a public decklist by link or id: its character, main deck, sideboard,
format and legality. Only public decks can be looked up this way - your own
private decks are listed by `/mydecks`.

<CommandTable name="deck" />

```
/deck deck:https://revelio.cards/decks/abc123
```

## Your own data

Two commands answer about you rather than about the game, so both reply
privately - only you see the result, even in a busy channel. Both need your
Discord account linked to Revelio first.

<CommandTable name="collection" />

<CommandTable name="mydecks" />

<Callout>
Not linked yet? The bot replies with a link to Settings, then Connections.
Linking is only needed for these two commands - card, search and deck lookups
work for anyone. See [account linking](/docs/discord/linking).
</Callout>
````

- [ ] **Step 5: Write the German commands page**

Replace the contents of `app/web/content/docs/discord-commands.de.mdx`. The heading
count and their depths must match the English file exactly - the parity test enforces it.

````mdx
Fuenf Slash-Befehle, verfuegbar in jedem Kanal, den der Bot sehen kann. Die
Namen der Optionen sind in allen Sprachen gleich - uebersetzt werden nur ihre
Beschreibungen. Du tippst also dasselbe, egal ob Discord auf Deutsch oder auf
Englisch steht.

## Karte nachschlagen

Schlaegt eine Karte per Name nach und postet sie in den Kanal: Kartentext,
Flavour-Text, Kosten, Lektion, Seltenheit, Legalitaet, Rulings und das
Artwork. Die Autovervollstaendigung schlaegt beim Tippen Karten vor; wer einen
Vorschlag auswaehlt, sendet die Karten-ID - die genaue Schreibweise spielt dann
keine Rolle.

<CommandTable name="card" />

```
/card name:Alohomora
```

## Suche

Dieselbe Suche wie auf der Website, seitenweise in ein Embed gepackt, mit einem
Link zurueck zu den vollstaendigen Ergebnissen auf revelio.cards. Filter lassen
sich kombinieren: Lektion und Set zusammen schraenken auf beides ein.

<CommandTable name="search" />

```
/search query:lumos lesson:Zauberkunst set:Kammer des Schreckens
```

## Deck nachschlagen

Zeigt ein oeffentliches Deck per Link oder ID: Charakter, Hauptdeck, Sideboard,
Format und Legalitaet. So lassen sich nur oeffentliche Decks nachschlagen -
deine eigenen privaten Decks listet `/mydecks` auf.

<CommandTable name="deck" />

```
/deck deck:https://revelio.cards/decks/abc123
```

## Deine eigenen Daten

Zwei Befehle beantworten Fragen zu dir statt zum Spiel. Beide antworten deshalb
privat - nur du siehst das Ergebnis, auch in einem vollen Kanal. Fuer beide muss
dein Discord-Konto mit Revelio verknuepft sein.

<CommandTable name="collection" />

<CommandTable name="mydecks" />

<Callout>
Noch nicht verknuepft? Der Bot antwortet mit einem Link zu Einstellungen, dann
Verbindungen. Die Verknuepfung ist nur fuer diese beiden Befehle noetig - Karten-,
Such- und Deck-Abfragen funktionieren fuer alle. Siehe
[Kontoverknuepfung](/docs/discord/linking).
</Callout>
````

- [ ] **Step 6: Verify the page renders with real tables**

```bash
cd app
/usr/local/bin/npm test -w web
```

Expected: PASS, including the parity test for `discord/commands`. Then:

```bash
PORT=3100 /usr/local/bin/npm run dev -w web
```

In a second shell:

```bash
curl -s http://localhost:3100/docs/discord/commands | grep -c "autocomplete\|Autocompletes"
curl -s http://localhost:3100/de/docs/discord/commands | grep -c "Auswahl"
```

Expected: a non-zero count from both - the manifest-driven tables rendered in both locales. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/content/docs app/web/src/lib/docs
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "docs(web): write the Discord command reference"
```

---

### Task 4: The remaining three pages

Each page gets the headings listed below, in that order, in both locales - the parity test
from Task 3 fails otherwise. Under each heading, state the listed facts. Every fact is
sourced; check the named file before writing, and if the code says something different,
**the code wins and the fact here is the thing to correct**.

**Files:**
- Modify: `app/web/content/docs/discord-linking.{en,de}.mdx`
- Modify: `app/web/content/docs/discord-privacy.{en,de}.mdx`
- Modify: `app/web/content/docs/discord-troubleshooting.{en,de}.mdx`
- Modify: `app/web/content/docs/discord.{en,de}.mdx` (only to repoint its "where to go next" links)

**Interfaces:**
- Consumes: `Callout` (Task 2).
- Produces: nothing importable.

- [ ] **Step 1: Write `discord-linking`, both locales**

Headings, in order: `## What linking is for`, `## Linking your account`, `## Unlinking`.

Facts:
- Only `/collection` and `/mydecks` need it; every other command works for anyone. Source: `bot/src/discord/commands/{collection,mydecks}.ts` call `resolveLinkedUser`, the others do not.
- Linking happens on the website, at Settings then Connections, not in Discord. Source: `web/src/app/[locale]/settings/connections/`, and `bot/src/links.ts` `settingsUrl` is what the bot links to.
- There is no separate link table: the connection is Better Auth's `account` row with `providerId = 'discord'`. Source: `bot/src/data/link.ts` `getUserIdByDiscordAccount`.
- Signing in with Discord is not possible - it is link-only, and the sign-in route stays email OTP. Source: `disableSignUp` and `disableImplicitLinking` in `web/src/lib/server/auth.ts`.
- Unlinking revokes the authorization at Discord as well as removing the row, and deleting your Revelio account does the same. Source: `web/src/lib/actions/connections-actions.ts` and `unlinkAndRevokeDiscord`.
- Use a `<Callout>` for: after unlinking, `/collection` and `/mydecks` stop answering and point back at Settings.

- [ ] **Step 2: Write `discord-privacy`, both locales**

Headings, in order: `## What the bot can read`, `## What it cannot read`, `## Where answers appear`, `## Limits you may notice`.

Facts:
- The bot requests only `GatewayIntentBits.Guilds`. Source: `bot/src/clients.ts`.
- It therefore cannot read message content and cannot list members; reading either would require Discord verification, and slash commands need neither.
- It only ever sees what you type into a slash command's options.
- Replies cannot ping anyone: the client sets `allowedMentions: { parse: [] }`, so echoing input like `/card name:@everyone` back is inert. Source: `bot/src/clients.ts` and the `allowedMentions` call in `bot/src/discord/commands/card.ts`.
- `/collection` and `/mydecks` defer ephemerally as their first statement, so their answers are visible only to the asker. Source: `bot/src/discord/commands/collection.ts` and `mydecks.ts`.
- `/mydecks` lists private decks too, precisely because only the asker sees the reply.
- Limits: a search result page may come back empty even though it is inside the reported page count, because Meilisearch's `estimatedTotalHits` over-counts. Source: `bot/src/discord/embeds/search-embed.ts` and the note in CLAUDE.md.
- Limits: long lists are clamped rather than risking a rejected reply - Discord caps an embed description at 4096 characters, a field value at 1024, and an embed at 25 fields, and a message body at 2000 characters. `/mydecks` says how many decks it left out. Source: `MESSAGE_LIMIT` in `bot/src/discord/commands/mydecks.ts`.
- Card images in embeds are the 300px thumbnail, not the full-size art. Source: `thumbKey` use in `bot/src/discord/embeds/card-embed.ts`.

- [ ] **Step 3: Write `discord-troubleshooting`, both locales**

Headings, in order: `## The commands do not appear`, `## It says I need to link my account`, `## A deck is not found`, `## A page of results is empty`.

Facts:
- Commands are re-registered on every boot, and Discord's `PUT` is a full replace; a fresh install can take a moment to appear in a client, and restarting the Discord client refreshes the list. Source: `bot/src/discord/register.ts`.
- A registration failure is logged and survived rather than being fatal, so the bot can be online with a stale command list. Source: `bot/src/main.ts`.
- "Link required" means `/collection` or `/mydecks` was used from a Discord account with no linked Revelio account; the reply carries the Settings link. Source: `link.required` in `bot/src/i18n/en.json`.
- A banned account is refused here too: the `account` row survives a ban, so the lookup joins `user` and rejects an active ban. Source: `getUserIdByDiscordAccount` in `bot/src/data/link.ts`.
- `/deck` finds public decks only. A private deck, or a mistyped id, returns not-found.
- An empty results page inside the reported count is the `estimatedTotalHits` over-count again; go back a page.

- [ ] **Step 4: Repoint the overview's links**

In `content/docs/discord.{en,de}.mdx`, the closing paragraph phase 1 wrote already links
`/docs/discord/commands`, `/docs/discord/linking` and `/docs/discord/privacy`. Add
`/docs/discord/troubleshooting` to that list in both files. Change nothing else.

- [ ] **Step 5: Verify**

```bash
cd app
/usr/local/bin/npm test -w web && /usr/local/bin/npm run typecheck && /usr/local/bin/npm run lint
```

Expected: all pass, including every `content-parity` case.

- [ ] **Step 6: Read both language versions of every page side by side**

Start the dev server on 3100 and open each of the five pages in English and German. Confirm
each pair says the same things in the same order, that no `<CommandTable>` renders an empty
notes cell, and that every option name reads identically in both.

- [ ] **Step 7: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/content/docs
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "docs(web): write linking, privacy and troubleshooting"
```

---

### Task 5: Make the docs discoverable to machines

**Files:**
- Modify: `app/web/src/lib/sitemap.ts`
- Modify: `app/web/src/app/llms.txt/route.ts`
- Modify: `app/web/src/lib/__tests__/sitemap.test.ts`
- Modify: `app/web/src/app/llms.txt/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `DOCS_NAV` (phase 3).
- Produces: nothing importable.

- [ ] **Step 1: Write the failing tests**

Add to `app/web/src/app/llms.txt/__tests__/route.test.ts`:

```ts
  it('points an agent at the docs section', async () => {
    const body = await GET().text()
    expect(body).toContain('/docs/discord')
    expect(body).toMatch(/Discord bot documentation/i)
  })
```

Add to the existing `app/web/src/lib/__tests__/sitemap.test.ts`, which already imports
`buildSitemap`, `localizedEntries` and `STATIC_ROUTES` from `'../sitemap'`. Add the one
import it lacks at the top:

```ts
import { DOCS_NAV } from '@/lib/docs/nav'
```

and this block at the end:

```ts
describe('the sitemap covers the docs', () => {
  it('lists the hub and every docs page as a static route', () => {
    expect(STATIC_ROUTES).toContain('/docs')
    for (const slug of DOCS_NAV.flatMap((section) => section.pages)) {
      expect(STATIC_ROUTES).toContain(`/docs/${slug}`)
    }
  })

  // Each page needs its full hreflang alternates, or Google treats the German
  // page as a duplicate of the English one.
  it('emits both locales with alternates for a docs page', () => {
    const entries = buildSitemap({ cards: [], sets: [] })
    const docs = entries.filter((entry) => entry.url.includes('/docs/discord/commands'))
    expect(docs).toHaveLength(2)
    expect(Object.keys(docs[0].alternates!.languages!)).toContain('x-default')
  })
})
```

- [ ] **Step 2: Run them to make sure they fail**

```bash
cd app
/usr/local/bin/npm test -w web -- src/lib/__tests__/sitemap.test.ts src/app/llms.txt
```

Expected: FAIL - `/docs` is not in `STATIC_ROUTES`, and `llms.txt` has no docs section.

- [ ] **Step 3: Add the docs routes to the sitemap**

In `app/web/src/lib/sitemap.ts`, add the import:

```ts
import { DOCS_NAV } from '@/lib/docs/nav'
```

and extend `STATIC_ROUTES`, replacing the closing bracket of the array with:

```ts
  '/privacy',
  // Derived, not hand-listed: a page added to DOCS_NAV reaches the sitemap
  // without a second edit here.
  '/docs',
  ...DOCS_NAV.flatMap((section) => section.pages.map((slug) => `/docs/${slug}`)),
]
```

- [ ] **Step 4: Add the docs to llms.txt**

In `app/web/src/app/llms.txt/route.ts`, inside the `## Core pages` list, add a line after the
existing Discord bot entry:

```ts
- [Discord bot documentation](${SITE_URL}/docs/discord): every slash command, its options, account linking, and what the bot can and cannot read
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd app
/usr/local/bin/npm test -w web -- src/lib/__tests__/sitemap.test.ts src/app/llms.txt
```

Expected: PASS.

- [ ] **Step 6: Full verification**

```bash
cd app
/usr/local/bin/npm test && /usr/local/bin/npm run typecheck && /usr/local/bin/npm run lint \
  && /usr/local/bin/npm run build -w web
```

Expected: all pass. `npm test` (no `-w`) runs every workspace, which is what confirms phase
2's conformance test is still green against the manifest the tables now render.

- [ ] **Step 7: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/src/lib app/web/src/app/llms.txt
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): list the docs in the sitemap and llms.txt"
```

---

## Phase exit criteria

- All five Discord pages carry real content in both locales, with matching heading structure.
- Command tables render from `BOT_COMMANDS`; adding an option to the manifest fails both the bot conformance test and the missing-note test until the bot and the catalog agree - proven in Task 1, Step 6.
- `/docs` and every docs page appear in `/sitemap.xml` with hreflang alternates, and `/docs/discord` appears in `/llms.txt`.
- `npm test` across all workspaces, `npm run typecheck`, `npm run lint` and `npm run build -w web` all pass.

## Deployment

Nothing outside the diff: no migration, no new environment variable, no ingest run. The
`/discord` landing page's `DOCS_HREF` already points at `/docs/discord` and stops being a
dead link the moment phase 3 merges.
