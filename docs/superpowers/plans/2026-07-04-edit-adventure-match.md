# Edit Adventure/Match Fields (Plan 4b-3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let editors edit a card's structured `adventure` (`effect`/`reward`/`toSolve`) or `match` (`prize`/`toWin`) text per language, inside the existing edit form, shown only for the matching card type.

**Architecture:** Extend the 4b-2 pieces — `CardLocalizationDTO`, `upsertLocalization`, `getCardById`, the `updateLocalization` server action, and `LocalizationForm`. No new table, action, editor, or reindex path. One save writes name/text/flavor/status plus adventure/match together.

**Tech Stack:** Next.js 16 (server actions), Drizzle/postgres-js (jsonb), Zod, next-intl, Vitest.

## Global Constraints

- Editable structured fields: `adventure = { effect, reward, toSolve }` and `match = { prize, toWin }` on `card_localizations` (jsonb, per language). All sub-fields are optional strings.
- **Type-gated:** adventure fields show only when the card has type `adventure`; match fields only when type `match`. Detection via `card.types`.
- **Storage rule:** if all sub-fields of a group are empty/whitespace → store `null` (not an empty object); otherwise store the object with each sub-field `string | null`.
- The action writes **only** the group present in the input (the form sends only the group matching the card type), so the other jsonb column is never touched.
- `origin: 'user'` + `updated_at` set on every write (existing behavior).
- adventure/match are NOT in the search document → no new reindex path; the existing non-fatal reindex still runs unchanged.
- `@revelio/search` must not import `@revelio/db` (unchanged; this slice doesn't touch search).
- Env quirk: `~/.npm` is root-owned → prefix installs with `NPM_CONFIG_CACHE=/private/tmp/claude-502/-Users-timon-wegener-Desktop-revelio-cards/5736844e-b47b-4a0f-87aa-027e73f7d8a9/scratchpad/npm-cache`. You should NOT need to install anything.
- Test infra: Postgres `localhost:55432` (`revelio-testpg`), Meili `localhost:7700` key `masterKey`. Web tests: `cd app/web && TEST_MEILI_HOST=http://localhost:7700 TEST_MEILI_KEY=masterKey npx vitest run`. DB tests: `cd app/ingest && TEST_DATABASE_URL="postgres://revelio:revelio@localhost:55432/revelio" npx vitest run`.
- English identifiers; Conventional Commits.

## File Structure

```
app/core/src/domain.ts          # + AdventureData, MatchData types; CardLocalizationDTO gains adventure/match
app/db/src/queries.ts           # upsertLocalization gains adventure?/match?; getCardById maps adventure/match
app/web/src/lib/localization-actions.ts   # schema + normalize + conditional pass-through of adventure/match
app/web/src/components/localization-form.tsx  # bordered adventure/match section, kind-gated, dirty + submit
app/web/src/app/[locale]/card/[id]/edit/page.tsx  # compute kind from card.types, seed adventure/match
app/web/messages/{en,de}.json   # + edit keys: adventure, match, effect, reward, toSolve, prize, toWin
tests: app/ingest/test/localization-write.test.ts (db), app/web/src/lib/__tests__/localization-actions.test.ts,
       app/web/src/components/__tests__/localization-form.test.tsx
```

---

### Task 1: Data layer — types, DTO, `upsertLocalization`, `getCardById`

**Files:**
- Modify: `app/core/src/domain.ts`, `app/db/src/queries.ts`
- Test: `app/ingest/test/localization-write.test.ts`

**Interfaces:**
- Produces: `AdventureData = { effect: string | null; reward: string | null; toSolve: string | null }`, `MatchData = { prize: string | null; toWin: string | null }` (from `@revelio/core`); `CardLocalizationDTO.adventure: AdventureData | null` and `.match: MatchData | null`; `upsertLocalization` input gains optional `adventure?: AdventureData | null` and `match?: MatchData | null` (written only when the key is present); `getCardById` localizations expose `adventure`/`match`.

- [ ] **Step 1: Add the types + DTO fields in `app/core/src/domain.ts`**

Add near `CardLocalizationDTO`:
```ts
export type AdventureData = { effect: string | null; reward: string | null; toSolve: string | null }
export type MatchData = { prize: string | null; toWin: string | null }
```
Extend `CardLocalizationDTO` with two fields (place after `imageUrl`):
```ts
  adventure: AdventureData | null
  match: MatchData | null
```

- [ ] **Step 2: Write the failing DB test**

Append to `app/ingest/test/localization-write.test.ts` a new describe block (the file already imports `sets`, `cards`, `cardLocalizations`, `upsertLocalization`, `getCardById` may need adding to the import; add `getCardById` to the `@revelio/db` import):
```ts
describe('upsertLocalization adventure/match', () => {
  it('writes adventure and leaves match untouched when only adventure is given', async () => {
    await upsertLocalization(ctx.db, {
      cardId: 'x-1', lang: 'en', name: 'N', text: null, flavorText: null, status: 'official',
      adventure: { effect: 'e', reward: 'r', toSolve: 't' },
    })
    const rows = await ctx.db.select().from(cardLocalizations)
    const en = rows.find((r) => r.cardId === 'x-1' && r.lang === 'en')!
    expect(en.adventure).toEqual({ effect: 'e', reward: 'r', toSolve: 't' })
    expect(en.match).toBeNull()
  })

  it('nulls adventure when passed null', async () => {
    await upsertLocalization(ctx.db, {
      cardId: 'x-1', lang: 'en', name: 'N', text: null, flavorText: null, status: 'official',
      adventure: null,
    })
    const rows = await ctx.db.select().from(cardLocalizations)
    expect(rows.find((r) => r.cardId === 'x-1' && r.lang === 'en')!.adventure).toBeNull()
  })

  it('exposes adventure/match on the getCardById DTO', async () => {
    await upsertLocalization(ctx.db, {
      cardId: 'x-1', lang: 'en', name: 'N', text: null, flavorText: null, status: 'official',
      adventure: { effect: 'e', reward: null, toSolve: null },
    })
    const card = await getCardById(ctx.db, 'x-1')
    expect(card?.localizations.en?.adventure).toEqual({ effect: 'e', reward: null, toSolve: null })
    expect(card?.localizations.en?.match).toBeNull()
  })
})
```
(This reuses the `ctx`/`x-1` fixture already set up in the file's top-level `beforeAll`.)

- [ ] **Step 3: Run it — expect FAIL**

Run: `cd app/ingest && TEST_DATABASE_URL="postgres://revelio:revelio@localhost:55432/revelio" npx vitest run localization-write`
Expected: FAIL (upsert ignores adventure; DTO has no adventure).

- [ ] **Step 4: Extend `upsertLocalization` in `app/db/src/queries.ts`**

Add the import and update the function. At the top of the file add to the `@revelio/core` import (or add one) `import type { AdventureData, MatchData } from '@revelio/core'`. Replace the function:
```ts
export async function upsertLocalization(
  db: DB,
  input: {
    cardId: string
    lang: string
    name: string
    text: string | null
    flavorText: string | null
    status: string | null
    adventure?: AdventureData | null
    match?: MatchData | null
  },
): Promise<void> {
  const now = new Date()
  const base = {
    name: input.name,
    text: input.text,
    flavorText: input.flavorText,
    status: input.status,
    origin: 'user' as const,
    updatedAt: now,
  }
  const extra: { adventure?: AdventureData | null; match?: MatchData | null } = {}
  if ('adventure' in input) extra.adventure = input.adventure ?? null
  if ('match' in input) extra.match = input.match ?? null

  await db
    .insert(cardLocalizations)
    .values({ cardId: input.cardId, lang: input.lang, ...base, ...extra })
    .onConflictDoUpdate({
      target: [cardLocalizations.cardId, cardLocalizations.lang],
      set: { ...base, ...extra },
    })
}
```

- [ ] **Step 5: Map adventure/match in `getCardById`**

In `app/db/src/queries.ts`, in the `getCardById` localization loop, add the two fields to the mapped object:
```ts
    localizations[l.lang] = {
      lang: l.lang, name: l.name, status: l.status, source: l.source,
      text: l.text, flavorText: l.flavorText, imageFile: l.imageFile, imageUrl: l.imageUrl,
      adventure: (l.adventure as AdventureData | null) ?? null,
      match: (l.match as MatchData | null) ?? null,
    }
```

- [ ] **Step 6: Run the test — expect PASS**

Run: `cd app/ingest && TEST_DATABASE_URL="postgres://revelio:revelio@localhost:55432/revelio" npx vitest run localization-write`
Expected: all pass (existing + 3 new).

- [ ] **Step 7: Commit**

```bash
git add app/core/src/domain.ts app/db/src/queries.ts app/ingest/test/localization-write.test.ts
git commit -m "feat(db): upsertLocalization writes adventure/match jsonb; DTO exposes them"
```

---

### Task 2: `updateLocalization` action — validate, normalize, conditional pass-through

**Files:**
- Modify: `app/web/src/lib/localization-actions.ts`
- Test: `app/web/src/lib/__tests__/localization-actions.test.ts`

**Interfaces:**
- Consumes: `upsertLocalization` (extended in Task 1).
- Produces: `updateLocalization` accepts optional `adventure: { effect, reward, toSolve }` and `match: { prize, toWin }` (all strings); normalizes empty→null (whole group → `null` when all empty); passes only the group present in the input to `upsertLocalization`.

- [ ] **Step 1: Write the failing test (extend the existing suite)**

Add to `app/web/src/lib/__tests__/localization-actions.test.ts` (the file already mocks `@revelio/db`'s `upsertLocalization` as `m.upsertLocalization`). Add inside the `describe`:
```ts
  it('passes a normalized adventure group and omits match', async () => {
    await updateLocalization({
      ...valid,
      adventure: { effect: '  spark  ', reward: '', toSolve: '' },
    })
    expect(m.upsertLocalization).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ adventure: { effect: 'spark', reward: null, toSolve: null } }),
    )
    const arg = m.upsertLocalization.mock.calls[0][1]
    expect('match' in arg).toBe(false)
  })

  it('nulls an all-empty adventure group', async () => {
    await updateLocalization({ ...valid, adventure: { effect: '', reward: '  ', toSolve: '' } })
    expect(m.upsertLocalization).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ adventure: null }),
    )
  })
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd app/web && npx vitest run localization-actions`
Expected: FAIL (adventure not forwarded).

- [ ] **Step 3: Extend the action in `app/web/src/lib/localization-actions.ts`**

Add the sub-schemas + a normalizer, extend the schema, and forward conditionally. Add above `const schema`:
```ts
import type { AdventureData, MatchData } from '@revelio/core'

const adventureInput = z.object({ effect: z.string(), reward: z.string(), toSolve: z.string() })
const matchInput = z.object({ prize: z.string(), toWin: z.string() })

function normAdventure(a: { effect: string; reward: string; toSolve: string }): AdventureData | null {
  const effect = a.effect.trim() || null
  const reward = a.reward.trim() || null
  const toSolve = a.toSolve.trim() || null
  return effect || reward || toSolve ? { effect, reward, toSolve } : null
}
function normMatch(m: { prize: string; toWin: string }): MatchData | null {
  const prize = m.prize.trim() || null
  const toWin = m.toWin.trim() || null
  return prize || toWin ? { prize, toWin } : null
}
```
Extend `schema` with two optional fields:
```ts
  adventure: adventureInput.optional(),
  match: matchInput.optional(),
```
Replace the `upsertLocalization` call:
```ts
  const { cardId, lang, name, text, flavorText, status, adventure, match } = parsed.data
  await upsertLocalization(db, {
    cardId,
    lang,
    name,
    text: text.trim() || null,
    flavorText: flavorText.trim() || null,
    status,
    ...(adventure !== undefined ? { adventure: normAdventure(adventure) } : {}),
    ...(match !== undefined ? { match: normMatch(match) } : {}),
  })
```
(`db` is already declared just above the current call — keep that line.)

- [ ] **Step 4: Run the test — expect PASS**

Run: `cd app/web && npx vitest run localization-actions` → all pass (existing 4 + 2 new). Then `cd app/web && npx next build` → "Compiled successfully".

- [ ] **Step 5: Commit**

```bash
git add app/web/src/lib/localization-actions.ts app/web/src/lib/__tests__/localization-actions.test.ts
git commit -m "feat(web): updateLocalization accepts + normalizes adventure/match, forwards only the given group"
```

---

### Task 3: Form section + edit page + i18n

**Files:**
- Modify: `app/web/src/components/localization-form.tsx`, `app/web/src/app/[locale]/card/[id]/edit/page.tsx`, `app/web/messages/{en,de}.json`
- Test: `app/web/src/components/__tests__/localization-form.test.tsx`

**Interfaces:**
- Consumes: `updateLocalization` (extended in Task 2).
- Produces: `LocalizationForm` gains a `kind: 'adventure' | 'match' | null` prop and adventure/match values on `initial`; renders a bordered section for the matching kind and submits that group.

- [ ] **Step 1: Add the `edit` message keys**

`app/web/messages/en.json` `"edit"` — add: `"adventure": "Adventure", "match": "Match", "effect": "Effect", "reward": "Reward", "toSolve": "To solve", "prize": "Prize", "toWin": "To win"`.
`app/web/messages/de.json` `"edit"` — add German: `"adventure": "Adventure", "match": "Match", "effect": "Effekt", "reward": "Belohnung", "toSolve": "Aufgabe", "prize": "Preis", "toWin": "Siegbedingung"`.

- [ ] **Step 2: Write the failing form test (extend the suite)**

`app/web/src/components/__tests__/localization-form.test.tsx` — the existing `renderForm` builds a `LocalizationForm` with an `initial`. Update `renderForm` to accept a `kind` and pass the extended `initial`, then add tests. Replace the `renderForm` helper and add tests:
```tsx
function renderForm(kind: 'adventure' | 'match' | null = null) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <LocalizationForm
        cardId="x-1"
        lang="de"
        kind={kind}
        initial={{
          name: 'Alt', text: 'Rumpf', flavorText: '', status: 'machine',
          adventure: { effect: '', reward: '', toSolve: '' },
          match: { prize: '', toWin: '' },
        }}
      />
    </NextIntlClientProvider>,
  )
}
```
Add:
```tsx
  it('shows the Adventure section only for adventure cards', () => {
    const { unmount } = renderForm(null)
    expect(screen.queryByLabelText(en.edit.effect)).not.toBeInTheDocument()
    unmount()
    renderForm('adventure')
    expect(screen.getByLabelText(en.edit.effect)).toBeInTheDocument()
    expect(screen.queryByLabelText(en.edit.prize)).not.toBeInTheDocument()
  })

  it('submits the adventure group', async () => {
    renderForm('adventure')
    await userEvent.type(screen.getByLabelText(en.edit.effect), 'boom')
    await userEvent.click(screen.getByRole('button', { name: en.edit.save }))
    expect(updateLocalization).toHaveBeenCalledWith(
      expect.objectContaining({ adventure: { effect: 'boom', reward: '', toSolve: '' } }),
    )
  })
```
(Existing tests that call `renderForm()` with no arg still work — default `kind = null`.)

- [ ] **Step 3: Run it — expect FAIL**

Run: `cd app/web && npx vitest run localization-form`
Expected: FAIL (no `kind` prop / no Adventure section).

- [ ] **Step 4: Extend `LocalizationForm`**

In `app/web/src/components/localization-form.tsx`: extend `Initial`, add the `kind` prop, add state + dirty + submit for the groups, and render the bordered section. Update the type + signature:
```tsx
type Initial = {
  name: string
  text: string
  flavorText: string
  status: 'machine' | 'official'
  adventure: { effect: string; reward: string; toSolve: string }
  match: { prize: string; toWin: string }
}

export function LocalizationForm({
  cardId, lang, initial, kind,
}: {
  cardId: string
  lang: string
  initial: Initial
  kind: 'adventure' | 'match' | null
}) {
```
Add state after the existing `status` state:
```tsx
  const [adventure, setAdventure] = useState(initial.adventure)
  const [match, setMatch] = useState(initial.match)
```
Extend `dirty`:
```tsx
  const dirty =
    name !== initial.name ||
    text !== initial.text ||
    flavorText !== initial.flavorText ||
    status !== initial.status ||
    JSON.stringify(adventure) !== JSON.stringify(initial.adventure) ||
    JSON.stringify(match) !== JSON.stringify(initial.match)
```
Extend the `updateLocalization` call in `onSubmit`:
```tsx
    const res = await updateLocalization({
      cardId, lang, name, text, flavorText, status,
      ...(kind === 'adventure' ? { adventure } : {}),
      ...(kind === 'match' ? { match } : {}),
    })
```
Render the section between the Flavor `<label>` and the Status `<div>` (a small helper keeps it DRY — a bordered `fieldset`). Add:
```tsx
      {kind === 'adventure' && (
        <fieldset className="space-y-3 rounded-md border p-4">
          <legend className="px-1 text-sm font-medium">{t('adventure')}</legend>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('effect')}</span>
            <textarea
              aria-label={t('effect')}
              className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={adventure.effect}
              onChange={(e) => setAdventure({ ...adventure, effect: e.target.value })}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('reward')}</span>
            <textarea
              aria-label={t('reward')}
              className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={adventure.reward}
              onChange={(e) => setAdventure({ ...adventure, reward: e.target.value })}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('toSolve')}</span>
            <textarea
              aria-label={t('toSolve')}
              className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={adventure.toSolve}
              onChange={(e) => setAdventure({ ...adventure, toSolve: e.target.value })}
            />
          </label>
        </fieldset>
      )}
      {kind === 'match' && (
        <fieldset className="space-y-3 rounded-md border p-4">
          <legend className="px-1 text-sm font-medium">{t('match')}</legend>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('prize')}</span>
            <textarea
              aria-label={t('prize')}
              className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={match.prize}
              onChange={(e) => setMatch({ ...match, prize: e.target.value })}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('toWin')}</span>
            <textarea
              aria-label={t('toWin')}
              className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={match.toWin}
              onChange={(e) => setMatch({ ...match, toWin: e.target.value })}
            />
          </label>
        </fieldset>
      )}
```
(Place both blocks immediately after the Flavor `<label>...</label>` and before the Status `<div className="space-y-1">`.)

- [ ] **Step 5: Wire the edit page**

In `app/web/src/app/[locale]/card/[id]/edit/page.tsx`, compute `kind` and extend `initial`, and pass `kind` to the form. After `const loc = card.localizations[lang]`:
```ts
  const kind: 'adventure' | 'match' | null = card.types.includes('adventure')
    ? 'adventure'
    : card.types.includes('match')
      ? 'match'
      : null
  const initial = {
    name: loc?.name ?? '',
    text: loc?.text ?? '',
    flavorText: loc?.flavorText ?? '',
    status: (loc?.status === 'official' ? 'official' : 'machine') as 'machine' | 'official',
    adventure: {
      effect: loc?.adventure?.effect ?? '',
      reward: loc?.adventure?.reward ?? '',
      toSolve: loc?.adventure?.toSolve ?? '',
    },
    match: {
      prize: loc?.match?.prize ?? '',
      toWin: loc?.match?.toWin ?? '',
    },
  }
```
Change the form render to pass `kind`:
```tsx
      <LocalizationForm key={lang} cardId={id} lang={lang} initial={initial} kind={kind} />
```

- [ ] **Step 6: Run tests + build**

Run: `cd app/web && npx vitest run localization-form` → all pass (existing + 2 new).
Run: `cd app/web && TEST_MEILI_HOST=http://localhost:7700 TEST_MEILI_KEY=masterKey npx vitest run` → whole web suite green.
Run: `cd app/web && npx next build` → "Compiled successfully".

- [ ] **Step 7: Commit**

```bash
git add app/web/src/components/localization-form.tsx "app/web/src/app/[locale]/card/[id]/edit/page.tsx" app/web/messages "app/web/src/components/__tests__/localization-form.test.tsx"
git commit -m "feat(web): edit adventure/match fields in a bordered section (type-gated) on the edit form"
```

---

## Self-Review

**Spec coverage:**
- adventure `{effect,reward,toSolve}` / match `{prize,toWin}` editable per language → Tasks 1-3 ✓
- Type-gated display (adventure/match by `card.types`) → Task 3 (edit page `kind` + form) ✓
- Storage rule empty→null (whole group) → Task 2 `normAdventure`/`normMatch` ✓
- Action writes only the given group; other jsonb untouched → Task 1 (`'adventure' in input`) + Task 2 (conditional spread) + test asserting `'match' in arg === false` ✓
- `origin:'user'` + `updated_at` on write → Task 1 (unchanged `base`) ✓
- No new reindex path (adventure/match not searchable) → action unchanged reindex; nothing added ✓
- Bordered section UI after Flavor, before Status → Task 3 fieldset placement ✓
- Tests: upsert write/null/untouched + DTO exposure (Task 1), action normalize + omit-other-group (Task 2), form type-gated render + submit (Task 3) ✓
- OUT of scope (rulings, images, searchable a/m) → not built ✓

**Placeholder scan:** No TBD/TODO. Every code + test block is complete and concrete.

**Type consistency:** `AdventureData`/`MatchData` defined in Task 1 (`@revelio/core`), consumed by `upsertLocalization` (Task 1), the action's `normAdventure`/`normMatch` return types (Task 2), and seeded into the form via `CardLocalizationDTO.adventure/match` (Task 3 edit page). `kind: 'adventure' | 'match' | null` identical in the edit page (Task 3 Step 5) and the form prop (Task 3 Step 4). The action's input keys (`adventure: {effect,reward,toSolve}`) match the form's submitted shape and the Zod `adventureInput`.

## Notes for later slices
Per the spec: 4b-4 (rulings — list editor, own action) and 4b-5 (image upload — MinIO subsystem, re-indexes since `image_file` is in the search doc) each get their own spec → plan.
