# Docs section design

Date: 2026-09-14
Status: approved, not yet implemented

## Problem

`/docs/discord` is already linked and already 404s. `web/src/app/[locale]/discord/page.tsx`
sets `DOCS_HREF = '/docs/discord'` and `CommandGrid` renders a reference tile pointing at
it, promising "every option each command takes, how account linking works, and exactly what
the bot can and cannot read". Nothing serves that URL.

Revelio has no documentation surface at all. A public API is a plausible future addition,
so whatever is built for the bot has to hold a second section without being rebuilt.

## Goals

- Serve `/docs/discord` with a real reference for the five slash commands.
- A docs shell that takes an API section later with no structural change.
- Full English and German content, with missing translations failing the build rather
  than silently falling back.
- The command reference cannot drift from what the bot actually registers with Discord.

## Non-goals

These are deliberately excluded and should not creep in:

- **Docs search.** Five pages. Browser find beats a Meilisearch index, and indexing docs
  would mean a second document shape in `@revelio/search`.
- **API documentation content.** No public API exists (`web/src/app/api/` holds only the
  Better Auth catch-all). The shell supports the section; the section stays empty.
- **Versioning, changelogs, "last updated" stamps.**
- **A docs entry in the site header.** See "Discoverability".

## Routes

```
web/src/app/[locale]/docs/
  layout.tsx            three-column shell
  page.tsx              /docs hub
  [...slug]/page.tsx    one doc page, resolved through the registry
```

Slugs, all under one section for now:

| Slug                          | Page                 |
| ----------------------------- | -------------------- |
| `discord`                     | Overview             |
| `discord/commands`            | Commands             |
| `discord/linking`             | Account linking      |
| `discord/privacy`             | Privacy and limits   |
| `discord/troubleshooting`     | Troubleshooting      |

`[locale]/[...rest]` (the existing 404 catch-all) is less specific than `[locale]/docs/...`,
so it does not interfere. An unknown docs slug calls `notFound()`.

`/docs` is a **real page, not a redirect**. It is the footer link's target, so it has to
make sense on arrival, and a redirect to `/docs/discord` would have to be undone the moment
a second section exists. It renders the same shell with a section index in the content
column: a live card for the Discord bot listing its pages, and a dashed, non-interactive
"API - Planned" card.

Pages render dynamically, like the rest of the site: the `[locale]` layout reads a cookie
for the theme, so nothing beneath it is statically generated. MDX is compiled at build time,
so the per-request cost is React rendering only.

## Layout

Three columns at `>= 1180px`:

- **Left rail** - the map. Sections, then the pages within each section. The active page
  carries `aria-current="page"`.
- **Content** - one reading column, roughly 65ch.
- **Right rail** - the current page only: its `h2` and `h3` headings ("On this page"), plus
  an "Edit this page" link built from the existing `githubUrl` site setting.

The two rails never carry the same information, which is what keeps the left rail short
once a second section lands beside the Discord one.

Below 1180px the right rail is dropped. Below 860px the left rail becomes a band above the
content. The reading column never scrolls sideways; option tables scroll inside their own
`overflow-x: auto` container.

No `StarField`. It stays on `/discord`, the marketing page. Docs are read for minutes at a
time, so the ground stays flat and gold is spent only on the active page, required options,
and links. In light theme that accent is `--primary-ink` (`#875D0D`), not `--primary`
(`#F0C458`), which does not pass AA as text.

## Content pipeline

MDX compiled by `@next/mdx`. New dependencies in `web`, all small:

`@next/mdx`, `@mdx-js/loader`, `@mdx-js/react`, `rehype-slug`, `github-slugger`,
`unist-util-visit`.

`next.config.ts` becomes `withNextIntl(withMDX(nextConfig))`.

Content lives at `web/content/docs/` and is never routed directly, so `pageExtensions` is
left alone and the `app/` tree stays TSX-only. A file is named for its slug with `/`
flattened to `-`, then the locale: slug `discord/commands` is `discord-commands.en.mdx` and
`discord-commands.de.mdx`. Flat rather than nested, because the registry names every file
explicitly and a flat directory makes a missing translation visible by eye as well as to
the compiler.

`web/src/mdx-components.tsx` (the App Router convention file) maps `h2`, `h3`, `p`, `code`,
`a` and `table` onto Revelio-styled components, and exposes the authoring components:
`<CommandTable name="search" />` and `<Callout>`.

**No frontmatter parser.** MDX supports ESM exports natively, so nothing extra is needed to
get data out of a file. Page titles and descriptions do not live in MDX at all (see i18n
below), so the only export a content file needs is the one the TOC plugin injects.

### Table of contents

