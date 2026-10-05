# Deck Sheet Render Service — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `@revelio/sheet`, a service that takes a resolved deck sheet payload over HTTP and returns the rendered sheet as image bytes, without changing any existing behaviour.

**Architecture:** A seventh npm workspace depending on `@revelio/core` only. `core` gains the request contract (`DeckSheetRequest`) and the sheet's label catalog; the service gains the sharp painter ported from the deployed `fix/bot-deck-image-delivery` branch, a `node:http` surface with a bearer token and a render queue, an esbuild bundle and a Docker image modelled on `bot`'s. Nothing calls it yet — Phases 2 and 3 switch the callers.

**Tech Stack:** TypeScript, Node 22, sharp 0.35, zod 3, `node:http`, esbuild, vitest, Docker (node:22-alpine).

**Spec:** `docs/superpowers/specs/2026-10-04-deck-sheet-render-service-design.md`

## Global Constraints

- **`@revelio/core` keeps owning layout, grouping and colour.** The service paints; it never redefines geometry. `DECK_SHEET` and `computeSheetGeometry` are imported, never copied.
- **`MAX_SHEET_PIXELS = 12_000_000`**, a code constant in the service, never an env var. It pairs with the pod memory limit (768Mi) and must not be movable on its own.
- **Peak RSS is `215 MB + 28 MB per megapixel`; PNG is `1.6 MB per megapixel`.** Both measured on the deployed branch. The byte ceiling derives the starting scale from the second number.
- **`MAX_ENTRIES = 400`, `MAX_BODY_BYTES = 262_144`.** Geometry is a function of entry count, so an uncapped payload is a denial of service.
- **Render concurrency is 1, queue depth 4, 503 beyond that.** The memory limit is sized for one render.
- **Every payload string is text, never markup.** Card names and the deck title reach Pango and an SVG; both paths escape.
- **Logs name card ids and reasons, never URLs.** The image base can be an internal hostname.
- **Types:** `type` aliases only (no `interface`), `import type` for type-only imports, declaration order types -> constants -> helpers -> exported functions, derive types from Zod where a schema owns the shape.
- **Comments are ASCII only** - no em dashes, no unicode arrows.
- **Commits are Conventional Commits**, `type(scope): subject`, scope `sheet` or `core`. No tool attribution.
- All commands run from `app/`.

---

### Task 1: The sheet's labels move into `@revelio/core`

The service resolves its own labels from a locale, so the request carries no translations. web's and the bot's catalogs hold identical copy for these keys today (verified), so this is a consolidation with no copy decisions.

**This adds a catalog; it does not move one.** web keeps every key, because its own UI - not the sheet - is what mostly reads them (`deck-panel.tsx`, `deck-gallery.tsx`, `lib/deck-groups.ts`, `deck-format-switch.tsx` and six more). The bot's three `deck.sheet.*` keys and its ten `deck.group.*` keys *do* fall out of use, but only once its painter goes, so Phase 2 deletes them. Nothing is removed in this task.

**Files:**
- Modify: `core/src/messages/en.json`, `core/src/messages/de.json` (add three scopes)
- Modify: `core/src/labels.ts:4` (extend `LabelScope`)
- Modify: `core/src/deck-sheet.ts` (add `SHEET_LOCALES` and `sheetLabels`)
- Test: `core/test/deck-sheet.test.ts` (extend), `core/test/labels.test.ts` (extend)

**Interfaces:**
- Consumes: `attrLabel(scope, code, locale)` from `core/src/labels.ts`; `DeckSheetLabels`, `OTHER_GROUP` from core.
- Produces: `SHEET_LOCALES: readonly ['en', 'de']`, `sheetLabels(locale: string): DeckSheetLabels`. Tasks 2 and 5, and Phases 2 and 3, all use these.

- [ ] **Step 1: Write the failing test**

Append to `core/test/deck-sheet.test.ts`:

```ts
import { OTHER_GROUP, SHEET_LOCALES, sheetLabels } from '../src/index'

describe('sheetLabels', () => {
  it('resolves every label the sheet layout asks for', () => {
    const en = sheetLabels('en')
    expect(en.formatLabel).toEqual({ classic: 'Classic', revival: 'Revival' })
    expect(en.character).toBe('Character')
    expect(en.mainDeck).toBe('Main deck')
    expect(en.sideboard).toBe('Sideboard')
    expect(en.group('creature')).toBe('Creatures')
    expect(en.group('lesson')).toBe('Lessons')
    expect(en.group(OTHER_GROUP)).toBe('Other')
  })

  it('resolves German too', () => {
    const de = sheetLabels('de')
    expect(de.mainDeck).toBe('Hauptdeck')
    expect(de.group('creature')).toBe('Kreaturen')
    expect(de.group(OTHER_GROUP)).toBe('Sonstige')
  })

  // An unknown locale must not render a sheet full of raw keys.
  it('falls back to English for an unknown locale', () => {
    expect(sheetLabels('fr').mainDeck).toBe('Main deck')
  })

  it('lists the locales the sheet contract accepts', () => {
    expect([...SHEET_LOCALES]).toEqual(['en', 'de'])
  })
})
```

Append to `core/test/labels.test.ts`:

```ts
// Both catalogs must carry every sheet key, or a German sheet silently falls
// back to English mid-picture.
it('holds the same sheet keys in both locales', async () => {
  const en = (await import('../src/messages/en.json')).default as Record<string, Record<string, string>>
  const de = (await import('../src/messages/de.json')).default as Record<string, Record<string, string>>
  for (const scope of ['formats', 'deckSheet', 'deckGroups']) {
    expect(Object.keys(de[scope]).sort()).toEqual(Object.keys(en[scope]).sort())
  }
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -w @revelio/core -- test/deck-sheet.test.ts test/labels.test.ts`
Expected: FAIL — `sheetLabels is not a function`, and `Cannot read properties of undefined (reading 'formats')`.

- [ ] **Step 3: Add the three scopes to both catalogs**

In `core/src/messages/en.json`, after the existing `legalities` scope:

```json
  "formats": {
    "classic": "Classic",
    "revival": "Revival"
  },
  "deckSheet": {
    "character": "Character",
    "mainDeck": "Main deck",
    "sideboard": "Sideboard"
  },
  "deckGroups": {
    "creature": "Creatures",
    "spell": "Spells",
    "item": "Items",
    "adventure": "Adventures",
    "location": "Locations",
    "event": "Events",
    "match": "Matches",
    "character": "Characters",
    "lesson": "Lessons",
    "other": "Other"
  }
```

In `core/src/messages/de.json`, the same scopes:

```json
  "formats": {
    "classic": "Classic",
    "revival": "Revival"
  },
  "deckSheet": {
    "character": "Charakter",
    "mainDeck": "Hauptdeck",
    "sideboard": "Sideboard"
  },
  "deckGroups": {
    "creature": "Kreaturen",
    "spell": "Zauber",
    "item": "Gegenstände",
    "adventure": "Abenteuer",
    "location": "Orte",
    "event": "Ereignisse",
    "match": "Spiele",
    "character": "Charaktere",
    "lesson": "Lektionen",
    "other": "Sonstige"
  }
```

- [ ] **Step 4: Extend `LabelScope` and add `sheetLabels`**

`core/src/labels.ts:4`:

```ts
export type LabelScope =
  | 'types' | 'lessons' | 'rarities' | 'finishes' | 'legalities'
  // The deck sheet's own labels. They live here rather than in a consumer's
  // catalog because the render service resolves them from a locale: a label
  // passed in by a caller would be part of the request, and so part of the
  // cache key, and one catalog typo would fork the cache.
  | 'formats' | 'deckSheet' | 'deckGroups'
```

In `core/src/deck-sheet.ts`, after the `DECK_SHEET` constant block and before `CONTENT_W`:

```ts
// The locales the sheet renders. The request contract validates against this,
// so an unknown locale is a 400 rather than a picture full of English.
export const SHEET_LOCALES = ['en', 'de'] as const
```

And with the exported functions, directly above `layoutDeckSheet`:

```ts
/**
 * The sheet's labels for one locale, resolved from core's own catalog. The
 * render service calls this instead of taking labels in its request: the sheet
 * is cached on its input, and translations in that input would mean a label
 * change in one caller's catalog silently renders a different picture.
 *
 * Record<DeckFormat, string> is what makes a new format a type error here
 * rather than a missing title at render time.
 */
export function sheetLabels(locale: string): DeckSheetLabels {
  return {
    formatLabel: {
      classic: attrLabel('formats', 'classic', locale),
      revival: attrLabel('formats', 'revival', locale),
    },
    character: attrLabel('deckSheet', 'character', locale),
    mainDeck: attrLabel('deckSheet', 'mainDeck', locale),
    sideboard: attrLabel('deckSheet', 'sideboard', locale),
    group: (key) => attrLabel('deckGroups', key === OTHER_GROUP ? 'other' : key, locale),
  }
}
```

Add the import at the top of `core/src/deck-sheet.ts` (`labels.ts` imports only the JSON catalogs, so there is no cycle):

```ts
import { attrLabel } from './labels'
import { groupMainEntries, OTHER_GROUP } from './deck-groups'
```

(`OTHER_GROUP` joins the existing `groupMainEntries` import.)

- [ ] **Step 5: Confirm no other catalog lost a key**

The sheet's copy now lives in three places, and only one of them is the sheet's. Check that the
other two still carry what their own UI reads:

```bash
grep -rn "panel.characterBadge\|panel.main\|panel.sideboard" web/src --include='*.tsx' | grep -v export-menu
grep -rn "group\." web/src/lib/deck-groups.ts
grep -rn "deck.format." bot/src/discord | head
```

Expected: `deck-panel.tsx` and `deck-gallery.tsx` for the panel labels, `lib/deck-groups.ts` for
the group labels, and `mydecks.ts` + `deck-embed.ts` for the bot's format labels. Those are
their own consumers, not the sheet's, so every one of those keys stays where it is. The bot's
`deck.sheet.*` and `deck.group.*` keys are the only ones that become dead, and only after its
painter is deleted - Phase 2 Task 5 removes them.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -w @revelio/core`
Expected: PASS, including the existing `deck-sheet`, `labels` and `deck-groups` suites.

- [ ] **Step 7: Typecheck and lint**

Run: `npm run typecheck -w @revelio/core && npm run lint`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add core/src/messages/en.json core/src/messages/de.json core/src/labels.ts core/src/deck-sheet.ts core/test/deck-sheet.test.ts core/test/labels.test.ts
git commit -m "feat(core): resolve the deck sheet's labels from core's catalog"
```

---

### Task 2: The request contract in `@revelio/core`

The service's request body is the sheet's pure input, which makes it also the cache key. Core owns its shape so both callers and the service validate the same thing.

**Files:**
- Modify: `core/src/deck-sheet.ts` (schemas + `pickSheetEntries`)
- Test: `core/test/deck-sheet.test.ts` (extend)

**Interfaces:**
- Consumes: `DeckFormat`, `DeckZone` from `core/src/deck.ts`; `SHEET_LOCALES` from Task 1; `DeckSheetEntry` (already in `deck-sheet.ts`).
- Produces: `MAX_SHEET_ENTRIES: 400`, `DeckSheetRequest` (schema + inferred type), `pickSheetEntries(views: DeckSheetEntry[]): DeckSheetEntry[]`. Task 5 renders from a `DeckSheetRequest`; Task 6 parses one; Phases 2 and 3 build one with `pickSheetEntries`.

- [ ] **Step 1: Write the failing test**

Append to `core/test/deck-sheet.test.ts`:

```ts
import { DeckSheetRequest, MAX_SHEET_ENTRIES, pickSheetEntries } from '../src/index'

const entry = {
  cardId: 'harry', zone: 'main' as const, quantity: 2, name: 'Harry Potter',
  setCode: 'base', types: ['character'], imageVersion: 3, orientation: null,
}
const body = { locale: 'en', deck: { name: 'Charms Aggro', format: 'classic' }, entries: [entry] }

describe('DeckSheetRequest', () => {
  it('accepts a minimal sheet request', () => {
    const parsed = DeckSheetRequest.parse(body)
    expect(parsed.entries[0].cardId).toBe('harry')
    expect(parsed.maxBytes).toBeUndefined()
  })

  it('rejects a locale the sheet has no labels for', () => {
    expect(DeckSheetRequest.safeParse({ ...body, locale: 'fr' }).success).toBe(false)
  })

  it('rejects an empty deck and one past the entry cap', () => {
    expect(DeckSheetRequest.safeParse({ ...body, entries: [] }).success).toBe(false)
    const tooMany = Array.from({ length: MAX_SHEET_ENTRIES + 1 }, (_, i) => ({ ...entry, cardId: `c${i}` }))
    expect(DeckSheetRequest.safeParse({ ...body, entries: tooMany }).success).toBe(false)
  })

  it('strips fields that do not reach a pixel', () => {
    // DeckCardView carries cost/damage/legality; none of them is painted, and
    // every extra field would widen the cache key for nothing.
    const parsed = DeckSheetRequest.parse({ ...body, entries: [{ ...entry, cost: 4, legality: 'legal' }] })
    expect(parsed.entries[0]).not.toHaveProperty('cost')
    expect(parsed.entries[0]).not.toHaveProperty('legality')
  })

  it('pickSheetEntries keeps exactly the painted fields', () => {
    const view = { ...entry, cost: 4, damage: null, lesson: null, isOfficial: true, legality: 'legal' }
    expect(pickSheetEntries([view])).toEqual([entry])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w @revelio/core -- test/deck-sheet.test.ts`
Expected: FAIL — `DeckSheetRequest` is not exported.

- [ ] **Step 3: Add the schemas and the picker**

In `core/src/deck-sheet.ts`, with the types at the top of the file (after `DeckSheetEntry`), add the schema and derive the type from it rather than restating it:

```ts
// Upper bound on entries in one sheet. Geometry grows with the entry count, so
// an uncapped payload is a memory-exhaustion input; 400 is far past any legal
// deck (a 60-card main plus a sideboard is well under 100 distinct entries).
export const MAX_SHEET_ENTRIES = 400

// The painted half of a card. Deliberately narrower than DeckCardView: cost,
// damage, legality and the rest never reach a pixel, and every field that is
// in the request is a field in the cache key.
export const DeckSheetEntryInput = z.object({
  cardId: z.string().min(1).max(120),
  zone: DeckZone,
  quantity: z.number().int().min(1).max(999),
  name: z.string().min(1).max(300),
  setCode: z.string().max(60),
  types: z.array(z.string().max(60)).max(20),
  imageVersion: z.number().int().nonnegative().nullable(),
  orientation: z.string().max(20).nullable(),
})

// What the render service takes. The body is the sheet's whole input, which is
// what lets the service key its cache on a hash of it.
export const DeckSheetRequest = z.object({
  locale: z.enum(SHEET_LOCALES),
  // The caller's own ceiling on the encoded image, in bytes. /deck sends
  // Discord's attachment limit; a browser download sends none. The service
  // derives a pixel budget from it rather than owning a second cap.
  maxBytes: z.number().int().min(100_000).max(50_000_000).optional(),
  deck: z.object({ name: z.string().min(1).max(300), format: DeckFormat }),
  entries: z.array(DeckSheetEntryInput).min(1).max(MAX_SHEET_ENTRIES),
})

export type DeckSheetRequest = z.infer<typeof DeckSheetRequest>
```

With the exported functions:

```ts
/**
 * Narrows card views to the fields the sheet paints. Both callers hold
 * DeckCardView lists with a dozen fields the picture never uses; sending them
 * would widen the request, and with it the cache key, for nothing.
 */
export function pickSheetEntries(views: DeckSheetEntry[]): DeckSheetEntry[] {
  return views.map((v) => ({
    cardId: v.cardId, zone: v.zone, quantity: v.quantity, name: v.name,
    setCode: v.setCode, types: v.types, imageVersion: v.imageVersion ?? null,
    orientation: v.orientation ?? null,
  }))
}
```

Imports at the top of the file:

```ts
import { z } from 'zod'
import { DeckFormat, DeckZone } from './deck'
```

