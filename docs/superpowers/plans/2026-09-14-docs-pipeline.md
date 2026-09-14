# Docs MDX Pipeline Implementation Plan (Phase 1 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove `@next/mdx` compiles under Next 16.3.1 with Turbopack, then wire the permanent MDX pipeline - config, component map, and a table-of-contents plugin - ending with a real `/docs` route rendering an MDX file.

**Architecture:** MDX files live in `app/web/content/docs/`, deliberately outside the App Router tree (`app/web/src/app/`), and are pulled in by explicit `import()`. `next.config.ts` composes `withNextIntl(withMDX(nextConfig))`. A local remark plugin injects `export const toc` so the right-hand rail can list a page's headings without a second parse. No docs framework: `mdx-components.tsx` maps MDX elements onto Revelio's own Tailwind classes.

**Tech Stack:** Next.js 16.3.1 (App Router, Turbopack), React 19.2, MDX via `@next/mdx`, unified/remark/rehype, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-14-docs-section-design.md`

## Global Constraints

- **Run every command from `app/`**, the npm workspaces root. `npm -w web ...` fails when run from `app/web/`.
- On this machine `node`/`npm` are not on the default PATH - use `/usr/local/bin/npm`, and `/opt/homebrew/bin/gpg` for commit signing (`git -c gpg.program=/opt/homebrew/bin/gpg commit`).
- **Conventional Commits**, `type(scope): subject`. Scope is `web`. Imperative, lower case, no trailing period, <= 72 chars. **No tool attribution** - no `Co-authored-by`, no "generated with" lines.
- **Branch first.** Never commit to `main`.
- `type` aliases, never `interface`. Type-only imports say `type`. Declaration order in a file: types -> constants -> helpers -> exported functions.
- **Code comments are ASCII only** - no em-dashes, no unicode arrows.
- Documentation and comments in English.
- Web test files are **not** typechecked (`tsconfig.typecheck.json` excludes `**/__tests__/**`), so a type error there will not fail `npm run typecheck`. Do not rely on it.
- `next build` reads `web/.env.local`. If it is missing, copy `web/.env.example` to `web/.env.local` first - the build needs `NEXT_PUBLIC_*` values at build time.

---

### Task 1: Prove the MDX loader survives Turbopack

This task is a **gate**. Next 16 uses Turbopack for `next dev` *and* `next build`, and `@next/mdx` drives a webpack-style loader. If it does not work, stop and report - the fallback is `fumadocs-core` + `fumadocs-mdx`, which is a different plan, not a patch to this one.

**Files:**
- Modify: `app/web/package.json` (dependencies)
- Modify: `app/web/next.config.ts`
- Create: `app/web/src/mdx-components.tsx`
- Create: `app/web/content/docs/spike.en.mdx` (temporary, deleted in Task 4)
- Create: `app/web/src/app/[locale]/docs/page.tsx` (minimal, replaced in Task 4)

**Interfaces:**
- Consumes: nothing.
- Produces: `useMDXComponents(components: MDXComponents): MDXComponents` from `@/mdx-components`; a working `/docs` route; `withMDX` wired in `next.config.ts`.

- [ ] **Step 1: Install the MDX dependencies**

```bash
cd app
/usr/local/bin/npm install -w web @next/mdx@^16.3.5 @mdx-js/loader @mdx-js/react @types/mdx
```

- [ ] **Step 2: Create the MDX component map**

Create `app/web/src/mdx-components.tsx`. Minimal for now - Task 3 gives it real styling.

```tsx
import type { MDXComponents } from 'mdx/types'

// Next's App Router MDX convention: every compiled MDX file calls this to
// resolve the components it renders its markdown elements with.
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return { ...components }
}
```

- [ ] **Step 3: Wire the loader into next.config.ts**

Modify `app/web/next.config.ts`. Add the import beside the existing ones:

```ts
import createMDX from '@next/mdx'
```

Add the factory next to the existing `withNextIntl` line:

```ts
const withMDX = createMDX({})
```

Change the final export line from `export default withNextIntl(nextConfig)` to:

```ts
export default withNextIntl(withMDX(nextConfig))
```

Do **not** add `mdx` to `pageExtensions`: content lives in `app/web/content/docs/`, not under
the App Router tree, and is reached by explicit import. Adding the extension would change
module resolution for every route just to serve five content files, and a stray `.mdx`
under `src/app/` would be treated as routing surface. The App Router tree stays TSX-only.

- [ ] **Step 4: Create the spike content file**

Create `app/web/content/docs/spike.en.mdx`:

```mdx
This paragraph proves MDX compiled.

## First heading

Body text under the first heading.

### A nested heading

More body text.

## Second heading

Closing text.
```

- [ ] **Step 5: Create a minimal route that renders it**

Create `app/web/src/app/[locale]/docs/page.tsx`:

```tsx
import Spike from '@/../content/docs/spike.en.mdx'

// Phase 1 proof only. Task 4 of this plan replaces the body, and phase 3
// replaces the whole page with the docs hub.
export const dynamic = 'force-dynamic'

export default function DocsPage() {
  return (
    <main className="mx-auto max-w-[76rem] px-6 py-16">
      <Spike />
    </main>
  )
}
```

The `@/../content/...` form matches how the repo already reaches outside `src/` (`@/../i18n/navigation`), since `@` is aliased to `web/src`.

- [ ] **Step 6: Verify it renders under the dev server (Turbopack)**

```bash
cd app
PORT=3100 /usr/local/bin/npm run dev -w web
```

Use port 3100 so an already-running dev server on 3000 is not disturbed. In a second shell:

```bash
curl -s http://localhost:3100/docs | grep -c "First heading"
```

Expected: `1` or more. If the page 500s, capture the error from the dev server output - that is the gate result. Stop the dev server afterwards.

- [ ] **Step 7: Verify it survives a production build**

```bash
cd app
/usr/local/bin/npm run build -w web
```

Expected: build completes, and the route list includes `/[locale]/docs`. A failure here with an MDX or loader message is the gate failing - report it and stop.

- [ ] **Step 8: Verify nothing else broke**

```bash
cd app
/usr/local/bin/npm run typecheck && /usr/local/bin/npm run lint && /usr/local/bin/npm test -w web
```

Expected: all pass. The web suite count should be unchanged from before this task.

- [ ] **Step 9: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/package-lock.json app/web/package.json app/web/next.config.ts \
        app/web/src/mdx-components.tsx app/web/content/docs/spike.en.mdx \
        app/web/src/app/\[locale\]/docs/page.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "build(web): compile MDX with @next/mdx"
```

---

### Task 2: The table-of-contents remark plugin

**Files:**
- Create: `app/web/mdx/remark-toc.mjs`
- Create: `app/web/mdx/__tests__/remark-toc.test.ts`
- Modify: `app/web/vitest.config.ts` (the `include` array)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: default-exported remark plugin `remarkToc`, which injects `export const toc` into every compiled MDX module. The exported shape is `readonly { depth: 2 | 3; id: string; text: string }[]`, in document order. Task 4 and phase 3's right rail both read it.

- [ ] **Step 1: Install the plugin's dependencies**

```bash
cd app
/usr/local/bin/npm install -w web github-slugger unist-util-visit
/usr/local/bin/npm install -w web -D unified remark-parse remark-mdx
```

`unified`, `remark-parse` and `remark-mdx` are dev-only: the test drives the plugin through a real pipeline, while `@next/mdx` supplies them at build time.

- [ ] **Step 2: Let vitest collect tests from `mdx/`**

Modify `app/web/vitest.config.ts`. The `include` array currently reads:

```ts
    include: ['src/**/*.test.{ts,tsx}', 'i18n/**/*.test.ts'],