A local remark plugin at `web/mdx/remark-toc.mjs` walks `heading` nodes at depth 2 and 3,
slugs them with `github-slugger`, and injects `export const toc`. `rehype-slug` puts the
matching ids on the rendered headings. Around 25 lines, and it removes the reason to install
a docs framework.

It sits at the workspace root rather than under `src/` because `next.config.ts` imports it
and it runs at build time, never in the app graph - the same reason `web/i18n/` lives
where it does.

## The `BOT_COMMANDS` manifest

New module `core/src/bot-commands.ts`, exported from the `@revelio/core` barrel.

```ts
export type CommandOption = {
  name: string
  type: 'string' | 'integer'
  required: boolean
  autocomplete: boolean
  choices?: 'lessons' | 'types'
  min?: number
}

export type BotCommand = {
  name: 'card' | 'search' | 'deck' | 'collection' | 'mydecks'
  ephemeral: boolean
  linkRequired: boolean
  options: readonly CommandOption[]
}

export const BOT_COMMANDS: readonly BotCommand[]
```

`choices` names an attribute scope rather than listing values, so the rendered table reuses
`attrLabel` and stays correct when a lesson or type is added.

**The manifest carries structure, not prose.** Discord's descriptions are terse and
length-capped ("Kartenname"); the docs want "Autocompletes against every card in the
database". Prose is rewritten deliberately and does not drift silently. Structure does: an
added option, a renamed one, a required flag flipped. So the manifest owns exactly what
breaks quietly, and descriptions stay in each surface's own catalog.

`@revelio/core` already sets the precedent for a shared, cross-consumer module of this kind
with `attrLabel` over `core/src/messages/{en,de}.json`.

### Keeping the bot honest

The bot keeps its fluent `SlashCommandBuilder` code. A new `bot/test/command-manifest.test.ts`
asserts that each command's `data.toJSON()` matches `BOT_COMMANDS` - option names, types,
required flags, autocomplete flags, and the `min_value` on `/search page`.

Generating the builders from the manifest instead was considered and rejected: it would lose
the per-option `setDescriptionLocalizations` calls that make the registration readable, and
it changes what is sent to Discord in exchange for a guarantee the test already provides.

Ephemerality is asserted separately, where it already is: the existing tests that require
`deferReply({ flags: MessageFlags.Ephemeral })` on `/collection` and `/mydecks` gain an
assertion that those two, and only those two, are marked `ephemeral` in the manifest.

## Internationalization

Two mechanisms, each where it fits.

### Content: a typed registry

```ts
// web/src/lib/docs/registry.ts
export const DOC_PAGES = {
  'discord/commands': {
    en: () => import('@/../content/docs/discord-commands.en.mdx'),
    de: () => import('@/../content/docs/discord-commands.de.mdx'),
  },
  // ...
} satisfies Record<DocSlug, Record<Locale, DocLoader>>
```

`Locale` derives from `routing.locales`. Adding an English page without its German
counterpart is a **type error**, not a runtime fallback - `npm run typecheck` fails. Adding
a third locale breaks the build until every page is translated.

This is the deciding difference from Fumadocs, which was the other serious candidate
(`fumadocs-core` 16.15.10 supports Next 16 and React 19.2, and all its peer dependencies are
optional, so the `zod` 3/4 split is not an obstacle). Its i18n answers a missing translation
by silently serving the default language. Everything else it offers that this section needs
is the ~25-line TOC plugin above.

### Chrome and metadata: `messages/{en,de}.json`

A new `docs` namespace holds the rail headings, breadcrumb labels, "On this page", "Edit
this page", section names, and **every page's title and description**.

Titles deliberately do not live in MDX. The left rail needs all five titles to draw itself,
and `generateMetadata` needs title plus description; reading those from MDX would mean
loading every module to render the nav. So `docs.pages.<slug>.title` and `.description`
are the single source for the rail, the `h1`, and the page metadata, and MDX files are
**body only**, starting at the lede.

Parity is enforced by the existing test pattern, as in
`web/src/components/discord/__tests__/discord-i18n.test.ts`.

### What is not translated

Command and option names. Discord sends the same option keys in every language, so the
German page shows the same `query:` and `lesson:` with translated prose around them. That is
what a German user actually types. `CommandGrid` already documents this reasoning for the
landing page and the docs follow it.

## Navigation manifest

```ts
// web/src/lib/docs/nav.ts
export type DocSlug =
  | 'discord'
  | 'discord/commands'
  | 'discord/linking'
  | 'discord/privacy'
  | 'discord/troubleshooting'

export type DocSection = {
  key: 'discord' | 'api'
  status: 'live' | 'planned'
  pages: readonly DocSlug[]
}
export const DOCS_NAV: readonly DocSection[]
```

