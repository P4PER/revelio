# Discord Command Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "What you can type" section of `/discord` with a two-column
section: a larger heading, the channel/private legend and a "Get started" timeline on
the left, a mock of Discord's slash-command menu on the right, and a full-width
reference tile below both.

**Architecture:** `command-grid.tsx` stops drawing tiles and becomes the section shell
that composes three new leaf components in `components/discord/`: `CommandPicker` (the
Discord window), `GetStarted` (the steps panel) and `ReferenceTile` (moved out and
enlarged). Command structure keeps coming from `BOT_COMMANDS` in `@revelio/core`; the
Discord colours keep coming from `lib/discord-palette.ts`, as the hero mock's do.

**Tech Stack:** Next.js 16 App Router, next-intl, Tailwind v4, lucide-react, Vitest +
Testing Library.

**Spec:** the approved mockup, version 5 of
https://claude.ai/artifact/KubY3MFW14bXsMnRF4GWiw (private; its decisions are copied into
this plan, so the plan stands alone).

## Global Constraints

- Every user-facing string goes into `messages/en.json` **and** `messages/de.json` under
  `discord.*`. Command names, option names and the sample usernames are data, not copy.
- Command list order stays `ORDER` (`card, search, deck, decks, collection, mydecks`);
  options and channel/private come from `BOT_COMMANDS` (`options`, `ephemeral`), never a
  hand-written list.
- The Discord window uses only `lib/discord-palette.ts` constants (add new ones there), never
  theme tokens: it depicts Discord and does not follow the visitor's theme.
- Everything outside the window uses theme tokens (`text-heading`, `text-primary-ink`,
  `bg-card`, `border-border`, ...) and must read in both themes.
- Code comments ASCII-only. `type` aliases, `import type`, no barrels, leaf imports.
- Do not mix named and arbitrary responsive variants on one property; use `sm:` / `lg:`.
- Locale-aware links go through `Link` from `@/../i18n/navigation`.
- Commits are Conventional Commits with scope `web`, no tool attribution, signed with
  `git -c gpg.program=/opt/homebrew/bin/gpg commit`.

## Review Focus

1. **German copy is longer.** "Vollständige Referenz", "Nur du", the step texts: nothing may
   clip or force horizontal scroll at 360 px. Pinned by the screenshot step in Task 4 (`de`, 360 px).
2. **No invite URL** (fresh database). Step 1 must still render its title and text, just
   without a button. Pinned by a `GetStarted` test with `inviteUrl={null}`.
3. **Phone width.** The picker's app rail and the "Channel"/"Only you" words hide below
   `sm`, the icons stay; option pills wrap inside the row. Pinned by the screenshot step.
4. **Light theme.** The Discord window stays dark on the light page; the gold "Read the
   reference" button keeps legible text. Pinned by the light-theme screenshot.
5. **Reduced motion.** The message-box caret must not blink under
   `prefers-reduced-motion`. Pinned by a class assertion (`motion-reduce:animate-none`) in Task 1.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `app/web/src/lib/discord-palette.ts` | add `DISCORD_ACTIVE`, `DISCORD_RULE`, `DISCORD_PILL` |
| `app/web/src/components/discord/bot-avatar.tsx` | **new**: `BotAvatar`, moved out of `command-channel.tsx`, now shared |
| `app/web/src/components/discord/command-channel.tsx` | import `BotAvatar`; use `DISCORD_RULE` for its header border |
| `app/web/src/components/discord/command-picker.tsx` | **new**: the Discord window with the slash-command menu |
| `app/web/src/components/discord/get-started.tsx` | **new**: the three-step timeline panel |
| `app/web/src/components/discord/reference-tile.tsx` | **new**: the enlarged reference tile |
| `app/web/src/components/discord/discord-cta.tsx` | optional `size` prop |
| `app/web/src/components/discord/command-grid.tsx` | section shell composing the three |
| `app/web/src/app/[locale]/discord/page.tsx` | pass `inviteUrl` to `CommandGrid` |
| `app/web/messages/{en,de}.json` | new and retired `discord.*` keys |
| `__tests__/` beside each | one test file per new component; existing two updated |

---

### Task 1: CommandPicker

