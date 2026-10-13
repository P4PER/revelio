# Bot Components V2, Phase 2b: Search browser polish - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Fix what the first dev-guild look at the phase 2 browser turned up: unlabelled filter
menus, no way to change the query without rerunning the command, filter-only searches in index
order, a share picker that may never fire, and a redundant "Posted" message.

**Architecture:** All changes stay inside the phase 2 modules (`v2/search-view.ts`,
`v2/share-view.ts`, `components/search-browser.ts`, `components/custom-id.ts`) plus one router
branch in `handle-interaction.ts` for modal submits. No stored state: every new control carries
its state in its custom id, as before.

**Spec:** `docs/superpowers/specs/2026-10-13-bot-components-v2-design.md`, sections 2 and 5 -
this plan amends both (Task 6). **Follows:** the phase 2 plan
(`2026-10-13-bot-components-v2-phase-2-card-browsing.md`), same branch `feat/bot-card-browsing`.

## Global Constraints

As phase 2: Conventional Commits signed with `git -c gpg.program=/opt/homebrew/bin/gpg commit`,
commands from `app/` with `/usr/local/bin/npm`, every string in both bot catalogs, ASCII-only
comments, every message through `v2Message` / `v2Edit`, ids decoded as untrusted input.
**Never run a bare `npm test` from `app/`**: the ingest suite deletes the dev Meilisearch index.
Verify with `npm test -w <workspace>` for core, search, bot and web.

## Decisions

- **Labels.** A message select cannot carry a label. An unset filter selects nothing, so its
  placeholder shows: "Any lesson" / "Any card type" / "Any set". A set filter shows the chosen
  option. The "Any" option stays in each list to clear the filter.
- **Search input.** Text inputs exist only in modals. The header becomes a Section whose
  accessory is a "Search" button (`sq`, card state); it opens a modal (`sm`, card state) with one
  text input (custom id `query`, prefilled, max 50, not required). Submitting redraws the browser
  on page 1 with the filters kept. Cost: 2 components, 33 -> 35 of 40.