`DocSlug` is declared here, not derived from `DOC_PAGES`, so the registry can be constrained
by it without a circular reference. Adding a page therefore means touching three places -
the union, `DOCS_NAV`, and the registry - and the compiler names each one it is still
waiting for.

The left rail and the `/docs` hub both render from it. The API section is one entry with
`status: 'planned'` and no pages: it renders as a label with a "Planned" pill, not a link.

## Discoverability

**Not in the site header.** Docs are a destination people go looking for, not one of the
five things every visitor needs on every page.

**A fourth footer column, `Reference`**, holding `Documentation` (to `/docs`) and `GitHub`,
which moves there from the About column. "Reference" rather than "Developers" because
`/docs/discord` is not developer documentation - it explains what `/collection` does to a
player looking for bot help, and a developer-labelled column hides it from exactly the
person it is written for. Only the future API section is developer-facing, and it sits
comfortably under a neutral heading while the bot docs do not sit under a technical one.
The word is also already product vocabulary: the tile on `/discord` that links here is
called "Full reference" (`discord.reference.title`).

Mechanically: `site-footer.tsx` grid goes from `lg:grid-cols-[1.5fr_1fr_1fr_1fr]` to
`lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]`, with new `footer.reference` and
`footer.documentation` keys in both catalogs. The existing site-footer test gains an
assertion for the new column.

The other two entry points are the reference tile already live on `/discord`, and
`/llms.txt` plus `/sitemap.xml`, which both gain the docs URLs.

## Content spine

`/docs/discord` (Overview)
: What the bot is, what it needs, and the three-step start. Links to the install CTA on
  `/discord` rather than repeating it.

`/docs/discord/commands`
: The five commands. Prose per command, each followed by a `<CommandTable>` generated from
  `BOT_COMMANDS`, and a worked example. Commands that reply privately are marked.

`/docs/discord/linking`
: Why linking exists, that it is needed only for `/collection` and `/mydecks`, how to do it
  from Settings then Connections, and how to undo it. Notes that a ban is enforced here.

`/docs/discord/privacy`
: What the bot can and cannot read - `GatewayIntentBits.Guilds` only, no message content, no
  member lists. That personal replies are ephemeral. That replies cannot ping
  (`allowedMentions: { parse: [] }`). Then the limits that visibly affect a user: Discord's
  embed caps, and that Meilisearch totals are estimates so a page inside the reported count
  can come back empty.

`/docs/discord/troubleshooting`
: Commands not appearing, "link required", a deck not found, an empty page of results.

## Testing

- **Parity** - every slug in `DOCS_NAV` has both locales in `DOC_PAGES` and
  `docs.pages.<slug>.title`/`.description` in both catalogs.
- **Registry** - every loader resolves to a default export and a `toc`.
- **Conformance** - `bot/test/command-manifest.test.ts`, as described above.
- **Shell** - the active page carries `aria-current="page"`; the right rail lists the loaded
  page's headings; an unknown slug 404s; the `/docs` hub renders one card per section and
  does not link the planned one.
- **Footer** - the Reference column renders with both links.
- **Build smoke** - one MDX file renders under `next dev --turbopack` and survives
  `next build`.

## Suggested phasing

Four phases, each its own plan document and its own PR:

1. **Spike and pipeline** - prove `@next/mdx` under Turbopack and `next build`, then wire
   `next.config.ts`, `mdx-components.tsx`, and the TOC plugin. Ends with one throwaway MDX
   page rendering.
2. **The manifest** - `core/src/bot-commands.ts`, the bot conformance test, and the
   ephemerality assertion. Independent of the web work and shippable on its own.
3. **The shell** - routes, layout, both rails, the `/docs` hub, `DOCS_NAV`, the registry,
   the `docs` message namespace, and the footer's Reference column. Content is one
   placeholder page per slug so the parity tests have something to bite on.
4. **The content** - the five pages in both languages, plus `/llms.txt` and the sitemap.

## Risks

**`@next/mdx` under Turbopack on Next 16.3.1 is the one real unknown.** It must be proved
first, with a throwaway page, before any shell or content is written. If Turbopack fights
the MDX loader, that is the moment to reconsider Fumadocs - not after five content files
exist. Everything else in this design is ordinary React and TypeScript.

A smaller risk: the dynamic `import()` calls in the registry are static string literals, so
they are statically analyzable and each MDX file becomes its own chunk. Nothing here relies
on a template-literal import, which is the fragile pattern.

## Deployment

Nothing outside the diff. No migration, no new environment variable, no ingest run.