`DeckFormat` and `DeckZone` are currently imported here as types only (`import type { DeckFormat }`); they are Zod schemas as well, so the import becomes a value import and the existing `type DeckFormat` usages keep working.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @revelio/core -- test/deck-sheet.test.ts`
Expected: PASS.

- [ ] **Step 5: Prove the contract and the layout type cannot drift**

Add to the same describe block:

```ts
// layoutDeckSheet takes DeckSheetEntry[]; a parsed request must be usable as
// one without a cast, or the contract and the layout have drifted apart.
it('parses into the type the layout takes', () => {
  const parsed = DeckSheetRequest.parse(body)
  const entries: DeckSheetEntry[] = parsed.entries
  expect(computeSheetGeometry(layoutDeckSheet(parsed.deck, entries, sheetLabels('en'))).width).toBe(DECK_SHEET.width)
})
```

Run: `npm test -w @revelio/core && npm run typecheck -w @revelio/core && npm run lint`
Expected: PASS and clean. (If `DeckSheetEntry[]` needs a cast, the schema is wrong - fix the schema, not the test.)

- [ ] **Step 6: Commit**

```bash
git add core/src/deck-sheet.ts core/test/deck-sheet.test.ts
git commit -m "feat(core): define the deck sheet render contract"
```

---

### Task 3: The `@revelio/sheet` workspace

Scaffolding plus the env parser. No painter yet; the deliverable is a workspace that installs, typechecks, lints and runs its own tests.

**Files:**
- Create: `sheet/package.json`, `sheet/tsconfig.json`, `sheet/tsconfig.typecheck.json`, `sheet/.env.example`, `sheet/src/env.ts`, `sheet/test/env.test.ts`
- Modify: `package.json:4` (workspaces), `eslint.config.mjs:13` (files glob)

**Interfaces:**
- Produces: `SheetEnv` and `parseEnv(source?): SheetEnv` from `sheet/src/env.ts`. Task 6's server takes a `SheetEnv`.

- [ ] **Step 1: Create the workspace manifest and tsconfigs**

`sheet/package.json`:

```json
{
  "name": "@revelio/sheet",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "start": "tsx src/main.ts",
    "dev": "node --env-file-if-exists=.env.local --import tsx src/main.ts",
    "build": "node build.mjs",
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.typecheck.json"
  },
  "dependencies": {
    "@revelio/core": "*",
    "sharp": "^0.35.3",
    "zod": "^3.23.0"
  }
}
```

`sheet/tsconfig.json`:

```json
{ "extends": "../tsconfig.base.json", "include": ["src", "test"] }
```

`sheet/tsconfig.typecheck.json`:

```json
{ "extends": "./tsconfig.json", "include": ["src"] }
```

In `package.json:4`, add the workspace (after `"bot"`):

```json
  "workspaces": ["core", "db", "ingest", "search", "web", "bot", "sheet"],
```

In `eslint.config.mjs:13`, add it to the glob and fix the count in the comment above it ("Lints the five non-web workspaces" becomes "six"):

```js
    files: ["{core,search,db,ingest,bot,sheet}/**/*.{ts,tsx,mts,cts,js,mjs,cjs}"],
```

- [ ] **Step 2: Write the failing env test**

`sheet/test/env.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseEnv } from '../src/env'

const base = {
  IMAGE_BASE_URL: 'http://rustfs:9000/images',
  SHEET_TOKEN: 'a-token-at-least-16-chars',
}

