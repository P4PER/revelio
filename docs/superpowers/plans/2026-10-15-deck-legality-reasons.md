# Deck Legality Reasons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show why a deck is illegal or incomplete in the deck builder (and the deck overview): the legality status expands into a list of reasons, and every card that breaks a rule is marked on its own row.

**Architecture:** `evaluateDeck` (`core/src/deck-legality.ts`) already returns every `Violation`; nothing renders them. A pure helper in `web/src/lib/deck-violations.ts` turns violations into message keys/values and per-card row marks. `DeckLegalityBar` gains a disclosure button and the reasons list; `DeckPanel` tints offending rows with a reason chip and lets a reason's card name scroll to and flash its row, reusing the flash it already does for added cards. Everything is derived from the evaluation on each render: no new state beyond "is the list open".

**Tech Stack:** Next.js 16 / React 19, next-intl (`t.rich`), Tailwind v4, lucide-react, Vitest + Testing Library.

**Spec:** Design D, approved in chat on 2026-10-15. Mockup: https://claude.ai/artifact/2VrRNJouH9EtoiBqCbhYay (option "D · A + marked rows"). No spec file: this is a bounded change to an existing component.

## Global Constraints

- Every user-facing string lives in `web/messages/en.json` **and** `web/messages/de.json` under `decks`; no hardcoded copy. There is no catalog parity test in `web`, so add each key to both files by hand.
- Card names in reasons come from the deck entries (`DeckCardView.name`); the existing `decks.violation.*` strings use `{cardId}` and must switch to `{name}`.
- Colours: hard problems use `destructive`; soft ones (`no_character`, `main_deck_size`) use `muted-foreground`. No `chart-*` colours for text.
- Code comments ASCII only (no em-dashes, no unicode arrows).
- `type` aliases, not `interface`; `import type` for type-only imports; declaration order types -> constants -> helpers -> exports.
- Conventional Commits, scope `core` or `deck`; no tool attribution.
- Commit signing: `git -c gpg.program=/opt/homebrew/bin/gpg commit ...`. Tools: prefix `npm`/`node` with `/usr/local/bin` if not on PATH.
- Run all commands from `app/`.

## Review Focus

1. **Same card over the limit in main and sideboard** (e.g. 3 + 2 copies): both rows show the "Max 4" chip, and the reason's name jumps to the main-deck row. Test in Task 3.
2. **Switching format (Classic <-> Revival)** with a banned or non-Classic card in the deck: chips and the reasons list change immediately, with no stale marks. Test in Task 3.
3. **Deck becomes legal while the list is open**: the button and list disappear and the status reads "Tournament legal" as plain text. Test in Task 2.
4. **Read-only overview** (no `onJump`): card names render as plain text, never as buttons that do nothing. Test in Task 2.
5. **A jump while an add-flash is running** (or two jumps in a row): the latest row flashes and the highlight never sticks, because the timer is replaced, not stacked. Test in Task 3.

---

## File Structure

- Modify `core/src/deck-legality.ts`: export `isHardViolation(v)` so web does not restate the hard/soft split.
- Create `web/src/lib/deck-violations.ts`: pure helpers, `violationMessage`, `rowViolations`, `ROW_CODES` (+ test `web/src/lib/__tests__/deck-violations.test.ts`).
- Modify `web/src/components/deck/deck-legality-bar.tsx`: disclosure button + reasons list (+ new test `web/src/components/deck/__tests__/deck-legality-bar.test.tsx`).
- Modify `web/src/components/deck/deck-panel.tsx`: row marks, chips, jump-to-row (+ new test `web/src/components/deck/__tests__/deck-panel-violations.test.tsx`).
- Modify `web/src/components/deck/deck-builder.tsx`: pass `violations` to `DeckPanel`.
- Modify `web/src/components/deck/deck-overview.tsx`: pass `violations` to the bar and the read-only panel.
- Modify `web/messages/en.json`, `web/messages/de.json`.

---

### Task 1: `isHardViolation` in core and the violation helpers in web

**Files:**
- Modify: `core/src/deck-legality.ts`
- Test: `core/test/deck-legality.test.ts`
- Create: `web/src/lib/deck-violations.ts`
- Test: `web/src/lib/__tests__/deck-violations.test.ts`
- Modify: `web/messages/en.json`, `web/messages/de.json`

