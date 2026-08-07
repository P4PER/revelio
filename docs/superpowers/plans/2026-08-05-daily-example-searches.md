# Daily-Rotating Example Searches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home page's fixed five example-search chips with a set of five that rotates once per day, seeded so every visitor sees the same five on a given day.

**Architecture:** A pure, dependency-free helper (`daily-examples.ts`) holds a locale-keyed curated pool and a deterministic picker that seeds a tiny PRNG from the UTC day-number, shuffles that locale's pool, and returns the first five. The home page (`page.tsx`, already `force-dynamic`) calls the picker with the current locale and `new Date()`.

**Tech Stack:** TypeScript, Next.js 16 App Router (React 19 server component), next-intl (`useLocale`), vitest.

## Global Constraints

- All app commands run from `app/` (npm workspaces root). Web workspace is `-w web`.
- Locale-aware output: `en` and `de` pools; unknown locales fall back to `en`.
- The pool is curated data in code — **not** in `messages/*.json`.
- Rotation seed uses **UTC** day-number (flips at 00:00 UTC), stable within a UTC day.
- Conventional Commits. Commit signing: `git -c gpg.program=/opt/homebrew/bin/gpg`.
- Node/npm are at `/usr/local/bin` (prefix if not on PATH).

---

### Task 1: Pure daily-examples helper + tests

**Files:**
- Create: `app/web/src/lib/daily-examples.ts`
- Test: `app/web/src/lib/__tests__/daily-examples.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces: `export function pickDailyExamples(locale: string, date: Date, count?: number): string[]` — returns up to `count` (default 5) distinct example-search terms for `locale`, deterministic per UTC day. Unknown locale → `en` pool.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/lib/__tests__/daily-examples.test.ts`:

```ts
import { it, expect } from 'vitest'
import { pickDailyExamples } from '../daily-examples'

const noon = new Date('2026-08-06T12:00:00Z')

it('returns 5 distinct terms by default', () => {
  const r = pickDailyExamples('en', noon)
  expect(r).toHaveLength(5)
  expect(new Set(r).size).toBe(5)
})

it('is deterministic for the same locale and UTC day', () => {
  expect(pickDailyExamples('en', new Date('2026-08-06T00:00:00Z'))).toEqual(
    pickDailyExamples('en', new Date('2026-08-06T23:59:59Z')),
  )
})

it('rotates across consecutive UTC days', () => {
  const a = pickDailyExamples('en', new Date('2026-08-06T12:00:00Z'))
  const b = pickDailyExamples('en', new Date('2026-08-07T12:00:00Z'))
  expect(a).not.toEqual(b)
})

it('falls back to the en pool for unknown locales', () => {
  expect(pickDailyExamples('xx', noon)).toEqual(pickDailyExamples('en', noon))
})

it('returns the whole pool with no dupes when count exceeds pool size', () => {
  const r = pickDailyExamples('en', noon, 999)
  expect(new Set(r).size).toBe(r.length)
  expect(r.length).toBeGreaterThan(5)
})

it('serves locale-specific terms for de', () => {
  const de = pickDailyExamples('de', noon, 999)
  expect(de).toContain('Schnatz')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w web -- src/lib/__tests__/daily-examples.test.ts`
Expected: FAIL — cannot resolve `../daily-examples`.

- [ ] **Step 3: Write minimal implementation**

Create `app/web/src/lib/daily-examples.ts`:

```ts
// Curated example-search terms per locale. These double as functional search
// queries (rendered as chips linking to /search?q=...), so they live here as
// typed data rather than in messages/*.json. Every term should return results
// in its locale's search index.
const POOLS: Record<string, string[]> = {
  en: [
    'Harry Potter',
    'Dumbledore',
    'Hermione',
    'Ron Weasley',
    'Snape',
    'Hagrid',
    'Draco Malfoy',
    'Voldemort',
    'Quidditch',
    'Snitch',
    'Charms',
    'Transfiguration',
    'Potions',
    'Broom',
    'Wand',
    'Dragon',
    'Troll',
    'Owl',
  ],
  de: [
    'Harry Potter',
    'Dumbledore',
    'Hermine',
    'Ron Weasley',
    'Snape',
    'Hagrid',
    'Draco Malfoy',
    'Voldemort',
    'Quidditch',
    'Schnatz',
    'Zauberkunst',
    'Verwandlung',
    'Zaubertränke',
    'Besen',
    'Zauberstab',
    'Drache',
    'Troll',
    'Eule',
  ],
}

const MS_PER_DAY = 86_400_000

// mulberry32: small, fast, deterministic PRNG seeded from a 32-bit integer.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Pick the example searches for a given locale and day. Deterministic: the
 * result depends only on the locale and the UTC calendar day of `date`, so it
 * is stable within a day for all visitors and rotates at 00:00 UTC.
 */
export function pickDailyExamples(locale: string, date: Date, count = 5): string[] {
  const pool = POOLS[locale] ?? POOLS.en
  const day = Math.floor(date.getTime() / MS_PER_DAY)
  return shuffle(pool, mulberry32(day)).slice(0, count)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w web -- src/lib/__tests__/daily-examples.test.ts`