describe('parseEnv', () => {
  it('defaults the port', () => {
    expect(parseEnv(base).PORT).toBe(8080)
  })

  it('takes a port from the environment', () => {
    expect(parseEnv({ ...base, PORT: '9999' }).PORT).toBe(9999)
  })

  it('requires an image base and a token', () => {
    for (const key of ['IMAGE_BASE_URL', 'SHEET_TOKEN'] as const) {
      const { [key]: _dropped, ...rest } = base
      let thrown: unknown
      try { parseEnv(rest) } catch (err) { thrown = err }
      expect((thrown as Error | undefined)?.message).toContain(key)
    }
  })

  // The message is the first thing a container log shows.
  it('never quotes a value in its error', () => {
    let thrown: unknown
    try { parseEnv({ ...base, SHEET_TOKEN: 'short' }) } catch (err) { thrown = err }
    expect((thrown as Error).message).not.toContain('short')
  })

  it('rejects an image base that is not a URL', () => {
    expect(() => parseEnv({ ...base, IMAGE_BASE_URL: 'rustfs:9000' })).toThrow()
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm install && npm test -w @revelio/sheet`
Expected: FAIL — `Cannot find module '../src/env'`. (`npm install` writes `sheet` into `package-lock.json`; commit the lockfile with this task.)

- [ ] **Step 4: Write the env parser**

`sheet/src/env.ts`:

```ts
import { z } from 'zod'

const Env = z.object({
  // The platform injects a port on most hosts; 8080 is the fallback for a bare
  // container run and for the local compose stack.
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  // Where this process GETs card art. One meaning, unlike the bot's two bases:
  // nothing here ever hands a URL to Discord, so there is nothing to split.
  // In a cluster this is the object store's internal service name.
  IMAGE_BASE_URL: z.string().url(),
  // Shared bearer token. The service has no public ingress; this is depth
  // behind that, and it is what keeps any pod on the network from spending the
  // render queue.
  SHEET_TOKEN: z.string().min(16),
})

export type SheetEnv = z.infer<typeof Env>

// Reports every problem at once and quotes only variable names, never values -
// this message is the first thing a container log shows.
export function parseEnv(source: Record<string, string | undefined> = process.env): SheetEnv {
  const parsed = Env.safeParse(source)
  if (parsed.success) return parsed.data
  const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
  throw new Error(`Invalid sheet environment:\n  ${problems.join('\n  ')}`)
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -w @revelio/sheet`
Expected: PASS (5 tests).

- [ ] **Step 6: Write the env example**

`sheet/.env.example`:

```
# @revelio/sheet - copy to .env.local and fill in.
#
# The deck sheet render service. It paints the picture of a deck for web's PNG
# export and the bot's /deck, and it is the only process that draws one.
#
# `npm run dev -w @revelio/sheet` loads .env.local directly; the compose
# service hardcodes the same values with container hostnames.

# ---- HTTP ----------------------------------------------------------------
PORT=8080
# Shared secret the callers send as `Authorization: Bearer <token>`. Any string
# of 16+ characters locally; generate a real one for a deployment and set the
# same value on web and bot.
SHEET_TOKEN=local-dev-sheet-token

# ---- Card art ------------------------------------------------------------
# Where THIS process fetches card images from, in-process. Not a URL anyone
# else sees: in a cluster this is the object store's internal service name, and
# the public bucket host is often unreachable from inside the cluster.
IMAGE_BASE_URL=http://localhost:9000/images
```

- [ ] **Step 7: Typecheck, lint, commit**

Run: `npm run typecheck -w @revelio/sheet && npm run lint`
Expected: clean.

```bash
git add package.json package-lock.json eslint.config.mjs sheet/package.json sheet/tsconfig.json sheet/tsconfig.typecheck.json sheet/.env.example sheet/src/env.ts sheet/test/env.test.ts
git commit -m "feat(sheet): add the render service workspace"
```

---

### Task 4: Port the text renderer

Alpine ships no fonts, so the sheet's type comes from a bundled Poppins face read through a one-directory `fonts.conf`. This is a verbatim move of the deployed branch's module; it has its own tests and no reason to change.

**Files:**
- Create: `sheet/src/text.ts`, `sheet/src/Poppins-SemiBold.ttf`, `sheet/src/fonts.conf`, `sheet/test/text.test.ts`

**Interfaces:**
- Produces: `renderText(text, style): Promise<RenderedText>`, `fitText(text, style, maxWidth): Promise<FittedText>`, types `TextStyle`, `RenderedText`, `FittedText`. Task 5's painter consumes all of them.

- [ ] **Step 1: Copy the module, the font and the fontconfig file off the branch**

```bash
git show fix/bot-deck-image-delivery:app/bot/src/images/text.ts > sheet/src/text.ts
git show fix/bot-deck-image-delivery:app/bot/src/images/fonts.conf > sheet/src/fonts.conf
git show fix/bot-deck-image-delivery:app/bot/src/images/Poppins-SemiBold.ttf > sheet/src/Poppins-SemiBold.ttf
git show fix/bot-deck-image-delivery:app/bot/test/text.test.ts > sheet/test/text.test.ts
```

- [ ] **Step 2: Fix the two comments that name the old home**

In `sheet/src/text.ts`, the header comment "resolved against this module in dev and against bot.mjs in the bundle" becomes "against sheet.mjs in the bundle". In `sheet/src/fonts.conf`, "Read by deck-image.ts" becomes "Read by text.ts". Nothing else changes.

In `sheet/test/text.test.ts`, fix the import path: `from '../src/images/text'` becomes `from '../src/text'`.

- [ ] **Step 3: Run the tests**

Run: `npm test -w @revelio/sheet -- test/text.test.ts`
Expected: PASS. A failure here means sharp cannot see the font file; check that the `.ttf` copied as binary (`ls -l sheet/src/Poppins-SemiBold.ttf` should be ~160 KB, not a few hundred bytes).

- [ ] **Step 4: Commit**

```bash
git add sheet/src/text.ts sheet/src/fonts.conf sheet/src/Poppins-SemiBold.ttf sheet/test/text.test.ts
git commit -m "feat(sheet): draw sheet text from a bundled Poppins face"
```

---

### Task 5: Port the painter, with one cap and a derived byte ceiling

The branch's painter is the production one and carries six rounds of measurement. It moves across whole; what changes is its input (a `DeckSheetRequest` instead of the bot's `PublicDeck`), its labels (core's catalog instead of the bot's `t()`), and its cap (one 12 Mpx constant plus a budget derived from the caller's byte ceiling, instead of a single hardcoded 5 Mpx).

**Files:**
- Create: `sheet/src/render.ts`, `sheet/test/render.test.ts`

**Interfaces:**
- Consumes: `DECK_SHEET`, `DECK_SHEET_COLORS`, `computeSheetGeometry`, `layoutDeckSheet`, `sheetLabels`, `imageKey`, `thumbKey`, `imageUrl`, `mapLimit`, types `DeckSheetCard`, `PositionedSection`, `SheetGeometry`, `DeckSheetRequest` from `@revelio/core`; `fitText`, `renderText` from Task 4.
- Produces:
  - `MAX_SHEET_PIXELS: 12_000_000`, `PNG_BYTES_PER_PIXEL: 1.6`
  - `pixelBudget(maxBytes?: number): number`
  - `sheetScale(geom: SheetGeometry, budget: number): number`
  - `usesFullArt(s: number): boolean`
  - `renderSheet(req: DeckSheetRequest, opts: SheetRenderOptions): Promise<SheetRender>`
  - `type SheetRender = { body: Buffer; contentType: 'image/png' | 'image/webp'; pixels: number; scale: number; fullArt: boolean; dropped: number; distinct: number }`
  - `type SheetRenderOptions = { imageBase: string; fetchBudgetMs?: number }`

  Task 6's server calls `renderSheet` and puts `pixels`, `scale` and `dropped` into response headers; Phase 4 keys its cache beside it.

- [ ] **Step 1: Move the painter off the branch**

```bash
git show fix/bot-deck-image-delivery:app/bot/src/images/deck-image.ts > sheet/src/render.ts
```

- [ ] **Step 2: Rewrite the imports and the types block**

Replace everything from the first `import` down to and including the `MAX_IN_FLIGHT` constant with:

```ts
import sharp, { type OverlayOptions } from 'sharp'
import {
  DECK_SHEET,
  DECK_SHEET_COLORS,
  computeSheetGeometry,
  imageKey,
  imageUrl,
  layoutDeckSheet,
  mapLimit,
  sheetLabels,
  thumbKey,
  type DeckSheetCard,
  type DeckSheetRequest,
  type PositionedSection,
  type SheetGeometry,
} from '@revelio/core'
import { fitText, renderText, type RenderedText } from './text'

export type SheetRenderOptions = {
  imageBase: string
  // Test seam, so a test can spend the budget without waiting out FETCH_BUDGET_MS.
  fetchBudgetMs?: number
}

// The rendered sheet and everything the caller needs to say what it got. The
// content type travels with the bytes because the two can disagree: the WebP
// fallback is still a deck sheet, and media.discordapp.net transcodes by the
// extension the uploader picks from this.
export type SheetRender = {
  body: Buffer
  contentType: 'image/png' | 'image/webp'
  pixels: number
  scale: number
  fullArt: boolean
  dropped: number
  distinct: number
}

// A card's picture, or why its box has none. `failure: null` is a card with no
// stored image at all, which is normal and not worth a log line; a string is a
// failure and is.
type CardImageResult = { body: Buffer } | { failure: string | null }

// Matches web's old browser painter. The full card image is ~317 KB against a
// thumb's ~23 KB, so the 5s that covered a thumb does not cover this.
const FETCH_TIMEOUT_MS = 10_000
// Wall clock for the whole fetch phase. A per-request timeout bounds one card,
// not the render: at MAX_IN_FLIGHT a 200-card deck against a black-holed host
// serialises 25 waves of FETCH_TIMEOUT_MS, so a render would sit for four
// minutes before answering. Past this, the cards still outstanding draw as
// placeholders.
const FETCH_BUDGET_MS = 30_000
const MAX_IN_FLIGHT = 8
```

- [ ] **Step 3: Replace the cap with one constant and a derived budget**

Replace the `MAX_SHEET_PIXELS` constant and the `sheetScale` function with:

```ts
// Upper bound on the painted sheet, in device pixels, and the only pixel cap in
// the system - the browser painter's per-axis MAX_CANVAS_DIM went away with the
// canvas. Two things scale with canvas area and this bounds both: peak RSS, at
// roughly 215 MB plus 28 MB per megapixel, and the encoded PNG, at roughly
// 1.6 MB per megapixel. At 12 Mpx that is ~551 MB, which is what the pod's
// 768Mi limit is sized for. Not an env var on purpose: it is one half of a pair
// with that limit, and a value an operator can raise on its own will be raised
// past it.
export const MAX_SHEET_PIXELS = 12_000_000
// Measured bytes of PNG per megapixel of sheet, on the deployed branch and
// against real card art. Used to turn a caller's byte ceiling into a pixel
// budget; art content moves the real figure around it, which is why the encoded
// size is measured afterwards rather than trusted.
export const PNG_BYTES_PER_MEGAPIXEL = 1_600_000

/**
 * Pixels this render may paint. The cap, or less when the caller has stated a
 * byte ceiling it has to fit - /deck sends Discord's attachment limit, a
 * browser download sends none. This is what replaced the bot's second cap: the
 * 5 Mpx it used to hardcode was always a consequence of a 9 MB attachment,
 * not a property of the sheet.
 */
export function pixelBudget(maxBytes?: number): number {
  if (maxBytes === undefined) return MAX_SHEET_PIXELS
  return Math.min(MAX_SHEET_PIXELS, (maxBytes / PNG_BYTES_PER_MEGAPIXEL) * 1_000_000)
}

/**
 * Device pixels per layout pixel for this sheet. DECK_SHEET.scale unless the
 * geometry would exceed the budget, in which case both axes shrink by the same
 * factor so the picture keeps its proportions.
 */
export function sheetScale(geom: SheetGeometry, budget: number): number {
  return Math.min(DECK_SHEET.scale, Math.sqrt(budget / (geom.width * geom.height)))
}
```

Leave `usesFullArt`, `px`, `canvasSize`, `chromeSvg`, `badgeSvg`, `centered`, `fetchCardImage`, `cardImage`, `cardOverlays` and `textOverlays` exactly as they are. Delete `labelsFor` (core's `sheetLabels` replaces it) and the now-unused `OTHER_GROUP`/`t`/`DeckSheetLabels` imports.

- [ ] **Step 4: Rewrite the entry point**

Replace `renderDeckImage` with:

```ts
/**
 * The deck as a picture: the sheet web's "Export PNG" downloads and the Discord
 * bot posts for /deck, drawn once here instead of twice in two runtimes.
 * Grouping, geometry and colours come from @revelio/core, so this process owns
 * no layout.
 *
 * The art source is picked per sheet by usesFullArt: full card images while the
 * boxes are big enough for a thumb to show its own compression, the thumbs once
 * the pixel budget has shrunk them. An image that cannot be fetched or decoded
 * leaves the placeholder box with the card name, so a missing image never costs
 * the whole picture.
 */
export async function renderSheet(req: DeckSheetRequest, opts: SheetRenderOptions): Promise<SheetRender> {
  const layout = layoutDeckSheet(req.deck, req.entries, sheetLabels(req.locale))
  const geom = computeSheetGeometry(layout)
  const s = sheetScale(geom, pixelBudget(req.maxBytes))
  const { w, h } = canvasSize(geom, s)

  const [cards, text] = await Promise.all([
    cardOverlays(geom.sections, opts.imageBase, s, opts.fetchBudgetMs ?? FETCH_BUDGET_MS),
    textOverlays(geom, layout.title, s),
  ])

  // clone() because a sharp pipeline cannot be consumed twice: without it the
  // fallback would re-encode a finished pipeline and throw. Encoding the
  // composite once into raw pixels and feeding both encoders from it was
  // measured and rejected - it pays 22ms and 9 MB on the path that always runs
  // to save 170ms on the one that should never fire.
  const sheet = sharp(chromeSvg(geom, s)).composite([...cards.overlays, { input: badgeSvg(geom, s) }, ...text])
  const common = { pixels: w * h, scale: s, fullArt: usesFullArt(s), dropped: cards.dropped, distinct: cards.distinct }

  // PNG so the file people pull out of Discord, or out of their downloads, is
  // lossless and ordinary. The card images it is drawn from are already lossy,
  // so webp q90 was a second generation of loss on top of them for no gain.
  const png = await sheet.clone().png({ compressionLevel: 6 }).toBuffer()
  if (req.maxBytes === undefined || png.length <= req.maxBytes) {
    return { body: png, contentType: 'image/png', ...common }
  }

  console.warn(`sheet: ${png.length} byte PNG over the ${req.maxBytes} byte ceiling, falling back to WebP`)
  const webp = await sheet.clone().webp({ quality: 90 }).toBuffer()
  // Measured again rather than assumed: q90 is normally a fifth of the PNG, but
  // an attachment Discord rejects fails the whole interaction, and /deck
  // answers a failed render with the list embed it can always draw.
  if (webp.length > req.maxBytes) {
    throw new Error(`sheet: ${webp.length} byte WebP still over the ${req.maxBytes} byte ceiling`)
  }
  return { body: webp, contentType: 'image/webp', ...common }
}
```

- [ ] **Step 5: Write the tests**

`sheet/test/render.test.ts` — ported from the branch's `bot/test/deck-image.test.ts`, with the request shape in place of `PublicDeck` and the new budget cases added:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import sharp from 'sharp'
import {
  DECK_SHEET, computeSheetGeometry, layoutDeckSheet, sheetLabels,
  type DeckSheetEntry, type DeckSheetRequest,
} from '@revelio/core'
import {
  MAX_SHEET_PIXELS, pixelBudget, renderSheet, sheetScale, usesFullArt,
} from '../src/render'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

function entry(cardId: string, zone: DeckSheetEntry['zone'], types: string[], extra: Partial<DeckSheetEntry> = {}): DeckSheetEntry {
  return {
    cardId, zone, quantity: 2, types, name: `Card ${cardId}`, setCode: 'base',
    imageVersion: 1, orientation: null, ...extra,
  }
}

const entries: DeckSheetEntry[] = [
  entry('harry', 'character', ['character'], { quantity: 1, orientation: 'horizontal' }),
  ...Array.from({ length: 8 }, (_, i) => entry(`creature${i}`, 'main', ['creature'])),
  entry('lesson', 'main', ['lesson'], { quantity: 20 }),
  entry('noimg', 'main', ['spell'], { imageVersion: null, name: 'Fred & <George>' }),
  entry('side', 'sideboard', ['item']),
]

const req: DeckSheetRequest = {
  locale: 'en', deck: { name: 'Charms Aggro', format: 'classic' }, entries,
}
const opts = { imageBase: 'https://img.test' }

// 200 distinct main-deck cards: far past the budget, so the clamp has to bite.
const hugeReq: DeckSheetRequest = {
  ...req, entries: Array.from({ length: 200 }, (_, i) => entry(`creature${i}`, 'main', ['creature'])),
}

function sizeOf(r: DeckSheetRequest) {
  const geom = computeSheetGeometry(layoutDeckSheet(r.deck, r.entries, sheetLabels(r.locale)))
  const s = sheetScale(geom, pixelBudget(r.maxBytes))
  return [Math.floor(geom.width * s), Math.floor(geom.height * s)]
}

// A real WebP, so resize and rotate both run. Smaller than a stored card image
// (745x1039) on purpose: the renderer downsamples either way, and the tests
// would pay for the difference on every one of the 200 cards.
async function art(): Promise<Uint8Array> {
  return new Uint8Array(await sharp({
    create: { width: 300, height: 420, channels: 3, background: '#6E66C9' },
  }).webp().toBuffer())
}

function recordingFetch(body: Uint8Array): string[] {
  const urls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(String(url))
    return new Response(body, { status: 200 })
  }))
  return urls
}

describe('pixelBudget', () => {
  it('is the cap when the caller states no ceiling', () => {
    expect(pixelBudget()).toBe(MAX_SHEET_PIXELS)
  })

  // 9 MB of attachment at 1.6 MB per megapixel. This is the number the bot used
  // to hardcode as a second cap.
  it('derives a smaller budget from a byte ceiling', () => {
    expect(Math.round(pixelBudget(9_000_000))).toBe(5_625_000)
  })

  it('never exceeds the cap however large the ceiling', () => {
    expect(pixelBudget(50_000_000)).toBe(MAX_SHEET_PIXELS)
  })
})

describe('sheetScale', () => {
  it('renders a small deck at the full device scale', () => {
    const geom = computeSheetGeometry(layoutDeckSheet(req.deck, req.entries, sheetLabels('en')))
    expect(sheetScale(geom, MAX_SHEET_PIXELS)).toBe(DECK_SHEET.scale)
  })

  it('shrinks both axes by one factor past the budget', () => {
    const geom = computeSheetGeometry(layoutDeckSheet(hugeReq.deck, hugeReq.entries, sheetLabels('en')))
    const s = sheetScale(geom, MAX_SHEET_PIXELS)
    expect(s).toBeLessThan(DECK_SHEET.scale)
    expect(geom.width * s * geom.height * s).toBeLessThanOrEqual(MAX_SHEET_PIXELS)
  })
})

describe('usesFullArt', () => {
  it('draws from full art at the full scale and from thumbs once shrunk', () => {
    expect(usesFullArt(DECK_SHEET.scale)).toBe(true)
    expect(usesFullArt(1)).toBe(false)
  })
})

describe('renderSheet', () => {
  it('renders a PNG at the shared sheet geometry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await art(), { status: 200 })))
    const out = await renderSheet(req, opts)
    const meta = await sharp(out.body).metadata()
    expect(meta.format).toBe('png')
    expect(out.contentType).toBe('image/png')
    expect([meta.width, meta.height]).toEqual(sizeOf(req))
    expect(out.pixels).toBe(sizeOf(req)[0] * sizeOf(req)[1])
  })

  it('falls back to WebP rather than exceed a stated ceiling', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await art(), { status: 200 })))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Between this fixture's PNG and its WebP, so the fallback runs on a small
    // deck rather than needing a huge one, and then fits.
    const out = await renderSheet({ ...req, maxBytes: 200_000 }, opts)
    expect((await sharp(out.body).metadata()).format).toBe('webp')
    expect(out.contentType).toBe('image/webp')
    expect(warn.mock.calls.flat().join(' ')).toContain('falling back to WebP')
  })

  it('throws rather than hand back a WebP that is over the ceiling too', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await art(), { status: 200 })))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let thrown: unknown
    try { await renderSheet({ ...req, maxBytes: 100_000 }, opts) } catch (err) { thrown = err }
    expect((thrown as Error | undefined)?.message).toMatch(/still over the 100000 byte ceiling/)
  })

  it('requests full art for an ordinary deck and never fetches a card without an image', async () => {
    const urls = recordingFetch(await art())
    await renderSheet(req, opts)
    expect(urls).toContain('https://img.test/cards/harry.1.webp')
    expect(urls.some((url) => url.includes('/cards/thumb/'))).toBe(false)
    expect(urls.some((url) => url.includes('noimg'))).toBe(false)
  })

  it('drops to thumbs once the budget has shrunk the boxes', async () => {
    const urls = recordingFetch(await art())
    const out = await renderSheet(hugeReq, opts)
    expect(urls).toHaveLength(200)
    expect(urls.every((url) => url.includes('/cards/thumb/'))).toBe(true)
    expect(out.fullArt).toBe(false)
  }, 60_000)

  it('still renders when every card image fails, and counts the drops', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = await renderSheet(req, opts)
    expect((await sharp(out.body).metadata()).format).toBe('png')
    expect(out.dropped).toBe(out.distinct - 1) // 'noimg' has no image to drop
    expect(warn.mock.calls.flat().join(' ')).toContain('HTTP 500')
  })

  it('stops fetching once the budget is spent and says so once', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await renderSheet(req, { ...opts, fetchBudgetMs: 50 })
    const logged = warn.mock.calls.flat().join(' ')
    expect(logged).toContain('fetch budget spent')
    expect(logged.match(/never requested/g)).toHaveLength(1)
  })

  it('paints a name that looks like markup as that name', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    // A placeholder box draws the card name through Pango and the chrome SVG.
    // Neither may treat it as markup - the render must succeed and stay a
    // picture of the string.
    const nasty = { ...req, entries: [entry('x', 'main', ['spell'], { name: '</text><script>&' })] }
    const out = await renderSheet(nasty, opts)
    expect((await sharp(out.body).metadata()).format).toBe('png')
  })

  it('renders a German sheet from core labels alone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await art(), { status: 200 })))
    const out = await renderSheet({ ...req, locale: 'de' }, opts)
    // Same geometry, same bytes-ish: what matters is that no labels were passed
    // in and the render succeeded.
    expect((await sharp(out.body).metadata()).format).toBe('png')
  })
})
```

- [ ] **Step 6: Run the tests**

Run: `npm test -w @revelio/sheet -- test/render.test.ts`
Expected: PASS. The 200-entry case takes ~20-40 s; that is why it carries its own 60 s timeout.

- [ ] **Step 7: Prove the markup test bites**

Temporarily remove the `escapeMarkup(...)` call in `sheet/src/text.ts` (pass `text` straight through), re-run `test/render.test.ts`, and confirm the markup test fails. Restore it.

Expected: FAIL while unescaped, PASS after restoring. A test that passes either way is not testing anything.

- [ ] **Step 8: Typecheck, lint, commit**

Run: `npm run typecheck -w @revelio/sheet && npm run lint`

```bash
git add sheet/src/render.ts sheet/test/render.test.ts
git commit -m "feat(sheet): paint the deck sheet under one pixel cap"
```

---

### Task 6: The HTTP surface

One route, a bearer check, a body limit, a render queue and the headers that say what came back. `node:http` rather than a framework: the bundle is the runtime image, and a framework would be the largest thing in it.

**Files:**
- Create: `sheet/src/server.ts`, `sheet/src/main.ts`, `sheet/test/server.test.ts`

**Interfaces:**
- Consumes: `parseEnv`/`SheetEnv` (Task 3), `renderSheet`/`SheetRender` (Task 5), `DeckSheetRequest` (Task 2).
- Produces: `createSheetServer(env: SheetEnv): http.Server`, `MAX_BODY_BYTES: 262_144`, `MAX_QUEUED: 4`. Phase 2's bot client and Phase 3's web route call this surface over HTTP; Phase 4 adds the cache inside it.

- [ ] **Step 1: Write the failing tests**

`sheet/test/server.test.ts`:

```ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import type { AddressInfo } from 'node:net'
import sharp from 'sharp'
import type { DeckSheetRequest } from '@revelio/core'
import { createSheetServer } from '../src/server'

const env = { PORT: 0, IMAGE_BASE_URL: 'https://img.test', SHEET_TOKEN: 'a-token-at-least-16-chars' }
const server = createSheetServer(env)
let base = ''

const body: DeckSheetRequest = {
  locale: 'en',
  deck: { name: 'Charms Aggro', format: 'classic' },
  entries: [{
    // No image version: every card draws as a placeholder, so these tests make no
    // outbound request and still exercise a real render. Phase 4's cache tests
    // override it where a fetch is the point.
    cardId: 'harry', zone: 'main', quantity: 2, name: 'Harry Potter',
    setCode: 'base', types: ['character'], imageVersion: null, orientation: null,
  }],
}

async function post(payload: unknown, token = env.SHEET_TOKEN, init: RequestInit = {}) {
  return fetch(`${base}/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
    ...init,
  })
}

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

describe('the render service', () => {
  it('answers a health check without a token', async () => {
    const res = await fetch(`${base}/healthz`)
    expect(res.status).toBe(200)
  })

  it('renders a PNG and describes it in headers', async () => {
    const res = await post(body)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(Number(res.headers.get('x-sheet-pixels'))).toBeGreaterThan(0)
    expect(res.headers.get('x-sheet-scale')).toBeTruthy()
    expect((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).format).toBe('png')
  })

  it('rejects a missing or wrong token without rendering', async () => {
    expect((await post(body, 'wrong-token-but-long-enough')).status).toBe(401)
    const res = await fetch(`${base}/render`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    expect(res.status).toBe(401)
  })

  it('rejects a body that is not a sheet request', async () => {
    expect((await post({ locale: 'fr', deck: body.deck, entries: body.entries })).status).toBe(400)
    expect((await post({ ...body, entries: [] })).status).toBe(400)
    expect((await post('not json at all')).status).toBe(400)
  })

  it('rejects an oversized body before parsing it', async () => {
    const huge = { ...body, deck: { ...body.deck, name: 'x'.repeat(300_000) } }
    expect((await post(huge)).status).toBe(413)
  })

  it('404s anything but the two routes', async () => {
    expect((await fetch(`${base}/`)).status).toBe(404)
    expect((await fetch(`${base}/render`)).status).toBe(404) // GET
  })

  it('sheds load rather than render two sheets at once', async () => {
    // One render in flight, four queued, everything past that is a 503 - which
    // is the same path the callers take when the service is down.
    const flight = Array.from({ length: 12 }, () => post(body))
    const statuses = (await Promise.all(flight)).map((r) => r.status)
    expect(statuses).toContain(200)
    expect(statuses).toContain(503)
  }, 60_000)
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w @revelio/sheet -- test/server.test.ts`
Expected: FAIL — `Cannot find module '../src/server'`.

- [ ] **Step 3: Write the server**

`sheet/src/server.ts`:

```ts
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { DeckSheetRequest } from '@revelio/core'
import type { SheetEnv } from './env'
import { renderSheet } from './render'

// Enough for 400 entries of a few hundred bytes each, with room to spare, and
// small enough that a hostile body is read in one go and dropped.
export const MAX_BODY_BYTES = 262_144
// One render at a time, because the pod's memory limit is sized for one. Four
// waiting is a short burst absorbed; past that the answer is 503, which every
// caller already handles as "no picture this time".
export const MAX_QUEUED = 4

function authorized(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization ?? ''
  const prefix = 'Bearer '
  if (!header.startsWith(prefix)) return false
  const given = Buffer.from(header.slice(prefix.length))
  const want = Buffer.from(token)
  // Length is compared first because timingSafeEqual throws on a mismatch; the
  // length of a token is not the secret.
  return given.length === want.length && timingSafeEqual(given, want)
}

/**
 * The request body, or null when it is too large. Read with a running total
 * rather than by Content-Length: a chunked body carries no length, and a
 * declared one is a claim, not a limit.
 */
async function readBody(req: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY_BYTES) return null
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function send(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
  res.end(body)
}

export function createSheetServer(env: SheetEnv): Server {
  let inFlight = 0
  let queued = 0

  async function render(res: ServerResponse, body: string): Promise<void> {
    let payload: unknown
    try {
      payload = JSON.parse(body)
    } catch {
      send(res, 400, 'malformed JSON')
      return
    }
    const parsed = DeckSheetRequest.safeParse(payload)
    if (!parsed.success) {
      // Field paths, never values: a card name is user input and this goes to a log.
      send(res, 400, parsed.error.issues.map((i) => i.path.join('.')).join(', '))
      return
    }

    if (inFlight > 0 && queued >= MAX_QUEUED) {
      send(res, 503, 'render queue full')
      return
    }
    queued += 1
    await queue
    queued -= 1
    inFlight += 1
    const done = (async () => {
      try {
        const out = await renderSheet(parsed.data, { imageBase: env.IMAGE_BASE_URL })
        res.writeHead(200, {
          'content-type': out.contentType,
          'content-length': String(out.body.length),
          'cache-control': 'no-store',
          'x-sheet-pixels': String(out.pixels),
          'x-sheet-scale': out.scale.toFixed(3),
          'x-sheet-dropped': String(out.dropped),
          'x-sheet-full-art': String(out.fullArt),
        })
        res.end(out.body)
      } catch (err) {
        console.error('sheet: render failed:', err instanceof Error ? err.message : err)
        send(res, 500, 'render failed')
      } finally {
        inFlight -= 1
      }
    })()
    queue = done.catch(() => {})
    await done
  }

  // The queue is one promise chain: each render awaits the previous one, so at
  // most one composite is resident at a time whatever the socket count is.
  let queue: Promise<void> = Promise.resolve()

  return createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/healthz') {
      send(res, 200, 'ok')
      return
    }
    if (req.method !== 'POST' || req.url !== '/render') {
      send(res, 404, 'not found')
      return
    }
    if (!authorized(req, env.SHEET_TOKEN)) {
      send(res, 401, 'unauthorized')
      return
    }
    void readBody(req).then((body) => {
      if (body === null) {
        send(res, 413, 'body too large')
        return undefined
      }
      return render(res, body)
    }).catch((err) => {
      console.error('sheet: request failed:', err instanceof Error ? err.message : err)
      if (!res.headersSent) send(res, 500, 'request failed')
    })
  })
}
```

Note on ordering: `let queue` must be declared above `render`, which closes over it. Move the declaration to the top of `createSheetServer` when wiring this up - the block above shows it below only to keep the queue's comment next to it.

`sheet/src/main.ts`:

```ts
import { parseEnv } from './env'
import { createSheetServer } from './server'

// No `process.argv[1] === fileURLToPath(import.meta.url)` guard: inside an
// esbuild bundle both sides are the bundle itself, so a guard here would fire
// for the one entry point that must always run. See bot/src/main.ts.
async function main(): Promise<void> {
  const env = parseEnv()
  const server = createSheetServer(env)
  await new Promise<void>((resolve) => server.listen(env.PORT, resolve))
  console.log(`sheet: listening on ${env.PORT}`)

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      // Stops accepting and lets the render in flight finish into its socket.
      server.close(() => process.exit(0))
    })
  }
}