```

Change it to:

```ts
    // mdx/ and i18n/ both sit beside src/ because next.config.ts imports them
    // at build time, so their tests need collecting too.
    include: ['src/**/*.test.{ts,tsx}', 'i18n/**/*.test.ts', 'mdx/**/*.test.ts'],
```

- [ ] **Step 3: Write the failing test**

Create `app/web/mdx/__tests__/remark-toc.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkMdx from 'remark-mdx'
import remarkToc from '../remark-toc.mjs'

// The plugin injects an ESM export node into the tree. Reading it back out of
// the AST is the cheapest way to assert what a compiled module would export.
const processor = unified().use(remarkParse).use(remarkMdx).use(remarkToc)

function tocOf(markdown: string): unknown {
  const tree = processor.runSync(processor.parse(markdown)) as {
    children: { type: string; value?: string }[]
  }
  const node = tree.children.find((child) => child.type === 'mdxjsEsm')
  if (!node?.value) return undefined
  return JSON.parse(node.value.replace('export const toc = ', '').replace(/;$/, ''))
}

describe('remarkToc', () => {
  it('collects h2 and h3 headings in document order', () => {
    expect(tocOf('## Alpha\n\ntext\n\n### Beta\n\n## Gamma\n')).toEqual([
      { depth: 2, id: 'alpha', text: 'Alpha' },
      { depth: 3, id: 'beta', text: 'Beta' },
      { depth: 2, id: 'gamma', text: 'Gamma' },
    ])
  })

  it('ignores h1 and h4, which the shell does not list', () => {
    expect(tocOf('# Title\n\n## Kept\n\n#### Dropped\n')).toEqual([
      { depth: 2, id: 'kept', text: 'Kept' },
    ])
  })

  // rehype-slug slugs the rendered headings independently, so the ids this
  // plugin produces must match its algorithm or every anchor is dead.
  it('deduplicates repeated headings the way rehype-slug does', () => {
    expect(tocOf('## Limits\n\n## Limits\n')).toEqual([
      { depth: 2, id: 'limits', text: 'Limits' },
      { depth: 2, id: 'limits-1', text: 'Limits' },
    ])
  })

  it('flattens inline markup in a heading to plain text', () => {
    expect(tocOf('## The `/search` command\n')).toEqual([
      { depth: 2, id: 'the-search-command', text: 'The /search command' },
    ])
  })

  it('exports an empty list for a file with no headings', () => {
    expect(tocOf('Just a paragraph.\n')).toEqual([])
  })
})
```

- [ ] **Step 4: Run it to make sure it fails**

```bash
cd app
/usr/local/bin/npm test -w web -- mdx/__tests__/remark-toc.test.ts
```

Expected: FAIL - cannot resolve `../remark-toc.mjs`.

- [ ] **Step 5: Write the plugin**

Create `app/web/mdx/remark-toc.mjs`:

```js
import GithubSlugger from 'github-slugger'
import { visit } from 'unist-util-visit'

