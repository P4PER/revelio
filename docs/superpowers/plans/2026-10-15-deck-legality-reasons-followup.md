# Deck Legality Reasons Follow-up Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the legality reasons list, make the card name the first thing you read, and open the list by itself when a deck becomes illegal.

**Architecture:** Both changes live in `DeckLegalityBar` (`web/src/components/deck/deck-legality-bar.tsx`). The name gets weight and full-strength colour while the rest of the sentence is muted. The open state becomes "the user's choice since the last status change, else open when illegal": the choice resets whenever `status` changes, using React's adjust-state-during-render pattern, so no effect and no extra render.

**Tech Stack:** React 19, next-intl `t.rich`, Tailwind v4, Vitest + Testing Library.

**Spec:** Round 2 of the design mockup, approved in chat on 2026-10-15: option "A · Weight and contrast" and "Auto-open on Illegal". https://claude.ai/artifact/2VrRNJouH9EtoiBqCbhYay. Follows `2026-10-15-deck-legality-reasons.md` on the same branch.

## Global Constraints

- No new copy, so no catalog change.
- Code comments ASCII only; `type` aliases; Conventional Commits with scope `deck`, no tool attribution.
- Commit signing: `git -c gpg.program=/opt/homebrew/bin/gpg commit ...`; prefix `npm`/`npx` with `/usr/local/bin`.
- Run commands from `app/`.

## Review Focus

1. Collapsing the list while the deck stays illegal (more edits, different violation count) keeps it collapsed.
2. Illegal -> legal -> illegal, and illegal -> incomplete -> illegal, open it again.
3. An incomplete deck starts closed; a user who opened it keeps it open while incomplete.
4. The overview: an illegal deck shows its reasons on arrival, names in plain bold text.

---

### Task 1: Auto-open on Illegal

**Files:**
- Modify: `web/src/components/deck/deck-legality-bar.tsx`
- Test: `web/src/components/deck/__tests__/deck-legality-bar.test.tsx`
- Update: `deck-panel-violations.test.tsx`, `deck-overview.test.tsx` (they click the status to open the list, which would now close it)

- [ ] **Step 1: Failing tests** in `deck-legality-bar.test.tsx`: replace "counts the issues and starts closed" with
  - an illegal deck starts open (`aria-expanded="true"`, list present);
  - an incomplete deck starts closed;
  - collapsing an illegal deck survives a rerender that stays illegal with different violations;
  - illegal -> legal -> illegal reopens; illegal (collapsed) -> incomplete -> illegal reopens;
  - an incomplete deck the user opened stays open on a rerender that stays incomplete.
  Adjust the other tests in the file that click to open.
- [ ] **Step 2:** Run `npx vitest run src/components/deck/__tests__/deck-legality-bar.test.tsx` from `web/`. Expected: the new cases FAIL.
- [ ] **Step 3: Implement.** Replace `open` state with `choice: boolean | null` plus `seenStatus`; when `status !== seenStatus`, set both during render (reset `choice` to null). `open = choice ?? status === 'illegal'`. The button sets `choice = !open`.
- [ ] **Step 4:** Drop the now-closing open clicks from `deck-panel-violations.test.tsx` and `deck-overview.test.tsx`; run `npx vitest run src/components/deck/__tests__/`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(deck): open the reasons list when a deck becomes illegal`.

### Task 2: Card name emphasis

**Files:**
- Modify: `web/src/components/deck/deck-legality-bar.tsx`
- Test: `web/src/components/deck/__tests__/deck-legality-bar.test.tsx`

- [ ] **Step 1: Failing test:** with and without `onJump`, the card name renders inside a `strong` element, and the reason text around it carries `text-muted-foreground`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement.** The reason's sentence span gets `text-muted-foreground`; the `card` tag renders `<strong className="font-semibold text-foreground">`, inside the jump button when there is one. The jump button's underline becomes `decoration-dotted decoration-foreground/45`, `hover:decoration-solid hover:decoration-current`.
- [ ] **Step 4:** Run the deck component tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(deck): set the card name apart in a legality reason`.

### Task 3: Verification

- [ ] `npm test -w web`, `npm run typecheck`, `npm run lint`.
- [ ] Playwright on the dev server: the Peeves-in-Revival flow at 1280 light and dark and 390; the list is open without a click, the name reads bold, collapsing and re-breaking the deck behave as in Review Focus.