Expected: PASS (6 tests). If the "rotates" test fails because two adjacent days coincidentally match, change the compared day in that test to the next day and note it — mulberry32 over an 18-item pool makes a collision on any specific pair extremely unlikely.

- [ ] **Step 5: Commit**

```bash
cd app && git -c gpg.program=/opt/homebrew/bin/gpg commit -am "feat(web): add daily-rotating example-search picker" && cd ..
```

(Stage with `git add app/web/src/lib/daily-examples.ts app/web/src/lib/__tests__/daily-examples.test.ts` first if `-am` misses the new files.)

---

### Task 2: Wire the picker into the home page

**Files:**
- Modify: `app/web/src/app/[locale]/page.tsx`

**Interfaces:**
- Consumes: `pickDailyExamples(locale, new Date())` from Task 1.
- Produces: nothing downstream.

- [ ] **Step 1: Update imports and remove the hardcoded constant**

In `app/web/src/app/[locale]/page.tsx`:

Change the next-intl import (line 2) from:

```ts
import { useTranslations } from 'next-intl'
```

to:

```ts
import { useLocale, useTranslations } from 'next-intl'
```

Add, alongside the other `@/` imports:

```ts
import { pickDailyExamples } from '@/lib/daily-examples'
```

Delete the module-level constant (line 19):

```ts
const EXAMPLE_SEARCHES = ['Harry Potter', 'Dumbledore', 'Quidditch', 'Snitch', 'Charms']
```

- [ ] **Step 2: Compute and render the daily examples**

In the `Home` component body, after `const t = useTranslations('home')`, add:

```ts
  const locale = useLocale()
  const examples = pickDailyExamples(locale, new Date())
```

Change the chip map from `EXAMPLE_SEARCHES.map((ex) => (` to `examples.map((ex) => (`. Leave the `Badge` / `Link` markup unchanged.

- [ ] **Step 3: Verify typecheck, lint, and full test suite**

Run from `app/`:

```bash
npm run typecheck
npm run lint -w web
npm test -w web
```

Expected: all pass. (`page.tsx` has no dedicated unit test; correctness of the picker is covered by Task 1, and typecheck confirms the wiring.)

- [ ] **Step 4: Commit**

```bash
cd app && git -c gpg.program=/opt/homebrew/bin/gpg commit -am "feat(web): rotate home example searches daily" && cd ..
```

---

## Self-Review

**Spec coverage:**
- Five chips, rotating daily, date-seeded, stable within day → Task 1 picker (UTC day-number seed) + Task 2 wiring. ✓
- Locale-aware `en`/`de` pools, unknown → `en` → Task 1 `POOLS` + fallback, tested. ✓
- Curated data in code, not messages.json → Task 1 module constant. ✓
- No DB query / no admin UI / no personalization (non-goals) → not introduced. ✓
- Tests: determinism, intra-day stability, rotation, distinct count, small pool, locale fallback → Task 1 Step 1. ✓

**Placeholder scan:** No TBD/TODO; all code blocks concrete. The `de` term accuracy caveat from the spec is handled by the `de`-contains-`Schnatz` test plus concrete pool values; any term found not to return results in the live index can be swapped post-merge without code-structure change.

**Type consistency:** `pickDailyExamples(locale: string, date: Date, count = 5): string[]` is defined once in Task 1 and consumed with matching arity in Task 2. `POOLS`, `mulberry32`, `shuffle` are private to the module.