// Depths the docs shell lists in its right-hand rail. h1 is the page title,
// which comes from the message catalog rather than the content file, and h4
// and below are too fine to navigate by.
const LISTED_DEPTHS = new Set([2, 3])

// Heading text can hold inline markup (code spans, emphasis, links). The rail
// renders plain text, so flatten to the concatenated string values.
function plainText(node) {
  let out = ''
  visit(node, (child) => {
    if (child.type === 'text' || child.type === 'inlineCode') out += child.value
  })
  return out
}

// A minimal literal-to-estree conversion. The toc is plain JSON (arrays of
// objects of strings and numbers), so the general case is not needed.
function valueToEstree(value) {
  if (Array.isArray(value)) {
    return { type: 'ArrayExpression', elements: value.map(valueToEstree) }
  }
  if (value && typeof value === 'object') {
    return {
      type: 'ObjectExpression',
      properties: Object.entries(value).map(([key, val]) => ({
        type: 'Property',
        kind: 'init',
        method: false,
        shorthand: false,
        computed: false,
        key: { type: 'Identifier', name: key },
        value: valueToEstree(val),
      })),
    }
  }
  return { type: 'Literal', value }
}

/**
 * Injects `export const toc` into every compiled MDX module, so a page's
 * headings are available without parsing the file a second time at runtime.
 *
 * Ids are produced by the same github-slugger that rehype-slug uses, with one
 * slugger per file so the counter that disambiguates repeated headings runs in
 * step with it. Diverge here and every duplicate heading gets a dead anchor.
 */