main().catch((err) => {
  console.error('sheet failed to start:', err instanceof Error ? err.message : err)
  process.exit(1)
})
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -w @revelio/sheet`
Expected: PASS, all four suites (env, text, render, server).

- [ ] **Step 5: Run it by hand against the local stack**

```bash
docker compose up -d rustfs
cp sheet/.env.example sheet/.env.local
npm run dev -w @revelio/sheet
```

In another shell:

```bash
curl -s -o /tmp/sheet.png -w '%{http_code} %{size_download}\n' \
  -H 'authorization: Bearer local-dev-sheet-token' \
  -H 'content-type: application/json' \
  --data '{"locale":"en","deck":{"name":"Smoke","format":"classic"},"entries":[{"cardId":"x","zone":"main","quantity":2,"name":"A Card","setCode":"base","types":["spell"],"imageVersion":null,"orientation":null}]}' \
  http://localhost:8080/render
file /tmp/sheet.png
```

Expected: `200 <bytes>` and `PNG image data`. The card draws as a placeholder box (no such card in the bucket), which is the correct behaviour for a missing image.

- [ ] **Step 6: Typecheck, lint, commit**

Run: `npm run typecheck -w @revelio/sheet && npm run lint`

```bash
git add sheet/src/server.ts sheet/src/main.ts sheet/test/server.test.ts
git commit -m "feat(sheet): serve one render at a time over HTTP"
```

---

### Task 7: Bundle, image, compose

The runtime image is one esbuild bundle plus sharp, exactly like `bot`'s and for the same reasons. Every trap that Dockerfile documents applies here unchanged.

**Files:**
- Create: `sheet/build.mjs`, `sheet/Dockerfile`
- Modify: `docker-compose.yml` (new `sheet` service), `bot/Dockerfile:12` (deps stage manifest list)

**Interfaces:**
- Consumes: `sheet/src/main.ts` (Task 6) as the bundle entry.
- Produces: `sheet/dist/sheet.mjs` + the two font assets beside it; image `revelio-sheet:local`.

- [ ] **Step 1: Write the bundler**

`sheet/build.mjs`:

```js
import { copyFile, mkdir } from 'node:fs/promises'
import * as esbuild from 'esbuild'

