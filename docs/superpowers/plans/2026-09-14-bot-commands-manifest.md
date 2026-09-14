# Bot Commands Manifest Implementation Plan (Phase 2 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Describe the Discord bot's command surface once, in `@revelio/core`, so the docs can render reference tables that cannot drift from what the bot actually registers with Discord.

**Architecture:** A typed `BOT_COMMANDS` manifest in `core/src/bot-commands.ts` carries *structure only* - option names, types, required and autocomplete flags, choice sources, ephemerality. Descriptions stay out of it: Discord's are terse and length-capped, the docs' are prose, and prose does not drift silently. The bot keeps its fluent `SlashCommandBuilder` code; a conformance test asserts the two agree.

**Tech Stack:** TypeScript, vitest, discord.js 14.

**Spec:** `docs/superpowers/specs/2026-09-14-docs-section-design.md`

## Global Constraints

- **Run every command from `app/`**, the npm workspaces root. `npm -w <pkg> ...` fails when run from inside a workspace directory.
- On this machine `node`/`npm` are not on the default PATH - use `/usr/local/bin/npm`, and `/opt/homebrew/bin/gpg` for commit signing (`git -c gpg.program=/opt/homebrew/bin/gpg commit`).
- **Conventional Commits**, `type(scope): subject`. Scope is `core` or `bot`. Imperative, lower case, no trailing period, <= 72 chars. **No tool attribution.**
- **Branch first.** Never commit to `main`.
- `type` aliases, never `interface`. Type-only imports say `type`. **Declaration order within a file: types -> constants -> helpers -> exported functions.**
- **Code comments are ASCII only** - no em-dashes, no unicode arrows.
- Dependency direction is `core <- {search, db} <- {ingest, web, bot}`. `core` must stay framework-agnostic with no I/O, and must **not** import from `bot`, `discord.js`, or anything else.
- This phase is independent of phase 1 (the MDX pipeline) and can be built and merged before, after, or alongside it.

---

### Task 1: The manifest

**Files:**
- Create: `app/core/src/bot-commands.ts`
- Modify: `app/core/src/index.ts`
- Create: `app/core/test/bot-commands.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, all exported from the `@revelio/core` barrel:
  - `type CommandOptionSpec = { name: string; type: 'string' | 'integer'; required: boolean; autocomplete: boolean; choices?: 'lessons' | 'types'; min?: number }`
  - `type BotCommandSpec = { name: BotCommandName; ephemeral: boolean; linkRequired: boolean; options: readonly CommandOptionSpec[] }`
  - `type BotCommandName = 'card' | 'search' | 'deck' | 'collection' | 'mydecks'`
  - `const BOT_COMMANDS: readonly BotCommandSpec[]`

  Task 2 and phase 4's `<CommandTable>` both read `BOT_COMMANDS`.

- [ ] **Step 1: Write the failing test**

Create `app/core/test/bot-commands.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { BOT_COMMANDS } from '../src/bot-commands'
import { LESSONS, TYPES } from '../src/attributes'