**Interfaces:**
- Produces (core): `isHardViolation(v: Violation): boolean`
- Produces (web):
  - `type RowViolationCode = 'invalid_character' | 'too_many_copies' | 'card_not_in_format' | 'banned_card'`
  - `violationMessage(v: Violation, names: Record<string, string>): { key: string; values: Record<string, string | number> }`. `key` is relative to the `decks` namespace, e.g. `'violation.too_many_copies'`.
  - `rowViolations(violations: Violation[]): Map<string, RowViolationCode[]>`, keyed by `cardId`
  - `cardNames(entries: { cardId: string; name: string }[]): Record<string, string>`

- [ ] **Step 1: Write the failing core test**

Append to `core/test/deck-legality.test.ts` (import `isHardViolation` alongside `evaluateDeck` from `../src/deck-legality`):

```ts
describe('isHardViolation', () => {
  it('treats rule breaks as hard and missing pieces as soft', () => {
    expect(isHardViolation({ code: 'banned_card', cardId: 'x' })).toBe(true)
    expect(isHardViolation({ code: 'too_many_copies', cardId: 'x', count: 5 })).toBe(true)
    expect(isHardViolation({ code: 'main_deck_size', actual: 58 })).toBe(false)
    expect(isHardViolation({ code: 'no_character' })).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `npm test -w @revelio/core -- test/deck-legality.test.ts`
Expected: FAIL, `isHardViolation` is not exported.

- [ ] **Step 3: Implement**

In `core/src/deck-legality.ts`, below the `HARD` constant:

```ts
// Hard violations make a deck illegal; the rest (no character yet, main deck
// not at 60) only make it incomplete. Shared so the web UI colours each reason
// by the same split evaluateDeck uses for the status.
export function isHardViolation(v: Violation): boolean {
  return HARD.has(v.code)
}
```

and in `evaluateDeck` replace `violations.some((v) => HARD.has(v.code))` with `violations.some(isHardViolation)`.

- [ ] **Step 4: Run it and see it pass**

Run: `npm test -w @revelio/core -- test/deck-legality.test.ts`
Expected: PASS (all existing `evaluateDeck` tests too).

- [ ] **Step 5: Write the failing web helper test**

Create `web/src/lib/__tests__/deck-violations.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { cardNames, rowViolations, violationMessage } from '@/lib/deck-violations'

describe('violationMessage', () => {
  const names = { wing: 'Wingardium Leviosa' }

  it('passes the card name, not the id', () => {
    expect(violationMessage({ code: 'too_many_copies', cardId: 'wing', count: 5 }, names)).toEqual({
      key: 'violation.too_many_copies',
      values: { count: 5, name: 'Wingardium Leviosa' },
    })
  })

  it('falls back to the id when the name is unknown', () => {
    expect(violationMessage({ code: 'banned_card', cardId: 'zz' }, names).values).toEqual({ name: 'zz' })
  })

  it('passes deck-wide values through unchanged', () => {
    expect(violationMessage({ code: 'main_deck_size', actual: 58 }, names)).toEqual({
      key: 'violation.main_deck_size',
      values: { actual: 58 },
    })
  })
})

describe('rowViolations', () => {
  it('groups card-level codes by card and skips deck-wide ones', () => {
    const marks = rowViolations([
      { code: 'main_deck_size', actual: 58 },
      { code: 'too_many_copies', cardId: 'wing', count: 5 },
      { code: 'banned_card', cardId: 'wing' },
      { code: 'invalid_character', cardId: 'ron' },
    ])
    expect(marks.get('wing')).toEqual(['too_many_copies', 'banned_card'])
    expect(marks.get('ron')).toEqual(['invalid_character'])
    expect(marks.size).toBe(2)
  })
})

describe('cardNames', () => {
  it('maps ids to names', () => {
    expect(cardNames([{ cardId: 'a', name: 'Accio' }])).toEqual({ a: 'Accio' })
  })
})
```

- [ ] **Step 6: Run it and see it fail**

Run: `npm test -w web -- src/lib/__tests__/deck-violations.test.ts`
Expected: FAIL, module `@/lib/deck-violations` not found.

- [ ] **Step 7: Implement `web/src/lib/deck-violations.ts`**

```ts
import type { Violation } from '@revelio/core'

// The violations that name one card, and so can be shown on that card's row
// in the deck panel. The others (deck size, character count) are deck-wide.
export type RowViolationCode = Extract<Violation, { cardId: string }>['code']

export type ViolationMessage = { key: string; values: Record<string, string | number> }