**Files:**
- Create: `app/web/src/components/discord/bot-avatar.tsx`
- Create: `app/web/src/components/discord/command-picker.tsx`
- Modify: `app/web/src/components/discord/command-channel.tsx` (drop local `BotAvatar`, import it; `#26282c` -> `DISCORD_RULE`)
- Modify: `app/web/src/lib/discord-palette.ts`
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json`
- Test: `app/web/src/components/discord/__tests__/command-picker.test.tsx`

**Interfaces:**
- Produces: `export function CommandPicker()` (no props); `export function BotAvatar({ className }: { className?: string })`
- Produces palette: `DISCORD_ACTIVE = '#404249'`, `DISCORD_RULE = '#26282c'`, `DISCORD_PILL = '#5865F2'` (used at alpha via `color-mix` or an rgba literal derived from it)

**Design (from the mockup):**
- Window: `rounded-xl overflow-hidden shadow-2xl`, background `DISCORD_CHANNEL`, text `DISCORD_TEXT`.
- Header bar: `#` + `t('channelName')` (reuse `deck-talk`), then a muted topic `t('picker.topic')` after a 1 px divider, truncating.
- History (`aria-hidden`, masked to fade out at the top, `hidden sm:flex`): two messages,
  letter avatars (`#3ba55d` "N", `#eb459e` "L"), names `nevillefan` and `luna.l` (data),
  times `21:02` / `21:03`, text `t('picker.history1')` / `t('picker.history2')`.
- Menu popover above the message box: background `DISCORD_EMBED`, a 48 px rail
  (`DISCORD_SELECT`, `hidden sm:flex`) holding `BotAvatar` ringed in `DISCORD_BLURPLE` plus
  two faded placeholder circles, then the list: header row (small `BotAvatar` + `t('botName')`,
  uppercase, `DISCORD_MUTED`), then a `<ul>` with one `<li>` per command in `ORDER`.
- Row: line 1 is `/{name}` (bold, `DISCORD_HEADING`) followed by one `<code>` pill per option
  (mono, `DISCORD_MENTION` text, blurple tint background + border, an `after:content-[':']`
  colon in `DISCORD_MUTED`); a command with no options shows `t('picker.noOptions')` in muted
  italics instead. Line 2 is `t('commands.<name>.description')` muted. Right column, spanning
  both lines: `Users` icon + `t('picker.channel')` in `DISCORD_MENTION` when `!ephemeral`,
  `Lock` icon + `t('picker.onlyYou')` in `DISCORD_MUTED` when `ephemeral`; the word is
  `hidden sm:inline`. First row has `DISCORD_ACTIVE` background (selected).
- Message box (`aria-hidden`): `DISCORD_INPUT`, round `+`, then `/card`, a `name` pill,
  `t('sample.cardName')`, and a caret `animate-caret-blink motion-reduce:animate-none`.
- Root: `role="group"` with `aria-label={t('picker.label')}`.
- Move `ORDER`/`COMMANDS` from `command-grid.tsx` into this file (with their comment); nothing else needs them after Task 4.

**Copy:**

| key | en | de |
| --- | --- | --- |
| `picker.label` | Revelio's commands as Discord lists them | Revelios Befehle, wie Discord sie anzeigt |
| `picker.topic` | Brewing, trading and arguing about rulings | Decks bauen, tauschen und über Regeln streiten |
| `picker.history1` | wait, can Alohomora fetch an Adventure too? | Moment, kann Alohomora auch ein Abenteuer holen? |
| `picker.history2` | pretty sure, let me check | glaube schon, ich schau nach |
| `picker.channel` | Channel | Kanal |
| `picker.onlyYou` | Only you | Nur du |
| `picker.noOptions` | no options | keine Optionen |

- [ ] **Step 1: Write the failing tests** in `command-picker.test.tsx` (render inside `NextIntlClientProvider` with `en`, as `command-grid.test.tsx` does):
  - `lists every command the bot registers`: for each `BOT_COMMANDS` entry, `getByText('/'+name, { selector: 'span' })` exists.
  - `shows exactly the options the manifest declares`: per command, the row `li`'s `code` texts equal `command.options.map(o => o.name)`.
  - `labels each row by who sees the answer`: per command, the row contains `Channel` when `!ephemeral`, `Only you` when `ephemeral`.
  - `says when a command takes no options`: the `/mydecks` row contains `no options`.
  - `keeps the caret still under reduced motion`: the caret element's class matches `/motion-reduce:animate-none/`.
  - `names the window for assistive tech`: `getByRole('group', { name: "Revelio's commands as Discord lists them" })`.
- [ ] **Step 2: Run** `npm test -w web -- src/components/discord/__tests__/command-picker.test.tsx` from `app/`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** palette constants, `bot-avatar.tsx` (the existing avatar, `className` merged via `cn`), `command-picker.tsx`, the copy in both catalogs; switch `command-channel.tsx` to the shared avatar.
- [ ] **Step 4: Run** the new test plus `src/components/discord` and `src/app/[locale]/discord`. Expected: PASS (the hero mock still renders identically).
- [ ] **Step 5: Commit** `feat(web): draw the bot's commands as Discord's slash menu`