export default function remarkToc() {
  return (tree) => {
    const slugger = new GithubSlugger()
    const toc = []

    visit(tree, 'heading', (node) => {
      if (!LISTED_DEPTHS.has(node.depth)) return
      const text = plainText(node)
      toc.push({ depth: node.depth, id: slugger.slug(text), text })
    })

    tree.children.unshift({
      type: 'mdxjsEsm',
      value: `export const toc = ${JSON.stringify(toc)};`,
      data: {
        estree: {
          type: 'Program',
          sourceType: 'module',
          body: [
            {
              type: 'ExportNamedDeclaration',
              specifiers: [],
              source: null,
              declaration: {
                type: 'VariableDeclaration',
                kind: 'const',
                declarations: [
                  {
                    type: 'VariableDeclarator',
                    id: { type: 'Identifier', name: 'toc' },
                    init: valueToEstree(toc),
                  },
                ],
              },
            },
          ],
        },
      },
    })
  }
}

```

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd app
/usr/local/bin/npm test -w web -- mdx/__tests__/remark-toc.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 7: Prove the duplicate-heading test actually bites**

Temporarily change `LISTED_DEPTHS` to `new Set([2, 3, 4])` and re-run. Expected: the "ignores h1 and h4" test FAILS. Revert the change and re-run to confirm green again. A test that cannot fail is not a test.

- [ ] **Step 8: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/package-lock.json app/web/package.json app/web/vitest.config.ts \
        app/web/mdx/remark-toc.mjs app/web/mdx/__tests__/remark-toc.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): export a table of contents from every MDX page"
```

---

### Task 3: Style the MDX component map

**Files:**
- Modify: `app/web/src/mdx-components.tsx`
- Create: `app/web/src/__tests__/mdx-components.test.tsx`

**Interfaces:**
- Consumes: `useMDXComponents` from Task 1.
- Produces: the same signature, now returning styled `h2`, `h3`, `p`, `a`, `code`, `ul`, `ol`, `li` and `table`. Phase 3 adds `CommandTable` and `Callout` to the same map.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/__tests__/mdx-components.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import { useMDXComponents } from '@/mdx-components'

const components = useMDXComponents({})

function renderTag(tag: string, children: React.ReactNode) {
  const Component = components[tag as keyof typeof components] as ComponentType<{
    children: React.ReactNode
  }>
  return render(<Component>{children}</Component>)
}