// Message key (under the `decks` namespace) and values for one violation. The
// card id is swapped for the card's name, falling back to the id so a reason
// still reads if the name is somehow missing.
export function violationMessage(v: Violation, names: Record<string, string>): ViolationMessage {
  const { code, ...rest } = v
  if ('cardId' in rest) {
    const { cardId, ...values } = rest
    return { key: `violation.${code}`, values: { ...values, name: names[cardId] ?? cardId } }
  }
  return { key: `violation.${code}`, values: rest }
}

export function rowViolations(violations: Violation[]): Map<string, RowViolationCode[]> {
  const marks = new Map<string, RowViolationCode[]>()
  for (const v of violations) {
    if (!('cardId' in v)) continue
    marks.set(v.cardId, [...(marks.get(v.cardId) ?? []), v.code])
  }
  return marks
}

export function cardNames(entries: { cardId: string; name: string }[]): Record<string, string> {
  return Object.fromEntries(entries.map((e) => [e.cardId, e.name]))
}
```

- [ ] **Step 8: Update the message catalogs**

In `web/messages/en.json`, under `decks`:
- `status` gains `"illegalIssues": "Illegal · {count, plural, one {# issue} other {# issues}}"`
- `panel` gains `"jumpToCard": "Show {name} in the deck"`
- replace `violation` with:

```json
"violation": {
  "no_character": "No starting character chosen",
  "multiple_characters": "Only one starting character is allowed",
  "invalid_character": "<card>{name}</card> can't be a starting character",
  "main_deck_size": "Main deck has {actual} / 60 cards",
  "sideboard_too_large": "Sideboard has {actual} cards (max 15)",
  "too_many_copies": "{count} copies of <card>{name}</card> (max 4)",
  "card_not_in_format": "<card>{name}</card> isn't legal in this format",
  "banned_card": "<card>{name}</card> is banned in Revival"
},
"violationChip": {
  "invalid_character": "Not a starting character",
  "too_many_copies": "Max 4",
  "card_not_in_format": "Not in Classic",
  "banned_card": "Banned"
},
```

In `web/messages/de.json`, under `decks`:
- `status` gains `"illegalIssues": "Nicht legal · {count, plural, one {# Problem} other {# Probleme}}"`
- `panel` gains `"jumpToCard": "{name} im Deck zeigen"`
- replace `violation` with:

```json
"violation": {
  "no_character": "Kein Startcharakter gewählt",
  "multiple_characters": "Nur ein Startcharakter ist erlaubt",
  "invalid_character": "<card>{name}</card> kann kein Startcharakter sein",
  "main_deck_size": "Hauptdeck hat {actual} / 60 Karten",
  "sideboard_too_large": "Sideboard hat {actual} Karten (max. 15)",
  "too_many_copies": "{count} Kopien von <card>{name}</card> (max. 4)",
  "card_not_in_format": "<card>{name}</card> ist in diesem Format nicht legal",
  "banned_card": "<card>{name}</card> ist in Revival verboten"
},
"violationChip": {
  "invalid_character": "Kein Startcharakter",
  "too_many_copies": "Max. 4",
  "card_not_in_format": "Nicht in Classic",
  "banned_card": "Verboten"
},
```

Before changing them, confirm nothing else reads the old `{cardId}` strings: `grep -rn "violation\." web/src web/e2e` should list nothing outside this feature.

- [ ] **Step 9: Run the tests and see them pass**

Run: `npm test -w web -- src/lib/__tests__/deck-violations.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 10: Commit (two commits)**

```bash
git add core/src/deck-legality.ts core/test/deck-legality.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(core): export isHardViolation for the deck legality split"
git add web/src/lib/deck-violations.ts web/src/lib/__tests__/deck-violations.test.ts web/messages/en.json web/messages/de.json
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(deck): add helpers that word deck violations by card name"
```

---

### Task 2: Expandable reasons list in `DeckLegalityBar`

**Files:**
- Modify: `web/src/components/deck/deck-legality-bar.tsx`
- Test: `web/src/components/deck/__tests__/deck-legality-bar.test.tsx` (new)

**Interfaces:**
- Consumes: `violationMessage`, `cardNames` input shape, `isHardViolation`
- Produces: `DeckLegalityBar` props become
  `{ status: DeckStatus; mainCount: number; hasCharacter: boolean; violations?: Violation[]; names?: Record<string, string>; onJump?: (cardId: string) => void; className?: string }`.
  With no `violations` it renders exactly as today.

