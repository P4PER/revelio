# Deck Legality Deferred Minors Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four minors PR #165 deferred: jump links on the overview's list view, an issue count that counts only what makes the deck illegal, an auto-open that follows the red bar, and every character line rendered.

**Architecture:** The zone a jump lands on moves out of `DeckPanel` into a pure `jumpZone` helper in `web/src/lib/deck-violations.ts`, so the overview can resolve it too and hand the panel the row through its existing `highlight` prop. `DeckLegalityBar` derives one `severity` (illegal when the main deck is over 60, else the status) that drives the colour, the default open state and the reset of the user's toggle. `DeckPanel` maps over every character entry instead of the first.

**Tech Stack:** React 19, next-intl, Vitest + Testing Library.

**Follows:** PR #165, `2026-10-15-deck-legality-reasons.md` and `2026-10-15-deck-legality-reasons-followup.md`.

## Global Constraints

- No new copy, so no catalog change.
- Code comments ASCII only; Conventional Commits with scope `deck`, no tool attribution.
- Commit signing: `git -c gpg.program=/opt/homebrew/bin/gpg commit ...`; prefix `npm`/`npx` with `/usr/local/bin`.

---

### Task 1: Count only hard reasons

- [ ] Failing test in `deck-legality-bar.test.tsx`: an illegal deck with one hard and one soft reason reads "Illegal · 1 issue" and still lists both.
- [ ] `count` is `violations.filter(isHardViolation).length`.
- [ ] Commit `fix(deck): count only the reasons that make a deck illegal`.

### Task 2: Open the list when the bar turns red

- [ ] Failing tests: an incomplete deck over 60 starts open; collapsing it stays collapsed while it stays over 60; dropping back to 60 or under and going over again reopens it.
- [ ] `severity = mainCount > MAIN_TARGET ? 'illegal' : status`; `ui`, the default and the reset all key on it.
- [ ] Commit `fix(deck): open the reasons list for a deck over 60 cards`.

### Task 3: Render every character line

- [ ] Failing test in `deck-panel-violations.test.tsx`: a deck with two character entries renders both rows, and a jump to the second flashes the second.
- [ ] The slot maps over `characters`; each line gets its own codes and flash.
- [ ] Commit `fix(deck): show every starting character a deck holds`.

### Task 4: Jump links on the overview's list view

- [ ] Move the zone choice into `jumpZone(entries, cardId, code)` with unit tests in `deck-violations.test.ts`.
- [ ] Failing test in `deck-overview.test.tsx`: in the list view a reason's card name is a button, and clicking it hands the panel a `highlight` for the right row; in the gallery view the name is plain text.
- [ ] `DeckOverview` keeps a `highlight` state with a nonce and passes `onJump` only in the list view.
- [ ] Commit `feat(deck): jump to a card from the overview's reasons list`.

### Task 5: Verification

- [ ] `npm test -w web`, `npm run typecheck`, `npm run lint`.