// esbuild's ESM output wraps dynamic requires in a shim that gates on
// `typeof require !== "undefined"` and otherwise throws
// 'Dynamic require of "node:events" is not supported'. Parts of the dependency
// tree are CJS, so without a real `require` bound at module top level the
// bundle builds clean and dies at import time. This banner defines that binding
// one line above the shim. It is aliased to __cr because banner text is
// prepended raw and is invisible to esbuild's renaming: a bare `createRequire`
// could collide with a bundled identifier of the same name.
const banner = {
  js: "import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);",
}

try {
  await esbuild.build({
    entryPoints: ['src/main.ts'],
    outfile: 'dist/sheet.mjs',
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    banner,
    // sharp is a native module: its .node binary and libvips cannot be inlined
    // into a bundle, so it stays an import and the Dockerfile installs it
    // alongside sheet.mjs. Everything else in the tree is JavaScript.
    external: ['sharp'],
    logLevel: 'warning',
  })

  // text.ts resolves both of these against import.meta.url, which inside the
  // bundle is dist/sheet.mjs.
  await mkdir('dist', { recursive: true })
  for (const asset of ['Poppins-SemiBold.ttf', 'fonts.conf']) {
    await copyFile(`src/${asset}`, `dist/${asset}`)
  }
} catch (err) {
  // A BuildFailure carries an `errors` array and esbuild has already printed it.
  // Anything else (a host/binary version mismatch from a partial install, say)
  // is never logged, so it would exit 1 with no output at all.
  if (!err?.errors) console.error(err)
  process.exit(1)
}
```

- [ ] **Step 2: Run the build**

Run: `npm run build -w @revelio/sheet && ls -l sheet/dist`
Expected: `sheet.mjs`, `Poppins-SemiBold.ttf`, `fonts.conf`.

- [ ] **Step 3: Write the Dockerfile**

`sheet/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1