- [ ] **Step 1: Write the failing tests**

Create `web/src/components/deck/__tests__/deck-legality-bar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Violation } from '@revelio/core'
import { renderWithIntl } from '@/test/intl'
import { DeckLegalityBar } from '@/components/deck/deck-legality-bar'

const violations: Violation[] = [
  { code: 'too_many_copies', cardId: 'wing', count: 5 },
  { code: 'main_deck_size', actual: 58 },
]
const names = { wing: 'Wingardium Leviosa' }

describe('DeckLegalityBar reasons', () => {
  it('shows a plain label and no button when there are no violations', () => {
    renderWithIntl(<DeckLegalityBar status="legal" mainCount={60} hasCharacter />)
    expect(screen.getByText('Tournament legal')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('counts the issues and starts closed', () => {
    renderWithIntl(<DeckLegalityBar status="illegal" mainCount={58} hasCharacter violations={violations} names={names} />)
    const button = screen.getByRole('button', { name: /Illegal · 2 issues/ })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('lists every reason by card name when opened', async () => {
    renderWithIntl(<DeckLegalityBar status="illegal" mainCount={58} hasCharacter violations={violations} names={names} />)
    await userEvent.click(screen.getByRole('button', { name: /Illegal · 2 issues/ }))
    const list = screen.getByRole('list')
    expect(list).toHaveTextContent('5 copies of Wingardium Leviosa (max 4)')
    expect(list).toHaveTextContent('Main deck has 58 / 60 cards')
  })

  it('makes a card name a jump button only when onJump is given', async () => {
    const onJump = vi.fn()
    const { unmount } = renderWithIntl(
      <DeckLegalityBar status="illegal" mainCount={58} hasCharacter violations={violations} names={names} onJump={onJump} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Illegal/ }))
    await userEvent.click(within(screen.getByRole('list')).getByRole('button', { name: 'Show Wingardium Leviosa in the deck' }))
    expect(onJump).toHaveBeenCalledWith('wing')
    unmount()

    // Read-only overview: no onJump, so the name is plain text.
    renderWithIntl(<DeckLegalityBar status="illegal" mainCount={58} hasCharacter violations={violations} names={names} />)
    await userEvent.click(screen.getByRole('button', { name: /Illegal/ }))
    expect(within(screen.getByRole('list')).queryByRole('button')).not.toBeInTheDocument()
  })

  it('drops the button and list once the deck turns legal', async () => {
    const { rerender } = renderWithIntl(
      <DeckLegalityBar status="illegal" mainCount={58} hasCharacter violations={violations} names={names} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Illegal/ }))
    rerender(<DeckLegalityBar status="legal" mainCount={60} hasCharacter violations={[]} names={names} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getByText('Tournament legal')).toBeInTheDocument()
  })
})
```

Check that `@testing-library/user-event` is already a web dev dependency (`grep user-event web/package.json`); other deck tests use it. If it is not, use `fireEvent.click` from `@testing-library/react` instead and drop the `await`s.

- [ ] **Step 2: Run them and see them fail**

Run: `npm test -w web -- src/components/deck/__tests__/deck-legality-bar.test.tsx`
Expected: the first test passes; the rest FAIL (no button).

- [ ] **Step 3: Implement**

Replace `web/src/components/deck/deck-legality-bar.tsx` with:

```tsx
'use client'
import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown } from 'lucide-react'
import { isHardViolation, type DeckStatus, type Violation } from '@revelio/core'
import { cn } from '@/lib/utils'
import { MAIN_TARGET, STATUS_UI, deckStatusText } from '@/lib/deck-legality'
import { violationMessage } from '@/lib/deck-violations'

type DeckLegalityBarProps = {
  status: DeckStatus
  mainCount: number
  hasCharacter: boolean
  violations?: Violation[]
  names?: Record<string, string>
  // Scrolls the deck panel to a card's row. Absent where there is no row to
  // go to (the overview's gallery view), and the names are then plain text.
  onJump?: (cardId: string) => void
  className?: string
}

// Slim progress-bar + status-label legality indicator. Shared by the deck panel
// (builder) and the deck overview so both read the same whole-deck legality: the
// bar fills toward the 60-card main target and recolors with the status. When
// the deck breaks rules, the label opens the list of every reason.
export function DeckLegalityBar({
  status,
  mainCount,
  hasCharacter,
  violations = [],
  names = {},
  onJump,
  className,
}: DeckLegalityBarProps) {
  const t = useTranslations('decks')
  const [open, setOpen] = useState(false)
  const listId = useId()
  const pct = Math.min(100, Math.round((mainCount / MAIN_TARGET) * 100))
  // Overfilling the main deck isn't a "hard" violation in evaluateDeck (status
  // stays 'incomplete'), but it's a clear error - surface it in red here.
  const ui = mainCount > MAIN_TARGET ? STATUS_UI.illegal : STATUS_UI[status]
  const hasReasons = violations.length > 0
  const label =
    status === 'illegal' && hasReasons
      ? t('status.illegalIssues', { count: violations.length })
      : deckStatusText(status, mainCount, hasCharacter, t)

  return (
    <div className={className}>
      <div className="flex items-center gap-2.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className={cn('h-full rounded-full transition-all', ui.fill)} style={{ width: `${pct}%` }} />
        </div>
        {hasReasons ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((o) => !o)}
            className={cn(
              '-my-0.5 -mr-1 flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 text-xs font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              ui.text,
            )}
          >
            <span className={cn('size-1.5 rounded-full', ui.dot)} aria-hidden />
            {label}
            <ChevronDown
              className={cn('size-3.5 transition-transform motion-reduce:transition-none', open && 'rotate-180')}
              aria-hidden
            />
          </button>
        ) : (
          <span className={cn('flex shrink-0 items-center gap-1.5 text-xs font-medium', ui.text)}>
            <span className={cn('size-1.5 rounded-full', ui.dot)} aria-hidden />
            {label}
          </span>
        )}
      </div>
      {hasReasons && open && (
        <ul id={listId} className="mt-2.5 space-y-1 text-sm">
          {violations.map((v, i) => {
            const hard = isHardViolation(v)
            const { key, values } = violationMessage(v, names)
            const cardId = 'cardId' in v ? v.cardId : null
            return (
              <li key={`${v.code}-${cardId ?? i}`} className="flex items-baseline gap-2">
                <span
                  aria-hidden
                  className={cn('w-3 shrink-0 text-center font-bold', hard ? 'text-destructive' : 'text-muted-foreground')}
                >
                  {hard ? '!' : '·'}
                </span>
                <span className="min-w-0">
                  {t.rich(key, {
                    ...values,
                    card: (chunks) =>
                      onJump && cardId ? (
                        <button
                          type="button"
                          aria-label={t('panel.jumpToCard', { name: String(values.name) })}
                          onClick={() => onJump(cardId)}
                          className="cursor-pointer rounded-sm underline decoration-border underline-offset-3 hover:decoration-current focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          {chunks}
                        </button>
                      ) : (
                        chunks
                      ),
                  })}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
```

`'·'` is the middle dot already used in `decks.status` copy. If the ASCII-only comment rule makes you hesitate: it applies to comments, and this is rendered text.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm test -w web -- src/components/deck/__tests__/deck-legality-bar.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/deck/deck-legality-bar.tsx web/src/components/deck/__tests__/deck-legality-bar.test.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(deck): list why a deck is illegal under the legality bar"
```

---

### Task 3: Marked rows and jump-to-row in `DeckPanel`, wired into the builder

**Files:**
- Modify: `web/src/components/deck/deck-panel.tsx`
- Modify: `web/src/components/deck/deck-builder.tsx` (the `<DeckPanel ... />` call, ~line 269)
- Test: `web/src/components/deck/__tests__/deck-panel-violations.test.tsx` (new)

**Interfaces:**
- Consumes: `rowViolations`, `cardNames`, `RowViolationCode` (Task 1); `DeckLegalityBar` with `violations`/`names`/`onJump` (Task 2)
- Produces: `DeckPanel` gains `violations?: Violation[]`. Rows whose card has a row code get `data-violation` set to their codes joined with a space, a destructive tint and one chip per code.

- [ ] **Step 1: Write the failing tests**

Create `web/src/components/deck/__tests__/deck-panel-violations.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { evaluateDeck, type DeckCardView, type DeckFormat } from '@revelio/core'
import { renderWithIntl } from '@/test/intl'
import { DeckPanel } from '@/components/deck/deck-panel'

function view(cardId: string, zone: DeckCardView['zone'], quantity: number, extra: Partial<DeckCardView> = {}): DeckCardView {
  return {
    cardId, zone, quantity, name: cardId, cost: 1, setCode: 'BS', number: '1',
    lesson: null, isOfficial: true, legality: null, isLesson: false, isStartingCharacter: zone === 'character',
    ...extra,
  }
}