describe('useMDXComponents', () => {
  it('maps every element a docs page uses', () => {
    for (const tag of ['h2', 'h3', 'p', 'a', 'code', 'ul', 'ol', 'li', 'table']) {
      expect(components).toHaveProperty(tag)
    }
  })

  // The right rail links to headings by id, and rehype-slug puts the id on the
  // rendered element, so the component must not drop unknown props.
  it('keeps the id rehype-slug puts on a heading', () => {
    const Heading = components.h2 as ComponentType<{ id?: string; children: React.ReactNode }>
    const { container } = render(<Heading id="limits">Limits</Heading>)
    expect(container.querySelector('h2')?.id).toBe('limits')
  })

  // A long option table must scroll inside its own box; the reading column
  // itself must never scroll sideways.
  it('wraps a table in a horizontally scrollable container', () => {
    const { container } = renderTag('table', <tbody><tr><td>cell</td></tr></tbody>)
    expect(container.querySelector('.overflow-x-auto')).not.toBeNull()
  })

  it('renders body copy in the muted foreground, not the heading colour', () => {
    renderTag('p', 'Body copy.')
    expect(screen.getByText('Body copy.').className).toContain('text-muted-foreground')
  })

  // Gold at full strength fails AA as text in light theme; primary-ink is the
  // token that passes. See the light-mode design spec.
  it('uses primary-ink for links and inline code, never bare primary', () => {
    const { container: link } = renderTag('a', 'a link')
    expect(link.querySelector('a')?.className).toContain('text-primary-ink')

    const { container: code } = renderTag('code', 'npm test')
    expect(code.querySelector('code')?.className).toContain('text-primary-ink')
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
cd app
/usr/local/bin/npm test -w web -- src/__tests__/mdx-components.test.tsx
```

Expected: FAIL - `components` has no `h2`, so the first test fails and the rest throw on an undefined component.

- [ ] **Step 3: Implement the styled map**

Replace the contents of `app/web/src/mdx-components.tsx`:

```tsx
import type { MDXComponents } from 'mdx/types'
import type { ComponentPropsWithoutRef } from 'react'

// Docs prose deliberately reuses the type scale already set by the about and
// discord pages rather than introducing a third one.
const HEADING_2 =
  'mt-11 border-t border-border/60 pt-6 text-xl font-semibold tracking-tight text-foreground first:mt-0 first:border-t-0 first:pt-0 scroll-mt-8'
const HEADING_3 = 'mt-8 text-base font-semibold text-foreground scroll-mt-8'
const PARAGRAPH = 'mt-4 max-w-[65ch] text-sm leading-relaxed text-muted-foreground sm:text-base'
const LIST = 'mt-4 max-w-[65ch] list-outside space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground sm:text-base'

/**
 * Next's App Router MDX convention: every compiled MDX file resolves its
 * markdown elements through this map, so a content file carries no classes.
 *
 * Links and inline code take `text-primary-ink`, not `text-primary`: the light
 * palette's primary is #F0C458, which does not pass AA as text, while
 * primary-ink (#875D0D) does.
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h2: (props: ComponentPropsWithoutRef<'h2'>) => <h2 {...props} className={HEADING_2} />,
    h3: (props: ComponentPropsWithoutRef<'h3'>) => <h3 {...props} className={HEADING_3} />,
    p: (props: ComponentPropsWithoutRef<'p'>) => <p {...props} className={PARAGRAPH} />,
    ul: (props: ComponentPropsWithoutRef<'ul'>) => (
      <ul {...props} className={`${LIST} list-disc`} />
    ),
    ol: (props: ComponentPropsWithoutRef<'ol'>) => (
      <ol {...props} className={`${LIST} list-decimal`} />
    ),
    li: (props: ComponentPropsWithoutRef<'li'>) => <li {...props} className="pl-1" />,
    a: (props: ComponentPropsWithoutRef<'a'>) => (
      <a {...props} className="text-primary-ink underline underline-offset-2" />
    ),
    code: (props: ComponentPropsWithoutRef<'code'>) => (
      <code
        {...props}
        className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.86em] text-primary-ink"
      />
    ),
    // A reference table is the one thing on the page wider than the reading
    // column, so it scrolls inside its own box rather than the page body.
    table: (props: ComponentPropsWithoutRef<'table'>) => (
      <div className="mt-5 overflow-x-auto rounded-xl border border-border bg-card">
        <table {...props} className="w-full border-collapse text-sm" />
      </div>
    ),
    ...components,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd app
/usr/local/bin/npm test -w web -- src/__tests__/mdx-components.test.tsx
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Confirm the spike page still renders with the styles applied**

```bash
cd app
PORT=3100 /usr/local/bin/npm run dev -w web
```

Then in a second shell:

```bash
curl -s http://localhost:3100/docs | grep -c "text-muted-foreground"
```

Expected: `1` or more - the paragraph component reached the rendered page. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/src/mdx-components.tsx app/web/src/__tests__/mdx-components.test.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): style MDX elements with the site type scale"
```

---

### Task 4: Render real content through the finished pipeline

Replaces the spike file with the first real content file and proves the `toc` export reaches a page. Phase 3 replaces this route with the docs hub and the registry; the content file it creates here survives.

**Files:**
- Modify: `app/web/next.config.ts` (register the remark and rehype plugins)
- Create: `app/web/content/docs/discord.en.mdx`
- Create: `app/web/content/docs/discord.de.mdx`
- Delete: `app/web/content/docs/spike.en.mdx`
- Modify: `app/web/src/app/[locale]/docs/page.tsx`
- Create: `app/web/src/app/[locale]/docs/__tests__/docs-page.test.tsx`

**Interfaces:**
- Consumes: `remarkToc` (Task 2), `useMDXComponents` (Task 3).
- Produces: `content/docs/discord.{en,de}.mdx`, each exporting a default component and `toc`. Phase 3's registry imports exactly these two files for the `discord` slug.

- [ ] **Step 1: Install rehype-slug**

```bash
cd app
/usr/local/bin/npm install -w web rehype-slug
```

- [ ] **Step 2: Register the plugins in next.config.ts**

Modify `app/web/next.config.ts`. Add the imports:

```ts
import rehypeSlug from 'rehype-slug'
import remarkToc from './mdx/remark-toc.mjs'
```

Change `const withMDX = createMDX({})` to:

```ts
// remarkToc injects `export const toc`; rehypeSlug puts the matching ids on the
// rendered headings. They must stay paired - the ids the rail links to are the
// ones rehype-slug writes.
const withMDX = createMDX({
  options: { remarkPlugins: [remarkToc], rehypePlugins: [rehypeSlug] },
})
```

- [ ] **Step 3: Write the English content file**

Create `app/web/content/docs/discord.en.mdx`. Body only - the title and description live in the message catalog (phase 3), so this file starts at the lede.

```mdx
Revelio's Discord bot answers card, deck and collection questions in the channel
you are already talking in. It works in any server, needs no special permissions,
and cannot read your messages.

## What you need

Nothing, for card and deck lookups. Anyone in a server the bot has been added to
can use `/card`, `/search` and `/deck` straight away.

Two commands answer about you rather than about the game - `/collection` and
`/mydecks` - and those need your Discord account linked to your Revelio account
first. Linking takes one click from Settings, then Connections.

## Adding it to a server

You need the Manage Server permission in the server you are adding it to. The
install link is on the [Discord bot page](/discord). The bot asks for permission
to post messages and nothing else.

## Where to go next

The [command reference](/docs/discord/commands) lists every option each command
takes. [Account linking](/docs/discord/linking) covers connecting and
disconnecting your account, and [privacy and limits](/docs/discord/privacy) sets
out exactly what the bot can and cannot see.
```

- [ ] **Step 4: Write the German content file**

Create `app/web/content/docs/discord.de.mdx`. Command and option names stay untranslated - Discord sends the same keys in every language, so this is what a German user actually types.

```mdx
Der Discord-Bot von Revelio beantwortet Fragen zu Karten, Decks und Sammlungen
direkt im Kanal, in dem du ohnehin gerade schreibst. Er funktioniert in jedem
Server, braucht keine besonderen Rechte und kann deine Nachrichten nicht lesen.

## Was du brauchst

Fuer Karten- und Deck-Abfragen nichts. Wer in einem Server ist, zu dem der Bot
hinzugefuegt wurde, kann `/card`, `/search` und `/deck` sofort benutzen.

Zwei Befehle beantworten Fragen zu dir statt zum Spiel - `/collection` und
`/mydecks`. Dafuer muss dein Discord-Konto mit deinem Revelio-Konto verknuepft
sein. Das Verknuepfen dauert einen Klick unter Einstellungen, dann Verbindungen.

## Zu einem Server hinzufuegen

Du brauchst im Zielserver das Recht "Server verwalten". Den Installationslink
findest du auf der [Discord-Bot-Seite](/discord). Der Bot fragt nur nach dem
Recht, Nachrichten zu schreiben.

## Wie es weitergeht

Die [Befehlsreferenz](/docs/discord/commands) listet jede Option jedes Befehls
auf. [Kontoverknuepfung](/docs/discord/linking) erklaert das Verbinden und
Trennen, und [Datenschutz und Grenzen](/docs/discord/privacy) beschreibt genau,
was der Bot sehen kann und was nicht.
```

- [ ] **Step 5: Write the failing test**

Create `app/web/src/app/[locale]/docs/__tests__/docs-page.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import Overview, { toc } from '@/../content/docs/discord.en.mdx'
import OverviewDe from '@/../content/docs/discord.de.mdx'

describe('the Discord overview content file', () => {
  it('exports a table of contents built from its own headings', () => {
    expect(toc).toEqual([
      { depth: 2, id: 'what-you-need', text: 'What you need' },
      { depth: 2, id: 'adding-it-to-a-server', text: 'Adding it to a server' },
      { depth: 2, id: 'where-to-go-next', text: 'Where to go next' },
    ])
  })

  it('renders its headings with the ids the contents list points at', () => {
    const { container } = render(<Overview />)
    for (const entry of toc) {
      expect(container.querySelector(`#${entry.id}`)).not.toBeNull()
    }
  })

  // Discord sends the same option keys in every language, so a German reader
  // must be shown the same thing to type.
  it('keeps command names untranslated in the German file', () => {
    render(<OverviewDe />)
    expect(screen.getByText('/collection')).toBeInTheDocument()
    expect(screen.getByText('/mydecks')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run it to make sure it fails**

```bash
cd app
/usr/local/bin/npm test -w web -- src/app/\[locale\]/docs/__tests__/docs-page.test.tsx
```

Expected: FAIL - vitest cannot import an `.mdx` file; it has no MDX plugin.

- [ ] **Step 7: Teach vitest to compile MDX**

```bash
cd app
/usr/local/bin/npm install -w web -D @mdx-js/rollup
```

Modify `app/web/vitest.config.ts`. Add the imports:

```ts
import mdx from '@mdx-js/rollup'
import rehypeSlug from 'rehype-slug'
import remarkToc from './mdx/remark-toc.mjs'
```

Add `mdx` to the `plugins` array, **before** `react()`, with the same plugin pair `next.config.ts` uses:

```ts
  plugins: [
    // Same remark/rehype pair as next.config.ts, so a test asserts what the
    // build actually produces rather than a second, drifting pipeline.
    mdx({ remarkPlugins: [remarkToc], rehypePlugins: [rehypeSlug] }),
    react(),
  ],
```

Leave the `include` array alone: content files are imported by tests, not collected as tests, so nothing else in the config changes.

- [ ] **Step 8: Run the test to verify it passes**

```bash
cd app
/usr/local/bin/npm test -w web -- src/app/\[locale\]/docs/__tests__/docs-page.test.tsx
```

Expected: PASS, 3 tests. If the `toc` assertion fails on the ids, the slugger in `remark-toc.mjs` has diverged from `rehype-slug` - fix the plugin, not the test.

- [ ] **Step 9: Point the route at the real content and drop the spike**

Replace the body of `app/web/src/app/[locale]/docs/page.tsx`:

```tsx
import Overview from '@/../content/docs/discord.en.mdx'

// Phase 1 proof: one locale, no shell, no registry. Phase 3 replaces this with
// the docs hub and resolves content through the page registry instead.
export const dynamic = 'force-dynamic'

export default function DocsPage() {
  return (
    <main className="mx-auto max-w-[76rem] px-6 py-16">
      <Overview />
    </main>
  )
}
```

Delete the spike file:

```bash
rm app/web/content/docs/spike.en.mdx
```

- [ ] **Step 10: Verify the whole pipeline, dev and build**

```bash
cd app
PORT=3100 /usr/local/bin/npm run dev -w web
```

In a second shell:

```bash
curl -s http://localhost:3100/docs | grep -o 'id="what-you-need"'
```

Expected: `id="what-you-need"` - rehype-slug ran in the real build. Stop the dev server, then:

```bash
cd app
/usr/local/bin/npm run build -w web && /usr/local/bin/npm run typecheck \
  && /usr/local/bin/npm run lint && /usr/local/bin/npm test -w web
```

Expected: all four pass.

- [ ] **Step 11: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/package-lock.json app/web/package.json app/web/next.config.ts \
        app/web/vitest.config.ts app/web/content/docs app/web/src/app/\[locale\]/docs
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): serve the Discord docs overview from MDX"
```

---

## Phase exit criteria

- `/docs` renders `content/docs/discord.en.mdx` in dev and in a production build.
- Every `h2` carries an id, and the page module exports a matching `toc`.
- `npm test -w web`, `npm run typecheck`, `npm run lint` and `npm run build -w web` all pass.
- `content/docs/discord.de.mdx` exists and is tested, though nothing routes to it yet - phase 3 adds the registry that selects by locale.

## What this phase deliberately does not do

The docs shell, both rails, the `/docs` hub, the page registry, the `docs` message
namespace, and the footer's Reference column are all phase 3. The command reference tables
are phase 2 (the manifest) and phase 4 (the content). This phase ends with one unstyled
route, on purpose: it is the smallest thing that proves the pipeline.