# --- deps: reproducible install of the workspace (esbuild is a root dev dep) ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY core/package.json ./core/package.json
COPY db/package.json ./db/package.json
COPY search/package.json ./search/package.json
COPY ingest/package.json ./ingest/package.json
COPY web/package.json ./web/package.json
COPY bot/package.json ./bot/package.json
COPY sheet/package.json ./sheet/package.json
RUN npm ci

# --- build: bundle the service into a single file ---
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json ./
COPY core ./core
COPY sheet ./sheet
RUN npm run build -w @revelio/sheet

# A bundle inlines every imported module, so a module-level "am I the entry
# script?" guard sees the bundle as itself and can exit before main() runs. The
# 'sheet failed to start:' prefix is printed only by main()'s catch handler, so
# requiring it here fails the build if that ever regresses. Empty env, no
# network: the run dies at env parsing.
RUN env -i node sheet/dist/sheet.mjs 2>&1 | grep -q 'sheet failed to start:'

# sharp is the one dependency the bundle cannot inline (native .node + libvips).
# Install it alone, at the exact version the workspace resolved, so the runtime
# image carries sharp and its musl libvips and nothing else from the toolchain.
RUN npm install --prefix /sharp --omit=dev --no-package-lock \
      sharp@$(node -p "require('/app/node_modules/sharp/package.json').version")

# --- runtime: the bundle and nothing else ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S sheet -u 1001
COPY --from=build --chown=sheet:nodejs /sharp/node_modules ./node_modules
COPY --from=build --chown=sheet:nodejs /app/sheet/dist/sheet.mjs ./sheet.mjs
COPY --from=build --chown=sheet:nodejs /app/sheet/dist/Poppins-SemiBold.ttf /app/sheet/dist/fonts.conf ./

# fontconfig writes a cache on its first text render and warns on every boot
# without somewhere to put it. One font makes the cache tiny; the warning is
# what it would cost.
RUN mkdir -p /var/cache/fontconfig && chown sheet:nodejs /var/cache/fontconfig