### Task 2: GetStarted

**Files:**
- Create: `app/web/src/components/discord/get-started.tsx`
- Modify: `app/web/src/components/discord/discord-cta.tsx`
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json`
- Test: `app/web/src/components/discord/__tests__/get-started.test.tsx`

**Interfaces:**
- Produces: `export function GetStarted({ inviteUrl }: { inviteUrl: string | null })`
- Produces: `DiscordCta({ inviteUrl, size }: { inviteUrl: string | null; size?: 'sm' | 'default' })`, `size` forwarded to `Button`, default unchanged.

**Design:** a `bg-card border-border rounded-2xl` panel titled `t('steps.title')` (small
uppercase, `text-muted-foreground`, an `h3`). An `<ol>` timeline: each step a 32 px solid
`bg-primary text-primary-foreground` number circle, joined to the next by a 2 px vertical
line (`bg-gradient-to-b from-primary/50 to-border`, absent after the last). Title
`text-base font-semibold`, body `text-sm text-muted-foreground`, then the action:
1. `<DiscordCta inviteUrl={inviteUrl} size="sm" />` (renders nothing without a URL).
2. `Link` to `/settings/connections`: outlined gold pill, `t('steps.linkAction')` rendered as "Settings › Connections" with a `ChevronRight` between the two parts (`t.rich` with no markup is fine; two keys are not needed).
3. `Kbd` from `@/components/ui/kbd` with `/`, enlarged via `className` (`h-9 min-w-9 text-lg font-mono text-primary-ink border-b-[3px]`), followed by `t('steps.typeBody')`.

**Copy** (update `steps.*`; `addBody` and `addTitle`/`linkTitle`/`typeTitle` stay):

| key | en | de |
| --- | --- | --- |
| `steps.title` | Get started | Loslegen |
| `steps.linkBody` | Only for `<cmd>/collection</cmd>` and `<cmd>/mydecks</cmd>`. | Nur für `<cmd>/collection</cmd>` und `<cmd>/mydecks</cmd>`. |
| `steps.linkAction` | Settings `<sep></sep>` Connections | Einstellungen `<sep></sep>` Verbindungen |
| `steps.typeBody` | in any channel the bot can see | in jedem Kanal, den der Bot sieht |

- [ ] **Step 1: Write the failing tests** in `get-started.test.tsx` (mock `@/../i18n/navigation` `Link` as the other tests do):
  - `renders the three steps in order`: the `listitem`s' headings read `Add the bot`, `Link your account`, `Type a slash`.
  - `offers the install button when there is an invite url`: `getByRole('link', { name: /Add to Discord/ })` has `href` = the URL.
  - `keeps step one without an invite url`: with `null`, `Add the bot` is present and no `Add to Discord` link.
  - `links the account step to the connections settings`: `getByRole('link', { name: /Settings.*Connections/ })` has `href` `/settings/connections`.
  - `shows the slash as a key`: `getByText('/', { selector: 'kbd' })`.
  - `renders the step commands as code chips`: `/collection` and `/mydecks` with `selector: 'code'`.
- [ ] **Step 2: Run** the test file. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `get-started.tsx`, the `size` prop, the copy.
- [ ] **Step 4: Run** the test file. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): turn the bot setup steps into a timeline with actions`

### Task 3: ReferenceTile

**Files:**
- Create: `app/web/src/components/discord/reference-tile.tsx` (move from `command-grid.tsx`, keep its doc comment, update it)
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json`
- Test: `app/web/src/components/discord/__tests__/reference-tile.test.tsx`

**Interfaces:**
- Produces: `export function ReferenceTile({ href }: { href: string })`, rendering a `Link` (no `li` wrapper any more; it sits outside the list).

**Design:** full width, `mt-12 rounded-2xl border border-dashed border-primary/50 bg-card p-6 sm:p-8`, hover `border-solid border-primary`. Grid: a 56 px icon square (`bg-foreground/10`, `BookText` size-7 `text-primary-ink`), then title (`text-xl sm:text-2xl font-semibold`) over `reference.description`, then from `sm:` up a third column holding a non-interactive `span` styled as a primary button: `t('reference.action')` + `ArrowRight` (`bg-primary text-primary-foreground rounded-lg px-4 py-2 font-semibold`). Below `sm:` the button span drops under the text. One link, so one tab stop.

**Copy:** `reference.action`: "Read the reference" / "Zur Referenz".

- [ ] **Step 1: Write the failing tests**:
  - `links to the given docs route`: `getByRole('link', { name: /Full reference/ })` has `href` `/docs/discord`.
  - `ends with the read-the-reference call to action`: the link's last element child contains `Read the reference` and an `svg` with class `/lucide-arrow-right/`.
  - `is a single tab stop`: the link contains no `a` or `button` descendants.
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): give the bot reference its own full-width tile`