- **Order.** An empty query sorts by `numberSort:asc` (the site's "number" sort), so a set
  browses #1, #2, ...; the site link carries `sort=number` in that case so both agree. A query
  keeps relevance.
- **Share picker.** The select (`sp`) no longer posts. Changing it redraws the picker; a **Post**
  button (`sx`) posts. `sx` carries the selection as a bitmask of page positions (5 rows -> one
  base-36 character), since five card ids do not fit in 100 characters. Post re-reads the page
  and takes the rows at those positions. Initial mask: all rows.
- **No "Posted" message.** The post is visible in the channel; only refusals answer privately.
  `post.done` is removed.

---

### Task 1: Placeholders as labels

**Files:** `app/bot/src/discord/v2/search-view.ts`, `app/bot/src/i18n/{en,de}.json`,
`app/bot/test/search-view.test.ts`

- [ ] **Step 1: Failing test.** Replace `marks the active filter value and offers Any` with: an
  unset lesson select has no default option and placeholder `Any lesson`; a set lesson select
  marks `charms` default and `Any` (value `-`) not default. Add: the type and set selects'
  placeholders are `Any card type` / `Any set`. Run `npm test -w @revelio/bot -- test/search-view.test.ts`, expect FAIL.
- [ ] **Step 2:** In `filterSelect`, the Any option's `default` is always `false`. Catalog values:
  `search.filter.lesson` en `Any lesson` / de `Alle Lektionen`; `search.filter.type` en
  `Any card type` / de `Alle Kartentypen`; `search.filter.set` en `Any set` / de `Alle Sets`.
- [ ] **Step 3:** Run the test file and `test/catalog-parity.test.ts`, expect PASS. Commit
  `fix(bot): label the search filters with their placeholders`.

### Task 2: An empty query browses in card-number order

**Files:** `app/bot/src/data/cards.ts`, `app/bot/src/links.ts`, `app/bot/src/discord/v2/search-view.ts`,
`app/bot/src/discord/v2/share-view.ts`, tests `cards.test.ts`, `links.test.ts`, `search-view.test.ts`

- [ ] **Step 1: Failing tests.** `findCards` with `query: ''` passes `sort: ['numberSort:asc']`;
  with a query, no sort. `searchUrl(..., { sort: 'number' })` appends `sort=number`. The browser's
  site link for an empty query ends in `&sort=number`.
- [ ] **Step 2:** `findCards`: `sort: input.query.trim() ? undefined : [NUMBER_SORT]` with
  `NUMBER_SORT = 'numberSort:asc'` and a comment naming the site's sort it mirrors.
  `SearchLinkFilters` gains `sort?: 'number' | null`; `searchUrl` sets it. Both views pass
  `sort: state.query ? null : 'number'`.
- [ ] **Step 3:** Tests PASS, `npm run typecheck`. Commit
  `fix(bot): browse a search without a query in card-number order`.

### Task 3: No private "Posted" message

**Files:** `app/bot/src/discord/components/search-browser.ts`, catalogs, `search-browser.test.ts`

- [ ] **Step 1: Failing test.** In `posts it as a plain channel message ...` and
  `posts the picked cards ...`: `expect(c.followUp).not.toHaveBeenCalled()`.
- [ ] **Step 2:** Drop the two `followUp(post.done)` calls; `sendToChannel`'s boolean result is
  then unused by `postCard`, so it returns `void`; remove `post.done` from both catalogs.
- [ ] **Step 3:** PASS. Commit `fix(bot): drop the private "posted" line after a post`.

### Task 4: The share picker posts on a button

**Files:** `custom-id.ts`, `v2/share-view.ts`, `components/search-browser.ts`, catalogs,
tests `custom-id.test.ts`, `share-view.test.ts`, `search-browser.test.ts`

- [ ] **Step 1: Failing tests.**
  - custom-id: `{ kind: 'sx', mask: 0b10110, state }` round-trips; the worst case (mask 31, every
    filter, longest set, 50-char multi-byte query, page 9999) is <= 100; a mask outside 1..31 or
    not one base-36 character decodes to null.
  - share-view: `sharePicker(hits, state, mask, locale)` marks only the masked rows default and
    carries a Post button whose id decodes to `{ kind: 'sx', mask }`; Cancel still goes to `s`.
  - browser: an `sp` change with values `['base-1','base-3']` redraws the picker (no send) with
    Post carrying mask `0b00101`; `sx` with that mask sends a list of exactly Card 1 and Card 3,
    in page order, then shows the browser; `sx` refuses privately without permission;
    `sh` opens the picker with every row selected.
- [ ] **Step 2: Codec.** `CustomId` gains `{ kind: 'sx'; mask: number; state: CardBrowseState }`,
  encoded `v1:sx:<mask base36>:<card fields>`; `MAX_MASK = 31` (five rows). Comment the kind list.
- [ ] **Step 3: View.** `sharePicker` takes `mask`; option `default` is `(mask >> i) & 1`; the
  button row is `[Post] [Cancel]`. Key `search.share.post`: en `Post`, de `Posten`.
- [ ] **Step 4: Handlers.** `sp`: deferUpdate, re-read the page, mask = positions of the picked
  values that are on the page (values filtered by `isEntityId`), at least one, else all; redraw
  the picker. `sx`: postTarget first (reply on refusal), deferUpdate, re-read the page, take
  `hits.filter((_, i) => mask >> i & 1)`; none left -> redraw the browser; else send the share
  view and redraw the browser. The old `sharePicked` ids-read path goes. Register `sx`.
- [ ] **Step 5:** PASS. Commit `fix(bot): post shared results from a button, not the menu`.

### Task 5: Search from the browser

**Files:** `custom-id.ts`, `v2/search-view.ts`, `components/search-browser.ts`,
`components/index.ts`, `components/types.ts`, `handle-interaction.ts`, catalogs,
tests `custom-id.test.ts`, `search-view.test.ts`, `search-browser.test.ts`, `handle-interaction.test.ts`

- [ ] **Step 1: Failing tests.**
  - custom-id: `sq` and `sm` round-trip card state.
  - search-view: the header sits in a Section whose accessory button decodes to `sq` with the
    current state, in every state (results, empty page, no results); worst case still <= 40.
  - browser: an `sq` click calls `showModal` with a modal whose id decodes to `sm`, one text input
    `query` prefilled with the query, max length 50, not required; nothing else acknowledged.
  - router: a modal submit `sm` with field `query` = `nox` defers the update and edits the
    browser to page 1 for `nox`, filters kept; a malformed modal id answers "out of date"; a
    handler error answers `error.generic` by `editReply`.
- [ ] **Step 2: Codec.** `sq`, `sm` join `CardKind` / `CARD_KINDS`.
- [ ] **Step 3: View.** Header: `new SectionBuilder().addTextDisplayComponents(text(header)).setButtonAccessory(searchButton)`;
  button label `search.edit` (en `Search`, de `Suchen`), style Secondary, emoji none.
- [ ] **Step 4: Modal.** `sq` handler: `interaction.showModal(new ModalBuilder().setCustomId(encodeCustomId({ kind: 'sm', state })).setTitle(t('search.modal.title')).addLabelComponents(new LabelBuilder().setLabel(t('search.modal.label')).setTextInputComponent(new TextInputBuilder().setCustomId('query').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(MAX_QUERY).setValue(state.query))))`
  (`setValue` only when the query is non-empty: an empty value is rejected). Keys
  `search.modal.title` en `Search cards` / de `Karten suchen`, `search.modal.label` en
  `Search terms` / de `Suchbegriffe`.
- [ ] **Step 5: Router.** `ModalHandler = (interaction: ModalSubmitInteraction, id: CustomId, deps) => Promise<void>`
  in `types.ts`; `MODALS` map in `components/index.ts` with `['sm', submitSearch]`;
  `handle-interaction.ts` routes `interaction.isModalSubmit()` like a component (same `v<n>:`
  test, decode, out-of-date and error answers: `editReply` once deferred, else an ephemeral
  reply). `submitSearch`: deferUpdate, `clampQuery(fields.getTextInputValue('query'))`, state
  `{ ...state, query, page: 1 }`, editReply the browser.
- [ ] **Step 6:** PASS, typecheck, lint. Commit `feat(bot): change the search from the browser`.

### Task 6: Spec, docs, verify

- [ ] Spec section 2: kinds `sq`, `sm`, `sx` in the table; section 5: the layout with the header
  section, placeholders, the number order, the Post button, no "Posted". CLAUDE.md router bullet:
  modal submits route through `MODALS` the same way.
- [ ] `npm test -w @revelio/core`, `-w @revelio/search`, `-w @revelio/bot`, `-w web`;
  `npm run typecheck`; `npm run lint`; `npm run build -w @revelio/bot`. Restart the dev bot.
- [ ] Commit `docs: describe the search browser polish in the spec and CLAUDE.md`.