describe('BOT_COMMANDS', () => {
  it('names each command exactly once', () => {
    const names = BOT_COMMANDS.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })

  // Discord rejects an option name that is not lower case, and a rejected
  // registration takes every command down with it, not just the bad one.
  it('gives every option a lower-case name', () => {
    for (const command of BOT_COMMANDS) {
      for (const option of command.options) {
        expect(option.name).toBe(option.name.toLowerCase())
      }
    }
  })

  // A command that answers about the asker rather than about the game needs an
  // account to answer from, and its answer is nobody else's business. The two
  // properties travel together; splitting them is how one gets forgotten.
  it('marks personal commands as both ephemeral and link-required', () => {
    for (const command of BOT_COMMANDS) {
      expect(command.ephemeral).toBe(command.linkRequired)
    }
  })

  it('keeps exactly the two personal commands out of the channel', () => {
    expect(BOT_COMMANDS.filter((c) => c.ephemeral).map((c) => c.name))
      .toEqual(['collection', 'mydecks'])
  })

  // `choices` names an attribute scope rather than listing values, so the
  // rendered table reuses attrLabel and survives a new lesson or type.
  it('only sources choices from a scope that exists', () => {
    const scopes: Record<string, number> = { lessons: LESSONS.length, types: TYPES.length }
    for (const command of BOT_COMMANDS) {
      for (const option of command.options) {
        if (!option.choices) continue
        expect(scopes[option.choices]).toBeGreaterThan(0)
        expect(option.type).toBe('string')
      }
    }
  })

  it('puts a minimum only on an integer option', () => {
    for (const command of BOT_COMMANDS) {
      for (const option of command.options) {
        if (option.min !== undefined) expect(option.type).toBe('integer')
      }
    }
  })

  it('describes the search options in the order Discord shows them', () => {
    const search = BOT_COMMANDS.find((c) => c.name === 'search')
    expect(search?.options.map((o) => o.name))
      .toEqual(['query', 'lesson', 'type', 'set', 'page'])
  })

  it('takes no options for mydecks', () => {
    expect(BOT_COMMANDS.find((c) => c.name === 'mydecks')?.options).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd app
/usr/local/bin/npm test -w @revelio/core -- test/bot-commands.test.ts
```

Expected: FAIL - cannot resolve `../src/bot-commands`.

- [ ] **Step 3: Write the manifest**

Create `app/core/src/bot-commands.ts`. Declaration order is types, then constants - there are no functions here.

```ts
export type BotCommandName = 'card' | 'search' | 'deck' | 'collection' | 'mydecks'

/**
 * One option on one slash command, as Discord sees it.
 *
 * `choices` names an attribute scope rather than listing the values, so a
 * rendered reference table resolves them through attrLabel and stays correct
 * when a lesson or card type is added. `min` is Discord's min_value and only
 * applies to an integer option.
 */
export type CommandOptionSpec = {
  name: string
  type: 'string' | 'integer'
  required: boolean
  autocomplete: boolean
  choices?: 'lessons' | 'types'
  min?: number
}

/**
 * The shape of one slash command: what a user can type and how the bot answers.
 *
 * Deliberately carries no descriptions. Discord's are terse and capped at 100
 * characters while the docs want prose, and a description is rewritten on
 * purpose rather than drifting by accident. What drifts silently is structure -
 * an option added, renamed, or made required - so structure is what lives here.
 *
 * Named BotCommandSpec, not BotCommand: bot/src/discord/commands/index.ts
 * already exports a BotCommand for the runtime shape (builder plus handlers).
 */
export type BotCommandSpec = {
  name: BotCommandName
  ephemeral: boolean
  linkRequired: boolean
  options: readonly CommandOptionSpec[]
}

// Mirrors bot/src/discord/commands/*.ts. bot/test/command-manifest.test.ts
// fails if the two ever disagree, so treat that test as the contract: change
// a builder and this array in the same commit.
export const BOT_COMMANDS: readonly BotCommandSpec[] = [
  {
    name: 'card',
    ephemeral: false,
    linkRequired: false,
    options: [{ name: 'name', type: 'string', required: true, autocomplete: true }],
  },
  {
    name: 'search',
    ephemeral: false,
    linkRequired: false,
    options: [
      { name: 'query', type: 'string', required: true, autocomplete: false },
      { name: 'lesson', type: 'string', required: false, autocomplete: false, choices: 'lessons' },
      { name: 'type', type: 'string', required: false, autocomplete: false, choices: 'types' },
      { name: 'set', type: 'string', required: false, autocomplete: true },
      { name: 'page', type: 'integer', required: false, autocomplete: false, min: 1 },
    ],
  },
  {
    name: 'deck',
    ephemeral: false,
    linkRequired: false,
    options: [{ name: 'deck', type: 'string', required: true, autocomplete: false }],
  },
  {
    name: 'collection',
    ephemeral: true,
    linkRequired: true,
    options: [{ name: 'set', type: 'string', required: false, autocomplete: true }],
  },
  {
    name: 'mydecks',
    ephemeral: true,
    linkRequired: true,
    options: [],
  },
]
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd app
/usr/local/bin/npm test -w @revelio/core -- test/bot-commands.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Prove the ephemerality test bites**

Temporarily change `collection`'s `ephemeral` to `false` and re-run. Expected: two tests FAIL - "marks personal commands as both ephemeral and link-required" and "keeps exactly the two personal commands out of the channel". Revert and re-run to confirm green. That pair is the whole reason the manifest records ephemerality, so it must be shown to fail.

- [ ] **Step 6: Export it from the barrel**

Modify `app/core/src/index.ts`. Add the line after `export * from './attributes'`:

```ts
export * from './bot-commands'
```

- [ ] **Step 7: Verify the whole core workspace**

```bash
cd app
/usr/local/bin/npm test -w @revelio/core && /usr/local/bin/npm run typecheck && /usr/local/bin/npm run lint
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/core/src/bot-commands.ts app/core/src/index.ts app/core/test/bot-commands.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(core): describe the bot's slash command surface"
```

---

### Task 2: Hold the bot to the manifest

**Files:**
- Create: `app/bot/test/command-manifest.test.ts`

**Interfaces:**
- Consumes: `BOT_COMMANDS` from `@revelio/core` (Task 1); `COMMANDS` from `bot/src/discord/commands/index.ts`, a `Map<string, BotCommand>` whose entries expose `data: SlashCommandOptionsOnlyBuilder`.
- Produces: nothing importable. This task's deliverable is the guarantee.

- [ ] **Step 1: Write the failing test**

Create `app/bot/test/command-manifest.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ApplicationCommandOptionType } from 'discord.js'
import { BOT_COMMANDS, LESSONS, TYPES } from '@revelio/core'
import { COMMANDS } from '../src/discord/commands/index'

// The manifest speaks in domain words; Discord's JSON speaks in numbers.
const OPTION_TYPE = {
  string: ApplicationCommandOptionType.String,
  integer: ApplicationCommandOptionType.Integer,
} as const

// discord.js omits a flag it was never given, so an absent `required` means
// false. Normalising both sides is what keeps the comparison honest.
function optionsOf(name: string) {
  const command = COMMANDS.get(name)
  if (!command) throw new Error(`no registered command named ${name}`)
  const json = command.data.toJSON() as {
    options?: { name: string; type: number; required?: boolean; autocomplete?: boolean }[]
  }
  return (json.options ?? []).map((option) => ({
    name: option.name,
    type: option.type,
    required: option.required ?? false,
    autocomplete: option.autocomplete ?? false,
  }))
}

describe('BOT_COMMANDS matches what the bot registers with Discord', () => {
  it('covers every registered command and invents none', () => {
    expect(BOT_COMMANDS.map((c) => c.name).slice().sort())
      .toEqual([...COMMANDS.keys()].sort())
  })

  for (const command of BOT_COMMANDS) {
    it(`/${command.name} declares the options the builder registers`, () => {
      expect(optionsOf(command.name)).toEqual(
        command.options.map((option) => ({
          name: option.name,
          type: OPTION_TYPE[option.type],
          required: option.required,
          autocomplete: option.autocomplete,
        })),
      )
    })
  }

  // The manifest records the scope, not the values. If the builder stopped
  // offering every value, a docs table built from the scope would overstate
  // what a user can pick.
  it('offers every lesson and every type as a choice on /search', () => {
    const json = COMMANDS.get('search')!.data.toJSON() as {
      options: { name: string; choices?: unknown[] }[]
    }
    const byName = new Map(json.options.map((option) => [option.name, option]))
    expect(byName.get('lesson')?.choices).toHaveLength(LESSONS.length)
    expect(byName.get('type')?.choices).toHaveLength(TYPES.length)
  })

  // Page 0 is not a page. Discord enforces the floor client-side, so losing it
  // turns a typo into an empty embed rather than a validation message.
  it('keeps the page floor on /search in step with the manifest', () => {
    const json = COMMANDS.get('search')!.data.toJSON() as {
      options: { name: string; min_value?: number }[]
    }
    const page = json.options.find((option) => option.name === 'page')
    const spec = BOT_COMMANDS.find((c) => c.name === 'search')!
      .options.find((option) => option.name === 'page')
    expect(page?.min_value).toBe(spec?.min)
    expect(spec?.min).toBe(1)
  })
})
```

- [ ] **Step 2: Run it to verify it passes immediately**

```bash
cd app
/usr/local/bin/npm test -w @revelio/bot -- test/command-manifest.test.ts
```

Expected: PASS, 8 tests (one per command, plus three shared). This test is written against code that already exists, so unlike the rest of the plan it is green on first run. Step 3 is what proves it is worth keeping.

- [ ] **Step 3: Prove the conformance test bites, three ways**

Each mutation must fail the test. Revert after each one and confirm green again before trying the next.

1. In `app/bot/src/discord/commands/card.ts`, change `o.setName('name')` to `o.setName('card')`.
   Expected: `/card declares the options the builder registers` FAILS.
2. In `app/bot/src/discord/commands/collection.ts`, delete the `.setAutocomplete(true)` line.
   Expected: `/collection declares the options the builder registers` FAILS.
3. In `app/bot/src/discord/commands/search.ts`, change `.setMinValue(1)` to `.setMinValue(0)`.
   Expected: `keeps the page floor on /search in step with the manifest` FAILS.

If any mutation passes, the test is not checking what it claims and must be fixed before committing.

- [ ] **Step 4: Verify the whole bot workspace**

```bash
cd app
/usr/local/bin/npm test -w @revelio/bot && /usr/local/bin/npm run typecheck && /usr/local/bin/npm run lint
```

Expected: all pass, and the bot suite total is 8 higher than before this task.

- [ ] **Step 5: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/bot/test/command-manifest.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "test(bot): hold the slash commands to the core manifest"
```

---

## Phase exit criteria

- `BOT_COMMANDS` is exported from `@revelio/core` and describes all five commands.
- `bot/test/command-manifest.test.ts` fails if a builder and the manifest disagree on an option name, type, required flag, autocomplete flag, choice count, or the page floor - each proven by mutation.
- `npm test`, `npm run typecheck` and `npm run lint` pass from `app/`.

## What this phase deliberately does not do

It does not change what the bot registers with Discord. The builders keep their fluent form
and their per-option `setDescriptionLocalizations` calls; generating them from the manifest
was considered and rejected in the spec, because it would change what is sent to Discord in
exchange for a guarantee the conformance test already gives.

It also adds no descriptions. The `<CommandTable>` component that renders this manifest, and
the prose around it, are phase 3 and phase 4.