# The sheet is drawn with sharp text and a bundled font, and either missing
# would build clean and fail on the first render. The font is checked by its own
# presence rather than by how it renders: a fontfile libvips cannot open is not
# an error, it silently substitutes. The render then proves the native binary
# loads, and that an unmatched family resolves to Poppins - which it can only do
# while fonts.conf leaves Poppins the one family fontconfig knows.
RUN test -s /app/Poppins-SemiBold.ttf && test -s /app/fonts.conf
RUN node -e "const s=require('sharp');process.env.FONTCONFIG_FILE='/app/fonts.conf';\
const d=f=>s({text:{text:'revelio',font:f,fontfile:'/app/Poppins-SemiBold.ttf',rgba:true}}).raw().toBuffer();\
Promise.all([d('Poppins SemiBold 24'),d('Nonexistent SemiBold 24')])\
.then(([a,b])=>{if(!a.equals(b))throw new Error('bundled Poppins did not render')})"

USER sheet
EXPOSE 8080
CMD ["node", "sheet.mjs"]
```

- [ ] **Step 4: Add the manifest to `bot`'s deps stage**

`bot/Dockerfile` enumerates every workspace manifest before `npm ci`; add one line after `COPY bot/package.json ./bot/package.json`:

```dockerfile
COPY sheet/package.json ./sheet/package.json
```

`web/Dockerfile` and `ingest/Dockerfile` do **not** list `bot/package.json` today and build fine, so they need no change. Step 6 verifies that.

- [ ] **Step 5: Build the image and check its size**

Run:

```bash
docker build -f sheet/Dockerfile -t revelio-sheet:local .
docker images revelio-sheet:local
```

Expected: a successful build (the font proof and the entry-guard grep both pass) at roughly 195 MB, matching the bot's current size - it is the same bundle-plus-sharp shape.

- [ ] **Step 6: Verify the other images still build**

Run: `docker build -f web/Dockerfile --build-arg NEXT_PUBLIC_IMAGE_BASE_URL=http://localhost:9000/images -t revelio-web:check . && docker build -f ingest/Dockerfile -t revelio-ingest:check .`
Expected: both succeed. A failure mentioning `@revelio/sheet` means that Dockerfile needs the manifest line too; add it there and re-run.

- [ ] **Step 7: Add the compose service**

In `docker-compose.yml`, after the `bot` service:

```yaml
  sheet:
    image: revelio-sheet:local
    build:
      context: .
      dockerfile: sheet/Dockerfile
    # No profile: unlike the bot, this needs no real credentials, so a bare
    # `docker compose up` can bring it up with the rest of the stack.
    depends_on:
      rustfs:
        condition: service_healthy
    environment:
      # Card art is fetched in-process, so this is the container-internal host -
      # localhost:9000 inside this container is this container.
      IMAGE_BASE_URL: http://rustfs:9000/images
      SHEET_TOKEN: local-dev-sheet-token
    ports:
      - "127.0.0.1:8080:8080"   # so a host-run web and bot can reach it
    restart: "no"
```

- [ ] **Step 8: Bring it up and render through compose**

Run:

```bash
docker compose up -d --build sheet
curl -s -o /tmp/sheet-compose.png -w '%{http_code}\n' \
  -H 'authorization: Bearer local-dev-sheet-token' -H 'content-type: application/json' \
  --data '{"locale":"de","deck":{"name":"Compose","format":"revival"},"entries":[{"cardId":"x","zone":"main","quantity":1,"name":"Eine Karte","setCode":"base","types":["spell"],"imageVersion":null,"orientation":null}]}' \
  http://localhost:8080/render
file /tmp/sheet-compose.png
docker compose logs sheet | tail -5
```

Expected: `200`, a PNG, and a log with no fontconfig warning.

- [ ] **Step 9: Commit**

```bash
git add sheet/build.mjs sheet/Dockerfile bot/Dockerfile docker-compose.yml
git commit -m "build(sheet): ship the render service as a bundle and an image"
```

---

### Task 8: Publish pipeline and docs

**Files:**
- Modify: `.github/workflows/publish.yml` (filter + `build-sheet` job)
- Modify: `CLAUDE.md` (workspace count, architecture list, a `sheet` section)

**Interfaces:** none - this task ships wiring and prose.

- [ ] **Step 1: Add the paths filter**

In `.github/workflows/publish.yml`, add `sheet` to the `changes` job's outputs and filters:

```yaml
    outputs:
      web: ${{ steps.filter.outputs.web }}
      ingest: ${{ steps.filter.outputs.ingest }}
      bot: ${{ steps.filter.outputs.bot }}
      sheet: ${{ steps.filter.outputs.sheet }}
```

```yaml
            sheet:
              - *shared
              - 'app/sheet/**'
```

- [ ] **Step 2: Add the build job**

After `build-bot`, mirroring it exactly (its own cache scope, its own redeploy hook):

```yaml
  build-sheet:
    needs: changes
    if: needs.changes.outputs.sheet == 'true' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository_owner }}/revelio-sheet
          tags: |
            type=raw,value=latest
            type=sha,prefix=sha-,format=short

      - uses: docker/build-push-action@v6
        with:
          context: app
          file: app/sheet/Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha,scope=sheet
          cache-to: type=gha,mode=max,scope=sheet

      # One webhook URL redeploys one service, so this gets its own secret like
      # web and bot do.
      - name: Trigger sheet redeploy webhook
        env:
          SHEET_REDEPLOY_WEBHOOK_URL: ${{ secrets.SHEET_REDEPLOY_WEBHOOK_URL }}
        run: |
          if [ -z "$SHEET_REDEPLOY_WEBHOOK_URL" ]; then
            echo "::notice::SHEET_REDEPLOY_WEBHOOK_URL not set; skipping sheet redeploy webhook."
            exit 0
          fi
          curl -fsS -X POST --max-time 30 --retry 3 --retry-all-errors "$SHEET_REDEPLOY_WEBHOOK_URL"
```

- [ ] **Step 3: Update `CLAUDE.md`**

Three edits, all factual:

1. "Six npm workspaces under `app/`, with a strict dependency direction `core ← {search, db} ← {ingest, web, bot}`" becomes **seven**, with `core ← {search, db} ← {ingest, web, bot}` and `core ← sheet`.
2. A new bullet in the workspace list, after `@revelio/bot`:

```markdown
- **`@revelio/sheet`** (`sheet/`) — the deck sheet render service: the only process that
  paints the picture of a deck, for both web's PNG export and the bot's `/deck`. HTTP
  (`POST /render`) over a bearer token, no public ingress, and it depends on `core` **only** —
  no database, no Meilisearch, no S3. The request body is the sheet's whole input
  (`DeckSheetRequest`), so the service owns no layout and no visibility rules. One pixel cap
  (`MAX_SHEET_PIXELS = 12_000_000`, ~551 MB peak, a 768Mi pod) and a byte ceiling the caller
  states; one render at a time, 503 past a queue of four.
```

3. In the eslint note ("the other five are covered by `app/eslint.config.mjs`"), five becomes six.

- [ ] **Step 4: Verify the whole check suite**

Run: `npm run check -w @revelio/db && npm run verify -w @revelio/db && npm run lint && npm run typecheck && npm test`
Expected: all green, with the new `@revelio/sheet` suites in the test run. Record the counts for the PR's `## Verification`.

- [ ] **Step 5: Commit**

```bash
git add ../.github/workflows/publish.yml ../CLAUDE.md
git commit -m "ci: publish the sheet render service image"
```

---

## Phase 1 definition of done

- `npm test`, `npm run lint`, `npm run typecheck` green from `app/`.
- `docker build -f sheet/Dockerfile .` succeeds, and `docker compose up sheet` serves a PNG for a hand-made request in both locales.
- `web` and `ingest` images still build.
- No existing behaviour changed: the bot still paints its own sheet, web still paints its own, and nothing calls the service.
- The PR body carries a `## Deployment` section: the new image, the new deployment (1 replica, 768Mi limit / 256Mi request, no public ingress), `IMAGE_BASE_URL` pointing at the in-cluster object store, a generated `SHEET_TOKEN`, and the `SHEET_REDEPLOY_WEBHOOK_URL` secret. The service must be live before Phase 2 rolls.