function evaluate(entries: DeckCardView[], format: DeckFormat) {
  const meta = Object.fromEntries(entries.map((e) => [e.cardId, { id: e.cardId, isOfficial: e.isOfficial, legality: e.legality, isLesson: e.isLesson, isStartingCharacter: e.isStartingCharacter }]))
  return evaluateDeck(entries.map((e) => ({ cardId: e.cardId, zone: e.zone, quantity: e.quantity })), format, meta)
}

function row(key: string) {
  return document.querySelector(`[data-row-key="${key}"]`) as HTMLElement
}

describe('DeckPanel violations', () => {
  const scrollIntoView = vi.fn()
  beforeEach(() => {
    // jsdom has no scrollIntoView.
    Element.prototype.scrollIntoView = scrollIntoView
  })
  afterEach(() => {
    scrollIntoView.mockReset()
    vi.useRealTimers()
  })

  it('marks both rows when main and sideboard together pass the copy limit', () => {
    const entries = [view('harry', 'character', 1), view('wing', 'main', 3), view('wing', 'sideboard', 2)]
    const { status, violations } = evaluate(entries, 'classic')
    renderWithIntl(<DeckPanel entries={entries} imageBase="http://img.test" status={status} violations={violations} onQuantityChange={() => {}} />)
    expect(within(row('main-wing')).getByText('Max 4')).toBeInTheDocument()
    expect(within(row('sideboard-wing')).getByText('Max 4')).toBeInTheDocument()
    expect(row('character-harry')).not.toHaveAttribute('data-violation')
  })

  it('follows a format switch with no stale marks', () => {
    const entries = [view('harry', 'character', 1), view('fred', 'main', 2, { legality: 'banned' })]
    const classic = evaluate(entries, 'classic')
    const { rerender } = renderWithIntl(
      <DeckPanel entries={entries} imageBase="http://img.test" status={classic.status} violations={classic.violations} onQuantityChange={() => {}} />,
    )
    expect(row('main-fred')).not.toHaveAttribute('data-violation')

    const revival = evaluate(entries, 'revival')
    rerender(<DeckPanel entries={entries} imageBase="http://img.test" status={revival.status} violations={revival.violations} onQuantityChange={() => {}} />)
    expect(row('main-fred')).toHaveAttribute('data-violation', 'banned_card')
    expect(within(row('main-fred')).getByText('Banned')).toBeInTheDocument()

    rerender(<DeckPanel entries={entries} imageBase="http://img.test" status={classic.status} violations={classic.violations} onQuantityChange={() => {}} />)
    expect(row('main-fred')).not.toHaveAttribute('data-violation')
  })

  it('marks a character that cannot start on the character row', () => {
    const entries = [view('ron', 'character', 1, { isStartingCharacter: false })]
    const { status, violations } = evaluate(entries, 'classic')
    renderWithIntl(<DeckPanel entries={entries} imageBase="http://img.test" status={status} violations={violations} onQuantityChange={() => {}} />)
    expect(within(row('character-ron')).getByText('Not a starting character')).toBeInTheDocument()
  })

  it('jumps from a reason to the main-deck row and flashes it', async () => {
    const entries = [view('harry', 'character', 1), view('wing', 'main', 3), view('wing', 'sideboard', 2)]
    const { status, violations } = evaluate(entries, 'classic')
    renderWithIntl(<DeckPanel entries={entries} imageBase="http://img.test" status={status} violations={violations} onQuantityChange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /Illegal/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Show wing in the deck' }))
    expect(scrollIntoView).toHaveBeenCalled()
    expect(row('main-wing').className).toContain('bg-primary/15')
  })

  it('lets a second flash replace the first without the highlight sticking', () => {
    vi.useFakeTimers()
    const entries = [view('harry', 'character', 1), view('accio', 'main', 2), view('wing', 'main', 5)]
    const { status, violations } = evaluate(entries, 'classic')
    const { rerender } = renderWithIntl(
      <DeckPanel entries={entries} imageBase="http://img.test" status={status} violations={violations}
        highlight={{ zone: 'main', cardId: 'accio', nonce: 1 }} onQuantityChange={() => {}} />,
    )
    expect(row('main-accio').className).toContain('bg-primary/15')
    act(() => { vi.advanceTimersByTime(600) })
    rerender(
      <DeckPanel entries={entries} imageBase="http://img.test" status={status} violations={violations}
        highlight={{ zone: 'main', cardId: 'wing', nonce: 2 }} onQuantityChange={() => {}} />,
    )
    expect(row('main-wing').className).toContain('bg-primary/15')
    expect(row('main-accio').className).not.toContain('bg-primary/15')
    // The first timer must not clear the second flash early...
    act(() => { vi.advanceTimersByTime(700) })
    expect(row('main-wing').className).toContain('bg-primary/15')
    // ...and the second one ends it.
    act(() => { vi.advanceTimersByTime(600) })
    expect(row('main-wing').className).not.toContain('bg-primary/15')
  })
})
```

- [ ] **Step 2: Run them and see them fail**

Run: `npm test -w web -- src/components/deck/__tests__/deck-panel-violations.test.tsx`
Expected: FAIL (no chips, no `violations` prop, no jump button).

- [ ] **Step 3: Implement in `deck-panel.tsx`**

1. Imports: add `useCallback` to the React import; add `type Violation` to the `@revelio/core` import; add
   `import { cardNames, rowViolations, type RowViolationCode } from '@/lib/deck-violations'`.

2. Add a props type above `DeckPanel` (types before functions) and use it in the signature, adding `violations`:

```ts
type DeckPanelProps = {
  entries: DeckCardView[]
  imageBase: string
  status?: DeckStatus
  violations?: Violation[]
  highlight?: { zone: DeckZone; cardId: string; nonce: number } | null
  onQuantityChange?: (cardId: string, zone: DeckZone, qty: number) => void
  readOnly?: boolean
}
```

3. Add a module constant (after the types):

```ts
// The zone a jump from the reasons list lands on when a card sits in several:
// the main deck is where a copy-limit fix is usually made.
const JUMP_ORDER: DeckZone[] = ['main', 'sideboard', 'character']
```

4. Replace the flash effect with a timer-owning `flashRow`, so jumps and adds share one timer and a newer flash cancels the older one's reset:

```ts
const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

// Scroll a row into view within the panel and flash it briefly. Used for a
// card added upstream and for a jump from the reasons list; one timer, so a
// newer flash is never cut short by an older one ending.
const flashRow = useCallback((key: string) => {
  scrollRef.current?.querySelector(`[data-row-key="${key}"]`)?.scrollIntoView({ block: 'nearest' })
  setFlashKey(key)
  clearTimeout(flashTimer.current)
  flashTimer.current = setTimeout(() => setFlashKey(null), 1200)
}, [])

// When a card is added upstream, `highlight` arrives with a fresh nonce. The
// nonce makes re-adding the same card (a new object identity) re-trigger it.
useEffect(() => {
  if (!highlight) return
  // Flashing the row is a deliberate response to an external add event.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  flashRow(`${highlight.zone}-${highlight.cardId}`)
}, [highlight, flashRow])

useEffect(() => () => clearTimeout(flashTimer.current), [])
```

If `npm run lint -w web` then reports the disable comment as unused, delete that comment line.

5. After `const groups = ...`, derive the marks and the jump handler:

```ts
const marks = rowViolations(violations ?? [])

function jumpTo(cardId: string) {
  const zone = JUMP_ORDER.find((z) => entries.some((e) => e.zone === z && e.cardId === cardId))
  if (zone) flashRow(`${zone}-${cardId}`)
}

// Codes shown on a row: the character slot only shows whether it can start;
// deck rows show everything else about that card.
function codesFor(e: DeckCardView): RowViolationCode[] {
  const codes = marks.get(e.cardId) ?? []
  return e.zone === 'character'
    ? codes.filter((c) => c === 'invalid_character')
    : codes.filter((c) => c !== 'invalid_character')
}

function chips(codes: RowViolationCode[]) {
  return codes.map((c) => (
    <span
      key={c}
      className="shrink-0 rounded-full border border-destructive/45 px-1.5 text-[0.65rem] font-semibold whitespace-nowrap text-destructive"
    >
      {t(`violationChip.${c}`)}
    </span>
  ))
}
```

6. In `row(e)`: compute `const codes = codesFor(e)` at the top, add `data-violation={codes.length ? codes.join(' ') : undefined}` to the row `div`, and make its className

```ts
className={cn(
  'group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted',
  codes.length > 0 && 'bg-destructive/10 shadow-[inset_2px_0_0_var(--destructive)] hover:bg-destructive/15',
  flashKey === `${e.zone}-${e.cardId}` && 'bg-primary/15',
)}
```

(the flash stays last so it wins while it runs). Render `{chips(codes)}` between the name `div` and the info button. Keep the set code: the name block already truncates.

7. In the character card: compute `const characterCodes = character ? codesFor(character) : []` next to `marks`; add `data-violation={characterCodes.length ? characterCodes.join(' ') : undefined}` to the character `div`; when `characterCodes.length > 0`, use `border-destructive` in place of `border-primary/60` (the flash ring still wins while it runs); render `{chips(characterCodes)}` just before the "Character" badge.

8. Pass the reasons to the bar:

```tsx
<DeckLegalityBar
  status={status}
  mainCount={mainCount}
  hasCharacter={Boolean(character)}
  violations={violations}
  names={cardNames(entries)}
  onJump={jumpTo}
  className="border-b border-border/60 px-4 py-3"
/>
```

- [ ] **Step 4: Wire the builder**

In `web/src/components/deck/deck-builder.tsx`, add `violations={evaluation.violations}` to the `<DeckPanel ... />` call next to `status={evaluation.status}`.

- [ ] **Step 5: Run the tests and see them pass**

Run: `npm test -w web -- src/components/deck/__tests__/`
Expected: PASS, including the existing `deck-panel-quantity`, `deck-panel-readonly` and `deck-builder` tests.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/deck/deck-panel.tsx web/src/components/deck/deck-builder.tsx web/src/components/deck/__tests__/deck-panel-violations.test.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(deck): mark the cards that make a deck illegal on their rows"
```

---

### Task 4: Reasons on the deck overview

**Files:**
- Modify: `web/src/components/deck/deck-overview.tsx` (~line 59 and ~lines 104-115)
- Test: `web/src/components/deck/__tests__/deck-overview.test.tsx`

**Interfaces:**
- Consumes: `deckStats(...).violations` (already returned), `cardNames`, `DeckLegalityBar` and `DeckPanel` props from Tasks 2-3.

On the overview the bar sits outside `DeckPanel`, and the gallery view has no rows, so no `onJump` here: the reasons list shows names as plain text, and the list view marks rows.

- [ ] **Step 1: Write the failing test**

Read the existing `deck-overview.test.tsx` first and reuse its render helper and fixtures. Add a test that renders an overview whose deck holds a card with `legality: 'banned'` in format `'revival'`, then asserts:

```tsx
await userEvent.click(screen.getByRole('button', { name: /Illegal/ }))
expect(screen.getByRole('list')).toHaveTextContent('is banned in Revival')
expect(within(screen.getByRole('list')).queryByRole('button')).not.toBeInTheDocument()
expect(document.querySelector('[data-violation="banned_card"]')).not.toBeNull()
```

- [ ] **Step 2: Run it and see it fail**

Run: `npm test -w web -- src/components/deck/__tests__/deck-overview.test.tsx`
Expected: the new test FAILS (no button).

- [ ] **Step 3: Implement**

In `deck-overview.tsx`:
- `const { status, violations, mainCount } = deckStats(views, format)`
- import `cardNames` from `@/lib/deck-violations`
- the bar: add `violations={violations}` and `names={cardNames(views)}`
- the list view: `<DeckPanel entries={views} imageBase={imageBase} violations={violations} readOnly />`

- [ ] **Step 4: Run it and see it pass**

Run: `npm test -w web -- src/components/deck/__tests__/deck-overview.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/deck/deck-overview.tsx web/src/components/deck/__tests__/deck-overview.test.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(deck): show why a deck is illegal on its overview page"
```

---

### Task 5: Whole-branch verification and PR

- [ ] **Step 1: Full checks**

Run from `app/`: `npm test -w web`, `npm test -w @revelio/core`, `npm run typecheck`, `npm run lint`. All must pass; record the test counts.

- [ ] **Step 2: Look at it in the browser**

With the dev server up, open `/en/decks/new` at 1280px and 390px wide (Playwright from the repo, see the memory note on visual checks). Build a Revival deck with a banned card (switch format after adding it in Classic) and check: the status button, the opened list, the jump flash, the red row with its chip, both themes. Repeat once in `/de/`. The phone sheet must not grow taller from the chips.

- [ ] **Step 3: Push and open the PR**

Title: `feat(deck): show why a deck is illegal`. Body opens with prose, then `## What changed`, `## Verification` (one bullet per command actually run, with its result), and links this plan and the mockup. No deployment section: nothing outside the diff.
