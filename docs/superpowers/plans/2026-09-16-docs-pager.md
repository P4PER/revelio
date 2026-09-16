# Docs Pager Implementation Plan

**Goal:** Previous/next links at the foot of every docs content page, so a reader
can move through the section in reading order without opening the rail or, below
860px, the drawer.

**Follows:** PR #121 (docs responsive navigation), which left the band below the
article empty on mobile.

## Decisions

- **The sequence is `DOCS_NAV` flattened across sections.** No second list to keep
  in step: when a planned section goes live, the last page of the one before it
  starts pointing into it. Planned sections carry no pages, so they can never
  produce a dead link.
- **Both ends are `null`.** The first page shows only Next, the last only Previous.
  The hub is an index of sections rather than a page in the reading order, and it
  is already reachable from the rail, the drawer and the footer.
- **The hub gets no pager.**
- **Sync, prop-driven component**, like `DocsToc` and `DocsNavTree`, so it renders
  in a test tree as well as on the server.
- **Accessible name = direction + title** ("Next Account linking"), so the visible
  label is contained in the name (WCAG 2.5.3, the issue PR #121 fixed on the bar).

## Tasks

### 1. `docNeighbours` in `src/lib/docs/nav.ts`

`docNeighbours(slug, nav = DOCS_NAV): { prev: DocSlug | null; next: DocSlug | null }`.
The `nav` parameter exists so a test can fake a second live section.

Tests in `src/lib/docs/__tests__/docs-registry.test.ts`: first page has no prev,
last page has no next, a middle page has both, and the sequence crosses a section
boundary.

Commit: `feat(web): derive a docs page's neighbours from the nav`

### 2. `DocsPager` in `src/components/docs/docs-pager.tsx`

`<nav aria-label={t('pager.label')}>` holding up to two cards in
`grid gap-3 sm:grid-cols-2`, each a next-intl `Link` with a muted direction label
over the page title and a chevron. A lone Next card sits in the right column.
Renders nothing when both neighbours are `null`.

Copy in `messages/en.json` and `messages/de.json`: `docs.pager.label`,
`docs.pager.previous`, `docs.pager.next`.

Tests in `src/components/docs/__tests__/docs-pager.test.tsx`: both links with
hrefs and names, only Next / only Previous at the ends, nothing for no neighbours,
German copy.

Commit: `feat(web): add a previous/next pager for docs pages`

### 3. Wire into `DocArticle`

Render `<DocsPager {...docNeighbours(slug)} />` at the foot of `<article>`, set off
by a top border.

Test in `src/app/[locale]/docs/[...slug]/__tests__/doc-page.test.tsx`: the
Commands page links back to Overview and on to Account linking.

Commit: `feat(web): show the pager at the foot of each docs page`

### 4. Verify

`npm test -w web`, `npm run typecheck`, `npm run lint`, and Playwright screenshots
at 390px and 1280px, light and dark.