### Task 4: Section shell

**Files:**
- Modify: `app/web/src/components/discord/command-grid.tsx`
- Modify: `app/web/src/app/[locale]/discord/page.tsx`
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json`
- Test: `app/web/src/components/discord/__tests__/command-grid.test.tsx`, `app/web/src/app/[locale]/discord/__tests__/discord.test.tsx`

**Interfaces:**
- Consumes: `CommandPicker()`, `GetStarted({ inviteUrl })`, `ReferenceTile({ href })`.
- Produces: `CommandGrid({ docsHref, inviteUrl }: { docsHref?: string | null; inviteUrl: string | null })`.

**Design:** keep `<section id="commands" aria-labelledby="commands-title" className="scroll-mt-8 border-t border-border/60 py-14">`. Inside, `grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center`. Left column: `h2` `text-3xl sm:text-4xl font-semibold tracking-tight text-balance` (left-aligned) from `t.rich('commandsTitle', { b })` with the `b` part `text-heading`; `commandsIntro` `text-muted-foreground max-w-[42ch]`; the legend, two rows each with a `text-primary-ink` icon (`Users` then `Lock`): `channelNote` (keeps the `<cmd>` chips) and `privateNote`; then `<GetStarted inviteUrl={inviteUrl} />`. Right column: `<CommandPicker />`. After the grid: `{docsHref && <ReferenceTile href={docsHref} />}`. `page.tsx` passes `inviteUrl`.

**Copy:**

| key | en | de |
| --- | --- | --- |
| `commandsTitle` | Type a slash. `<b>`Pick a command.`</b>` | Slash tippen. `<b>`Befehl wählen.`</b>` |
| `commandsIntro` | Every command shows up in any channel the bot can see. Discord fills in the options as you go. | Jeder Befehl erscheint in jedem Kanal, den der Bot sieht. Die Optionen ergänzt Discord beim Tippen. |
| `channelNote` | `<cmd>/card</cmd>` and `<cmd>/deck</cmd>` answer in the channel. | `<cmd>/card</cmd>` und `<cmd>/deck</cmd>` antworten im Kanal. |
| `privateNote` | Everything else answers only you until you share it. | Alles andere antwortet nur dir, bis du es teilst. |

The new `commandsIntro` has no `<slash>` tag, so its `t.rich` handler goes and it becomes a plain `t()`. No key is retired outright; every existing `discord.*` key is either reused or rewritten above.

- [ ] **Step 1: Update the tests first.**
  - `command-grid.test.tsx`: render with `inviteUrl={null}`. Drop the tile-structure tests that moved (`lists every command`, `shows exactly the options`, `lets the reference tile span its row`, `ends the reference tile with a chevron`; Tasks 1 and 3 cover them). Keep `names the commands that answer in the channel, once` against the new `channelNote` (it no longer contains the private sentence: assert `privateNote` text is a separate element). Keep the hide/show reference tests. Change the heading test to `{ level: 2, name: 'Type a slash. Pick a command.' }`.
  - `discord.test.tsx`: region name becomes `'Type a slash. Pick a command.'`; add `shows the install button in the steps too`: with an invite URL there are two `Add to Discord` links, both with the URL; with `null`, none.
- [ ] **Step 2: Run** both files. Expected: FAIL on the heading and the second CTA.
- [ ] **Step 3: Implement** the shell, the page prop, the copy.
- [ ] **Step 4: Run** from `app/`: `npm test -w web`, `npm run typecheck`, `npm run lint`. Expected: all green; record the test count.
- [ ] **Step 5: Look at it.** Prod build + Playwright screenshots (the repo's chromium, `E2E_PORT=3100`) of `/en/discord#commands` and `/de/discord#commands` at 1280 px dark, 1280 px light and 360 px dark. Check Review Focus 1, 3 and 4: no horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`), nothing clipped, rail and labels hidden at 360 px, gold button legible in light.
- [ ] **Step 6: Commit** `feat(web): rebuild the bot commands section around the slash menu`

### Finish

- [ ] Push `feat/discord-command-picker`, open a PR titled `feat(web): redesign the bot commands section on /discord`, body per the PR conventions with `## Verification` listing the real commands and counts, and linking this plan. No deployment steps needed (no env, migration or ingest).
