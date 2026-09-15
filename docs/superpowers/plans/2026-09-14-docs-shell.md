# Docs Shell Implementation Plan (Phase 3 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the three-column docs shell - left rail, reading column, right rail - the `/docs` hub, the locale-resolving page registry, and the footer's Reference column, with a placeholder MDX file per slug so the parity tests have something to bite on.

**Architecture:** `lib/docs/` owns three small modules: `types.ts` (shared types), `nav.ts` (`DOCS_NAV`, the section and page map), `registry.ts` (`DOC_PAGES`, slug plus locale to MDX module). The registry is constrained with `satisfies Record<DocSlug, Record<DocLocale, DocLoader>>`, so a page missing a translation is a **type error**. Page titles and descriptions live in the `docs` message namespace, not in MDX, because the left rail needs every title to draw itself.

**Tech Stack:** Next.js 16.3.1 App Router, React 19.2, next-intl 4, Tailwind v4, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-14-docs-section-design.md`

**Depends on:** Phase 1 (`2026-09-14-docs-pipeline.md`) must be merged - this plan assumes `@next/mdx`, `remarkToc`, `rehypeSlug`, `useMDXComponents`, and `content/docs/discord.{en,de}.mdx` all exist. Phase 2 is independent and may or may not be merged.

## Global Constraints

- **Run every command from `app/`**, the npm workspaces root. `npm -w web ...` fails when run from `app/web/`.
- On this machine `node`/`npm` are not on the default PATH - use `/usr/local/bin/npm`, and `/opt/homebrew/bin/gpg` for commit signing (`git -c gpg.program=/opt/homebrew/bin/gpg commit`).
- **Conventional Commits**, `type(scope): subject`. Scope is `web` (or `docs` for the docs domain inside web). **No tool attribution.**
- **Branch first.** Never commit to `main`.
- `type` aliases, never `interface`. Type-only imports say `type`. Declaration order in a file: types -> constants -> helpers -> exported functions.
- **Code comments are ASCII only.**
- **Every user-facing string comes from `messages/en.json` and `messages/de.json`.** Never hardcode copy, including `aria-label`s and metadata.
- Components live under `src/components/<domain>/`, here `src/components/docs/`. **No barrel files** - import the leaf path. Each folder owns its `__tests__/`.
- Use next-intl's `Link` from `@/../i18n/navigation`, never bare `next/link`.
- Gold as text takes `text-primary-ink`, never `text-primary` - the light palette's primary (`#F0C458`) fails AA as text.
- Web test files are **not** typechecked, so a type error in `__tests__/` will not fail `npm run typecheck`.

---

### Task 1: The page map, the registry, and the message namespace

**Files:**
- Create: `app/web/src/lib/docs/types.ts`
- Create: `app/web/src/lib/docs/nav.ts`
- Create: `app/web/src/lib/docs/registry.ts`
- Create: `app/web/content/docs/discord-commands.{en,de}.mdx`
- Create: `app/web/content/docs/discord-linking.{en,de}.mdx`
- Create: `app/web/content/docs/discord-privacy.{en,de}.mdx`
- Create: `app/web/content/docs/discord-troubleshooting.{en,de}.mdx`
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json`
- Create: `app/web/src/lib/docs/__tests__/docs-registry.test.ts`

**Interfaces:**
- Consumes: `routing` from `@/../i18n/routing`; the MDX pipeline from phase 1.
- Produces:
  - `type DocSlug`, `type DocLocale`, `type TocEntry = { depth: 2 | 3; id: string; text: string }`, `type DocModule = { default: ComponentType; toc: readonly TocEntry[] }`, `type DocLoader = () => Promise<DocModule>`
  - `const DOCS_NAV: readonly DocSection[]`, `type DocSection = { key: 'discord' | 'api'; status: 'live' | 'planned'; pages: readonly DocSlug[] }`
  - `function docId(slug: DocSlug): string` - the slug with `/` flattened to `-`, used for both the content filename and the message key
  - `function isDocSlug(value: string): value is DocSlug`
  - `async function loadDoc(slug: DocSlug, locale: DocLocale): Promise<DocModule>`

  Tasks 2, 3 and 4 all consume these.

- [x] **Step 1: Write the failing test**

Create `app/web/src/lib/docs/__tests__/docs-registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { routing } from '@/../i18n/routing'
import { DOCS_NAV, docId, isDocSlug } from '@/lib/docs/nav'
import { DOC_PAGES, loadDoc } from '@/lib/docs/registry'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

const slugs = DOCS_NAV.flatMap((section) => section.pages)

describe('the docs page map', () => {
  it('lists at least one live section with pages', () => {
    expect(DOCS_NAV.some((s) => s.status === 'live' && s.pages.length > 0)).toBe(true)
  })

  it('never gives a planned section pages it cannot serve', () => {
    for (const section of DOCS_NAV) {
      if (section.status === 'planned') expect(section.pages).toEqual([])
    }
  })

  it('registers every navigable page', () => {
    for (const slug of slugs) expect(DOC_PAGES).toHaveProperty(slug)
  })

  it('navigates to every registered page', () => {
    expect(Object.keys(DOC_PAGES).sort()).toEqual([...slugs].sort())
  })

  it('accepts a known slug and rejects an unknown one', () => {
    expect(isDocSlug('discord/commands')).toBe(true)
    expect(isDocSlug('discord/nonsense')).toBe(false)
  })

  it('flattens a nested slug to a single id', () => {
    expect(docId('discord/commands')).toBe('discord-commands')
    expect(docId('discord')).toBe('discord')
  })
})

describe('docs content', () => {
  // The satisfies clause makes a missing locale a type error, but typecheck
  // does not prove the file behind the loader actually resolves.
  it.each(slugs.flatMap((slug) => routing.locales.map((locale) => [slug, locale] as const)))(
    'loads %s in %s',
    async (slug, locale) => {
      const mod = await loadDoc(slug, locale)
      expect(typeof mod.default).toBe('function')
      expect(Array.isArray(mod.toc)).toBe(true)
    },
  )
})

// src/lib/__tests__/message-key-parity.test.ts already proves every leaf key
// exists in both catalogs. What it cannot know is that those keys line up with
// DOCS_NAV, which is what these assert.
describe('docs i18n', () => {
  it('has a docs namespace in both locales', () => {
    expect(en.docs).toBeTruthy()
    expect(de.docs).toBeTruthy()
  })

  it('titles and describes every page in both locales', () => {
    for (const messages of [en.docs, de.docs] as const) {
      for (const slug of slugs) {
        const page = (messages.pages as Record<string, { title: string; description: string }>)[
          docId(slug)
        ]
        expect(page?.title, `title for ${slug}`).toBeTruthy()
        expect(page?.description, `description for ${slug}`).toBeTruthy()
      }
    }
  })

  it('names every section in both locales', () => {
    for (const messages of [en.docs, de.docs] as const) {
      for (const section of DOCS_NAV) {
        const entry = (messages.sections as Record<string, { title: string; summary: string }>)[
          section.key
        ]
        expect(entry?.title, `title for ${section.key}`).toBeTruthy()
        expect(entry?.summary, `summary for ${section.key}`).toBeTruthy()
      }
    }
  })
})
```

- [x] **Step 2: Run it to make sure it fails**

```bash
cd app
/usr/local/bin/npm test -w web -- src/lib/docs/__tests__/docs-registry.test.ts
```

Expected: FAIL - cannot resolve `@/lib/docs/nav`.

- [x] **Step 3: Write the shared types**

Create `app/web/src/lib/docs/types.ts`:

```ts
import type { ComponentType } from 'react'
import { routing } from '@/../i18n/routing'

/**
 * Every page the docs section serves. Declared as a union rather than derived
 * from DOC_PAGES so the registry can be constrained by it without a circular
 * reference: adding a page means touching this union, DOCS_NAV and the
 * registry, and the compiler names whichever one is still missing.
 */
export type DocSlug =
  | 'discord'
  | 'discord/commands'
  | 'discord/linking'
  | 'discord/privacy'
  | 'discord/troubleshooting'

export type DocLocale = (typeof routing.locales)[number]

/** One heading in a page's right-hand rail, as injected by mdx/remark-toc.mjs. */
export type TocEntry = { depth: 2 | 3; id: string; text: string }

export type DocModule = { default: ComponentType; toc: readonly TocEntry[] }

export type DocLoader = () => Promise<DocModule>
```

- [x] **Step 4: Write the navigation manifest**

Create `app/web/src/lib/docs/nav.ts`:

```ts
import type { DocSlug } from '@/lib/docs/types'

export type DocSection = {
  key: 'discord' | 'api'
  status: 'live' | 'planned'
  pages: readonly DocSlug[]
}

// Order is reading order, not alphabetical: a visitor who lands on the section
// should start at the overview. A planned section carries no pages and renders
// as a label rather than a link, so the shell can advertise what is coming
// without shipping a dead end.
export const DOCS_NAV: readonly DocSection[] = [
  {
    key: 'discord',
    status: 'live',
    pages: [
      'discord',
      'discord/commands',
      'discord/linking',
      'discord/privacy',
      'discord/troubleshooting',
    ],
  },
  { key: 'api', status: 'planned', pages: [] },
]

const SLUGS: ReadonlySet<string> = new Set(DOCS_NAV.flatMap((section) => section.pages))

/**
 * A slug flattened to a single identifier: `discord/commands` -> `discord-commands`.
 *
 * One concept, two uses. It names the content file (content/docs/<id>.<locale>.mdx)
 * and it keys the message catalog (docs.pages.<id>), so a slash never has to
 * survive a filesystem path or next-intl's dot-separated key lookup.
 */
export function docId(slug: DocSlug): string {
  return slug.replaceAll('/', '-')
}

export function isDocSlug(value: string): value is DocSlug {
  return SLUGS.has(value)
}
```

- [x] **Step 5: Create the placeholder content files**

Eight files. Each is body-only prose with one `##` heading, enough for the shell and the TOC to have something real to render; phase 4 replaces every one of them. `content/docs/discord.{en,de}.mdx` already exists from phase 1 and is left alone.

Create `app/web/content/docs/discord-commands.en.mdx`:

```mdx
The five slash commands the bot answers to.

## Coming shortly

This page is being written. The [Discord bot page](/discord) lists every command
and what it does in the meantime.
```

Create `app/web/content/docs/discord-commands.de.mdx`:

```mdx
Die fuenf Slash-Befehle, auf die der Bot antwortet.

## In Kuerze

Diese Seite entsteht gerade. Die [Discord-Bot-Seite](/discord) listet
solange jeden Befehl und seine Aufgabe auf.
```

Create the remaining six with the same shape, changing only the lede:

| File | English lede | German lede |
| --- | --- | --- |
| `discord-linking.en.mdx` | `Connecting your Discord account to Revelio, and disconnecting it again.` | - |
| `discord-linking.de.mdx` | - | `Dein Discord-Konto mit Revelio verbinden und wieder trennen.` |
| `discord-privacy.en.mdx` | `What the bot can see, what it cannot, and the limits you will run into.` | - |
| `discord-privacy.de.mdx` | - | `Was der Bot sehen kann, was nicht, und welche Grenzen dir begegnen.` |
| `discord-troubleshooting.en.mdx` | `What to try when a command does not behave.` | - |
| `discord-troubleshooting.de.mdx` | - | `Was zu tun ist, wenn ein Befehl sich nicht wie erwartet verhaelt.` |

Each English file keeps the `## Coming shortly` heading and paragraph shown above; each German file keeps `## In Kuerze` and its paragraph.

- [x] **Step 6: Write the registry**

Create `app/web/src/lib/docs/registry.ts`:

```ts
import type { DocLoader, DocLocale, DocModule, DocSlug } from '@/lib/docs/types'

// @types/mdx types an *.mdx module as a bare component, so the `toc` that
// mdx/remark-toc.mjs injects is invisible to it. Assert the real shape once,
// here, rather than at every call site.
function doc(load: () => Promise<unknown>): DocLoader {
  return () => load() as Promise<DocModule>
}

/**
 * Every doc page, by slug and locale.
 *
 * The `satisfies` clause is the point: adding an English page without its
 * German counterpart fails `npm run typecheck`, and adding a locale to
 * routing.locales fails the build until every page is translated. A docs
 * framework would answer a missing translation by silently serving English.
 *
 * The import paths are literal strings, not template literals, so each file
 * is statically analyzable and becomes its own chunk.
 */
export const DOC_PAGES = {
  discord: {
    en: doc(() => import('@/../content/docs/discord.en.mdx')),
    de: doc(() => import('@/../content/docs/discord.de.mdx')),
  },
  'discord/commands': {
    en: doc(() => import('@/../content/docs/discord-commands.en.mdx')),
    de: doc(() => import('@/../content/docs/discord-commands.de.mdx')),
  },
  'discord/linking': {
    en: doc(() => import('@/../content/docs/discord-linking.en.mdx')),
    de: doc(() => import('@/../content/docs/discord-linking.de.mdx')),
  },
  'discord/privacy': {
    en: doc(() => import('@/../content/docs/discord-privacy.en.mdx')),
    de: doc(() => import('@/../content/docs/discord-privacy.de.mdx')),
  },
  'discord/troubleshooting': {
    en: doc(() => import('@/../content/docs/discord-troubleshooting.en.mdx')),
    de: doc(() => import('@/../content/docs/discord-troubleshooting.de.mdx')),
  },
} satisfies Record<DocSlug, Record<DocLocale, DocLoader>>

export async function loadDoc(slug: DocSlug, locale: DocLocale): Promise<DocModule> {
  return DOC_PAGES[slug][locale]()
}
```

- [x] **Step 7: Add the `docs` namespace to both catalogs**

Add to `app/web/messages/en.json`, as a new top-level `"docs"` key:

```json
  "docs": {
    "metaTitle": "Documentation",
    "metaDescription": "Reference for Revelio's Discord bot: every command, account linking, and what the bot can and cannot read.",
    "railHeading": "Documentation",
    "onThisPage": "On this page",
    "editPage": "Edit this page",
    "breadcrumb": "Documentation",
    "planned": "Planned",
    "hubTitle": "Documentation",
    "hubLede": "Reference for the parts of Revelio that are not the card database itself. Everything here is kept in step with what actually ships.",
    "sections": {
      "discord": {
        "title": "Discord bot",
        "summary": "Five slash commands for card, deck and collection lookups inside Discord."
      },
      "api": {
        "title": "API",
        "summary": "Programmatic access to cards, sets and rulings. Not built yet, and this section appears when it is."
      }
    },
    "pages": {
      "discord": {
        "title": "Overview",
        "description": "What the Discord bot does, what it needs, and how to add it to a server."
      },
      "discord-commands": {
        "title": "Commands",
        "description": "Every option each of the five slash commands takes."
      },
      "discord-linking": {
        "title": "Account linking",
        "description": "Connecting your Discord account to Revelio, and disconnecting it again."
      },
      "discord-privacy": {
        "title": "Privacy and limits",
        "description": "What the bot can read, what it cannot, and the limits you will run into."
      },
      "discord-troubleshooting": {
        "title": "Troubleshooting",
        "description": "What to try when a command does not behave."
      }
    }
  }
```

Add the same structure to `app/web/messages/de.json` with the same keys:

```json
  "docs": {
    "metaTitle": "Dokumentation",
    "metaDescription": "Referenz zum Discord-Bot von Revelio: jeder Befehl, die Kontoverknuepfung und was der Bot lesen kann und was nicht.",
    "railHeading": "Dokumentation",
    "onThisPage": "Auf dieser Seite",
    "editPage": "Diese Seite bearbeiten",
    "breadcrumb": "Dokumentation",
    "planned": "Geplant",
    "hubTitle": "Dokumentation",
    "hubLede": "Referenz fuer die Teile von Revelio, die nicht die Kartendatenbank selbst sind. Alles hier bleibt mit dem im Gleichschritt, was tatsaechlich live ist.",
    "sections": {
      "discord": {
        "title": "Discord-Bot",
        "summary": "Fuenf Slash-Befehle fuer Karten-, Deck- und Sammlungsabfragen direkt in Discord."
      },
      "api": {
        "title": "API",
        "summary": "Programmatischer Zugriff auf Karten, Sets und Rulings. Noch nicht gebaut; dieser Bereich erscheint, sobald es so weit ist."
      }
    },
    "pages": {
      "discord": {
        "title": "Ueberblick",
        "description": "Was der Discord-Bot kann, was er braucht und wie du ihn zu einem Server hinzufuegst."
      },
      "discord-commands": {
        "title": "Befehle",
        "description": "Jede Option, die jeder der fuenf Slash-Befehle annimmt."
      },
      "discord-linking": {
        "title": "Kontoverknuepfung",
        "description": "Dein Discord-Konto mit Revelio verbinden und wieder trennen."
      },
      "discord-privacy": {
        "title": "Datenschutz und Grenzen",
        "description": "Was der Bot lesen kann, was nicht, und welche Grenzen dir begegnen."
      },
      "discord-troubleshooting": {
        "title": "Fehlerbehebung",
        "description": "Was zu tun ist, wenn ein Befehl sich nicht wie erwartet verhaelt."
      }
    }
  }
```

- [x] **Step 8: Run the test to verify it passes**

```bash
cd app
/usr/local/bin/npm test -w web -- src/lib/docs/__tests__/docs-registry.test.ts
```

Expected: PASS - 6 map tests, 10 content-loading cases, 3 i18n tests.

- [x] **Step 9: Prove the registry's type guarantee is real**

This is the claim the whole approach rests on, so demonstrate it rather than trusting it.

Temporarily delete the `de:` line from the `'discord/linking'` entry in `registry.ts` and run:

```bash
cd app
/usr/local/bin/npm run typecheck
```

Expected: FAIL, naming `'discord/linking'` as not satisfying `Record<DocSlug, Record<DocLocale, DocLoader>>`. Restore the line and re-run to confirm it passes. If typecheck passes with the line missing, the `satisfies` clause is not doing its job and must be fixed before going further.

- [x] **Step 10: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/src/lib/docs app/web/content/docs app/web/messages
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): map docs pages to locale-specific MDX files"
```

---

### Task 2: The left rail and the shell layout

**Files:**
- Create: `app/web/src/components/docs/docs-sidebar.tsx`
- Create: `app/web/src/components/docs/__tests__/docs-sidebar.test.tsx`
- Create: `app/web/src/app/[locale]/docs/layout.tsx`

**Interfaces:**
- Consumes: `DOCS_NAV`, `docId` (Task 1); `Link` and `usePathname` from `@/../i18n/navigation`.
- Produces: `<DocsSidebar />` (client component, no props - it reads the active path itself) and the `/docs` layout that wraps every docs route.

- [x] **Step 1: Write the failing test**

Create `app/web/src/components/docs/__tests__/docs-sidebar.test.tsx`:

```tsx
import type { ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

const pathname = vi.fn(() => '/docs/discord/commands')

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
  usePathname: () => pathname(),
}))

import { DocsSidebar } from '@/components/docs/docs-sidebar'

function renderSidebar(locale: 'en' | 'de' = 'en', messages: typeof en | typeof de = en) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <DocsSidebar />
    </NextIntlClientProvider>,
  )
}

describe('DocsSidebar', () => {
  it('lists every page in the live section', () => {
    renderSidebar()
    const nav = screen.getByRole('navigation', { name: 'Documentation' })
    for (const name of ['Overview', 'Commands', 'Account linking', 'Privacy and limits', 'Troubleshooting']) {
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument()
    }
  })

  it('links each page at its own route', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/docs/discord')
    expect(screen.getByRole('link', { name: 'Commands' })).toHaveAttribute(
      'href',
      '/docs/discord/commands',
    )
  })

  // The rail is the reader's position indicator; without this a visitor three
  // pages deep has no idea which one they are on.
  it('marks the page being read, and only that one', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: 'Commands' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current')
  })

  it('marks nothing when the reader is on the hub', () => {
    pathname.mockReturnValueOnce('/docs')
    renderSidebar()
    for (const name of ['Overview', 'Commands']) {
      expect(screen.getByRole('link', { name })).not.toHaveAttribute('aria-current')
    }
  })

  // A planned section advertises what is coming; a link to it would be a dead
  // end, so it must not be one.
  it('shows the planned section as a label, not a link', () => {
    renderSidebar()
    expect(screen.getByText('API')).toBeInTheDocument()
    expect(screen.getByText('Planned')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /API/ })).toBeNull()
  })

  it('renders German titles in German', () => {
    renderSidebar('de', de)
    const nav = screen.getByRole('navigation', { name: 'Dokumentation' })
    expect(within(nav).getByRole('link', { name: 'Ueberblick' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Befehle' })).toBeInTheDocument()
  })
})
```

- [x] **Step 2: Run it to make sure it fails**

```bash
cd app
/usr/local/bin/npm test -w web -- src/components/docs/__tests__/docs-sidebar.test.tsx
```

Expected: FAIL - cannot resolve `@/components/docs/docs-sidebar`.

- [x] **Step 3: Write the sidebar**

Create `app/web/src/components/docs/docs-sidebar.tsx`:

```tsx
'use client'

import { useTranslations } from 'next-intl'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Link, usePathname } from '@/../i18n/navigation'
import { DOCS_NAV, docId } from '@/lib/docs/nav'
import type { DocSlug } from '@/lib/docs/types'

const PAGE_LINK =
  'block border-l-2 border-border px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
const PAGE_LINK_ACTIVE =
  'block border-l-2 border-primary bg-primary/10 px-2.5 py-1.5 text-sm font-semibold text-primary-ink'

function href(slug: DocSlug): string {
  return `/docs/${slug}`
}

/**
 * The left rail: the map of the docs, sections then pages. The right rail
 * carries the current page's own headings, so the two never repeat each other
 * and this one stays short as sections are added.
 *
 * A client component only because it reads the active route: a layout receives
 * params for its own segment, not for the catch-all child that actually knows
 * the slug.
 */
export function DocsSidebar() {
  const t = useTranslations('docs')
  const pathname = usePathname()

  return (
    <nav aria-label={t('railHeading')} className="flex flex-col gap-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('railHeading')}
      </p>

      {DOCS_NAV.map((section) => (
        <div key={section.key}>
          <p
            className={`mb-1.5 flex items-center gap-1.5 text-sm font-semibold ${
              section.status === 'planned' ? 'font-medium text-muted-foreground' : 'text-foreground'
            }`}
          >
            {section.status === 'live' ? (
              <ChevronDown className="size-3 text-muted-foreground" aria-hidden />
            ) : (
              <ChevronRight className="size-3 text-muted-foreground" aria-hidden />
            )}
            {t(`sections.${section.key}.title`)}
            {section.status === 'planned' && (
              <span className="rounded-full border border-border px-1.5 py-px text-[0.62rem] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('planned')}
              </span>
            )}
          </p>

          {section.pages.length > 0 && (
            <ul className="flex flex-col">
              {section.pages.map((slug) => {
                const active = pathname === href(slug)
                return (
                  <li key={slug}>
                    <Link
                      href={href(slug)}
                      aria-current={active ? 'page' : undefined}
                      className={active ? PAGE_LINK_ACTIVE : PAGE_LINK}
                    >
                      {t(`pages.${docId(slug)}.title`)}
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ))}
    </nav>
  )
}
```

- [x] **Step 4: Run the test to verify it passes**

```bash
cd app
/usr/local/bin/npm test -w web -- src/components/docs/__tests__/docs-sidebar.test.tsx
```

Expected: PASS, 6 tests.

- [x] **Step 5: Prove the active-page test bites**

Temporarily change `const active = pathname === href(slug)` to `const active = false` and re-run. Expected: "marks the page being read, and only that one" FAILS. Revert and confirm green.

- [x] **Step 6: Write the layout**

Create `app/web/src/app/[locale]/docs/layout.tsx`:

```tsx
import type { ReactNode } from 'react'
import { DocsSidebar } from '@/components/docs/docs-sidebar'

// No StarField here. It belongs on /discord, the marketing page; docs are read
// for minutes at a time, so the ground stays flat.
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[76rem] flex-col px-6 min-[860px]:flex-row min-[860px]:px-0">
      {/* Sticky on wide screens, a band above the content below 860px. */}
      <aside className="border-b border-border/60 py-6 min-[860px]:sticky min-[860px]:top-0 min-[860px]:w-[15.5rem] min-[860px]:shrink-0 min-[860px]:self-start min-[860px]:border-b-0 min-[860px]:border-r min-[860px]:py-10 min-[860px]:pl-6 min-[860px]:pr-4">
        <DocsSidebar />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
```

- [x] **Step 7: Verify the suite and the build**

```bash
cd app
/usr/local/bin/npm test -w web && /usr/local/bin/npm run typecheck && /usr/local/bin/npm run lint
```

Expected: all pass.

- [x] **Step 8: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/src/components/docs app/web/src/app/\[locale\]/docs/layout.tsx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): add the docs sidebar and shell layout"
```

---

### Task 3: The content route and the right rail

**Files:**
- Create: `app/web/src/components/docs/docs-toc.tsx`
- Create: `app/web/src/components/docs/__tests__/docs-toc.test.tsx`
- Create: `app/web/src/app/[locale]/docs/[...slug]/page.tsx`
- Create: `app/web/src/app/[locale]/docs/[...slug]/__tests__/doc-page.test.tsx`

**Interfaces:**
- Consumes: `loadDoc`, `isDocSlug`, `docId`, `DocSlug`, `TocEntry`, `DocLocale` (Task 1); `getCachedSiteSettings` from `@/lib/server/site-settings`.
- Produces: `<DocsToc toc={...} editUrl={...} />`, and the route that serves every slug in the registry.

- [x] **Step 1: Write the failing test for the rail**

Create `app/web/src/components/docs/__tests__/docs-toc.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect } from 'vitest'
import en from '@/../messages/en.json'
import { DocsToc } from '@/components/docs/docs-toc'
import type { TocEntry } from '@/lib/docs/types'

const TOC: TocEntry[] = [
  { depth: 2, id: 'card-lookup', text: 'Card lookup' },
  { depth: 3, id: 'options', text: 'Options' },
  { depth: 2, id: 'search', text: 'Search' },
]

function renderToc(toc: TocEntry[] = TOC, editUrl: string | null = null) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DocsToc toc={toc} editUrl={editUrl} />
    </NextIntlClientProvider>,
  )
}

describe('DocsToc', () => {
  it('links every heading by its anchor', () => {
    renderToc()
    const nav = screen.getByRole('navigation', { name: 'On this page' })
    expect(within(nav).getByRole('link', { name: 'Card lookup' })).toHaveAttribute('href', '#card-lookup')
    expect(within(nav).getByRole('link', { name: 'Options' })).toHaveAttribute('href', '#options')
    expect(within(nav).getByRole('link', { name: 'Search' })).toHaveAttribute('href', '#search')
  })

  it('indents a subheading under its parent', () => {
    renderToc()
    expect(screen.getByRole('link', { name: 'Options' }).className).toContain('pl-')
  })

  // A page with no h2 would otherwise render an empty labelled rail, which a
  // screen reader announces as a navigation landmark containing nothing.
  it('renders nothing at all for a page with no headings', () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <DocsToc toc={[]} editUrl={null} />
      </NextIntlClientProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('offers the edit link only when a repository is configured', () => {
    renderToc(TOC, 'https://github.com/P4PER/revelio')
    expect(screen.getByRole('link', { name: /Edit this page/ })).toHaveAttribute(
      'href',
      'https://github.com/P4PER/revelio',
    )
  })

  it('omits the edit link when no repository is configured', () => {
    renderToc()
    expect(screen.queryByRole('link', { name: /Edit this page/ })).toBeNull()
  })
})
```

- [x] **Step 2: Run it to make sure it fails**

```bash
cd app
/usr/local/bin/npm test -w web -- src/components/docs/__tests__/docs-toc.test.tsx
```

Expected: FAIL - cannot resolve `@/components/docs/docs-toc`.

- [x] **Step 3: Write the rail**

Create `app/web/src/components/docs/docs-toc.tsx`:

```tsx
import { useTranslations } from 'next-intl'
import { SquarePen } from 'lucide-react'
import type { TocEntry } from '@/lib/docs/types'

const LINK =
  'border-l-2 border-border py-1 pl-3 text-sm text-muted-foreground transition-colors hover:text-foreground'

/**
 * The right rail: only the page being read, listing its own h2 and h3 anchors.
 * The left rail is the map of the whole section, so neither repeats the other.
 *
 * Renders nothing for a page with no headings rather than an empty landmark.
 */
export function DocsToc({ toc, editUrl }: { toc: readonly TocEntry[]; editUrl: string | null }) {
  const t = useTranslations('docs')
  if (toc.length === 0) return null

  return (
    <nav aria-label={t('onThisPage')} className="sticky top-0 self-start py-10 pl-2 pr-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('onThisPage')}
      </p>
      <ul className="flex flex-col">
        {toc.map((entry) => (
          <li key={entry.id}>
            <a
              href={`#${entry.id}`}
              className={entry.depth === 3 ? `${LINK} pl-6 text-[0.8rem]` : LINK}
            >
              {entry.text}
            </a>
          </li>
        ))}
      </ul>
      {editUrl && (
        <a
          href={editUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 flex items-center gap-1.5 border-t border-border pt-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <SquarePen className="size-3.5" aria-hidden />
          {t('editPage')}
        </a>
      )}
    </nav>
  )
}
```

- [x] **Step 4: Run the rail test to verify it passes**

```bash
cd app
/usr/local/bin/npm test -w web -- src/components/docs/__tests__/docs-toc.test.tsx
```

Expected: PASS, 5 tests.

- [x] **Step 5: Write the failing test for the route**

The page is split the way `about/page.tsx` and `discord/page.tsx` already split theirs: an
async server default export that resolves data, and a **sync, prop-driven view** beside it.
That is not cosmetic - an async server component calling `getTranslations` has no request
scope under vitest, so the view is the only part that can be rendered in a test.

Create `app/web/src/app/[locale]/docs/[...slug]/__tests__/doc-page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'
import { DocArticle } from '../page'

function Body() {
  return <h2 id="what-you-need">What you need</h2>
}

function renderArticle(
  locale: 'en' | 'de' = 'en',
  messages: typeof en | typeof de = en,
  editUrl: string | null = null,
) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <DocArticle
        slug="discord/commands"
        Body={Body}
        toc={[{ depth: 2, id: 'what-you-need', text: 'What you need' }]}
        editUrl={editUrl}
      />
    </NextIntlClientProvider>,
  )
}

describe('a docs content page', () => {
  // Titles come from the catalog, not the content file: the left rail needs
  // every title to draw itself, and loading five MDX modules to read them
  // would be absurd.
  it('titles the page from the message catalog', () => {
    renderArticle()
    expect(screen.getByRole('heading', { level: 1, name: 'Commands' })).toBeInTheDocument()
  })

  it('names the section above the title', () => {
    renderArticle()
    expect(screen.getByText('Discord bot')).toBeInTheDocument()
  })

  it('renders the MDX body below the title', () => {
    renderArticle()
    expect(screen.getByRole('heading', { level: 2, name: 'What you need' })).toBeInTheDocument()
  })

  it('lists the page headings in the contents rail', () => {
    renderArticle()
    const rail = screen.getByRole('navigation', { name: 'On this page' })
    expect(rail).toBeInTheDocument()
  })

  it('renders the German title and section name', () => {
    renderArticle('de', de)
    expect(screen.getByRole('heading', { level: 1, name: 'Befehle' })).toBeInTheDocument()
    expect(screen.getByText('Discord-Bot')).toBeInTheDocument()
  })
})
```

The 404 paths are not mocked here. `isDocSlug` is already covered in Task 1, and Step 9
below proves the real route returns 404 for an unknown slug - which is what actually
matters and what a `next/navigation` mock cannot tell you.

- [x] **Step 6: Run it to make sure it fails**

```bash
cd app
/usr/local/bin/npm test -w web -- src/app/\[locale\]/docs/\[...slug\]/__tests__/doc-page.test.tsx
```

Expected: FAIL - `../page` has no export named `DocArticle`.

- [x] **Step 7: Write the route**

Create `app/web/src/app/[locale]/docs/[...slug]/page.tsx`:

```tsx
import type { ComponentType } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { hasLocale } from 'next-intl'
import { routing } from '@/../i18n/routing'
import { getPathname } from '@/../i18n/navigation'
import { SITE_URL as BASE_URL } from '@/lib/site'
import { getCachedSiteSettings } from '@/lib/server/site-settings'
import { DOCS_NAV, docId, isDocSlug } from '@/lib/docs/nav'
import { loadDoc } from '@/lib/docs/registry'
import { DocsToc } from '@/components/docs/docs-toc'
import type { DocLocale, DocSlug, TocEntry } from '@/lib/docs/types'

type Params = { params: Promise<{ locale: string; slug: string[] }> }

// The [locale] layout reads a cookie, so nothing under it is static anyway.
export const dynamic = 'force-dynamic'

function sectionKeyOf(slug: DocSlug): string | undefined {
  return DOCS_NAV.find((section) => section.pages.includes(slug))?.key
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, slug } = await params
  const joined = slug.join('/')
  if (!isDocSlug(joined)) return {}

  const t = await getTranslations('docs')
  const href = `/docs/${joined}`
  const languages: Record<string, string> = Object.fromEntries(
    routing.locales.map((l) => [l, `${BASE_URL}${getPathname({ href, locale: l })}`]),
  )
  languages['x-default'] = `${BASE_URL}${getPathname({ href, locale: routing.defaultLocale })}`

  return {
    title: t(`pages.${docId(joined)}.title`),
    description: t(`pages.${docId(joined)}.description`),
    alternates: { canonical: `${BASE_URL}${getPathname({ href, locale })}`, languages },
  }
}

/**
 * The reading column and its contents rail. Sync and prop-driven so it renders
 * in a test tree as well as on the server, which is how the about and discord
 * pages are already split.
 */
export function DocArticle({
  slug,
  Body,
  toc,
  editUrl,
}: {
  slug: DocSlug
  Body: ComponentType
  toc: readonly TocEntry[]
  editUrl: string | null
}) {
  const t = useTranslations('docs')
  const sectionKey = sectionKeyOf(slug)

  return (
    <div className="grid min-[1180px]:grid-cols-[minmax(0,1fr)_14rem]">
      <article className="min-w-0 py-10 min-[860px]:px-12">
        {sectionKey && (
          <p className="mb-3 text-sm text-muted-foreground">{t(`sections.${sectionKey}.title`)}</p>
        )}
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {t(`pages.${docId(slug)}.title`)}
        </h1>
        <div className="mt-6">
          <Body />
        </div>
      </article>
      <div className="hidden min-[1180px]:block">
        <DocsToc toc={toc} editUrl={editUrl} />
      </div>
    </div>
  )
}

export default async function DocPage({ params }: Params) {
  const { locale, slug } = await params
  const joined = slug.join('/')
  // An unknown locale 404s rather than quietly falling back to English: a
  // silent fallback is exactly what the typed registry exists to prevent.
  if (!isDocSlug(joined) || !hasLocale(routing.locales, locale)) notFound()

  const [{ default: Body, toc }, settings] = await Promise.all([
    loadDoc(joined, locale as DocLocale),
    getCachedSiteSettings(),
  ])

  return (
    <DocArticle slug={joined} Body={Body} toc={toc} editUrl={settings?.githubUrl ?? null} />
  )
}
```

- [x] **Step 8: Run the route test to verify it passes**

```bash
cd app
/usr/local/bin/npm test -w web -- src/app/\[locale\]/docs/\[...slug\]/__tests__/doc-page.test.tsx
```

Expected: PASS, 5 tests.

- [x] **Step 9: Verify the real routes render**

```bash
cd app
PORT=3100 /usr/local/bin/npm run dev -w web
```

In a second shell:

```bash
for path in /docs/discord /docs/discord/commands /de/docs/discord /de/docs/discord/commands; do
  printf '%s -> %s\n' "$path" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3100$path)"
done
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/docs/discord/nonsense
```

Expected: `200` for all four real routes, `404` for the nonsense slug. Stop the dev server.

- [x] **Step 10: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/src/components/docs app/web/src/app/\[locale\]/docs
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): serve docs pages with a per-page contents rail"
```

---

### Task 4: The `/docs` hub

Replaces phase 1's placeholder `/docs` page with the section index.

**Files:**
- Modify: `app/web/src/app/[locale]/docs/page.tsx`
- Create: `app/web/src/app/[locale]/docs/__tests__/docs-hub.test.tsx`

**Interfaces:**
- Consumes: `DOCS_NAV`, `docId` (Task 1).
- Produces: `DocsHub`, a named export beside the default, so the test renders it without awaiting a server component.

- [x] **Step 1: Write the failing test**

Create `app/web/src/app/[locale]/docs/__tests__/docs-hub.test.tsx`:

```tsx
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}))

import { DocsHub } from '../page'

function renderHub(locale: 'en' | 'de' = 'en', messages: typeof en | typeof de = en) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <DocsHub />
    </NextIntlClientProvider>,
  )
}

describe('the docs hub', () => {
  it('names itself', () => {
    renderHub()
    expect(screen.getByRole('heading', { level: 1, name: 'Documentation' })).toBeInTheDocument()
  })

  // The hub is the footer link's target, so arriving here must make sense on
  // its own rather than bouncing the visitor somewhere they did not ask for.
  it('links the live section at its first page', () => {
    renderHub()
    expect(screen.getByRole('link', { name: /Discord bot/ })).toHaveAttribute('href', '/docs/discord')
  })

  it('lists what the live section contains', () => {
    renderHub()
    expect(screen.getByText(/Commands/)).toBeInTheDocument()
    expect(screen.getByText(/Troubleshooting/)).toBeInTheDocument()
  })

  it('shows the planned section without linking it anywhere', () => {
    renderHub()
    expect(screen.getByText('API')).toBeInTheDocument()
    expect(screen.getByText('Planned')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /API/ })).toBeNull()
  })

  it('renders in German', () => {
    renderHub('de', de)
    expect(screen.getByRole('heading', { level: 1, name: 'Dokumentation' })).toBeInTheDocument()
    expect(screen.getByText('Geplant')).toBeInTheDocument()
  })
})
```

- [x] **Step 2: Run it to make sure it fails**

```bash
cd app
/usr/local/bin/npm test -w web -- src/app/\[locale\]/docs/__tests__/docs-hub.test.tsx
```

Expected: FAIL - `../page` has no export named `DocsHub`.

- [x] **Step 3: Write the hub**

Replace the whole contents of `app/web/src/app/[locale]/docs/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { ArrowRight, BookText, Code2 } from 'lucide-react'
import { Link } from '@/../i18n/navigation'
import { DOCS_NAV, docId } from '@/lib/docs/nav'

export const dynamic = 'force-dynamic'

const SECTION_ICON = { discord: BookText, api: Code2 } as const

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('docs')
  return { title: t('metaTitle'), description: t('metaDescription') }
}

/**
 * The section index. A real page rather than a redirect to /docs/discord: it is
 * the footer link's target, so it has to make sense on arrival, and a redirect
 * would have to be undone the moment a second section exists.
 *
 * No contents rail - there are no headings to list, so the reading column takes
 * the full width.
 */
export function DocsHub() {
  const t = useTranslations('docs')

  return (
    <main className="px-0 py-10 min-[860px]:px-12">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">{t('hubTitle')}</h1>
      <p className="mt-4 max-w-[62ch] text-base leading-relaxed text-muted-foreground">
        {t('hubLede')}
      </p>

      <div className="mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
        {DOCS_NAV.map((section) => {
          const Icon = SECTION_ICON[section.key]
          const title = t(`sections.${section.key}.title`)
          const summary = t(`sections.${section.key}.summary`)

          if (section.status === 'planned' || section.pages.length === 0) {
            return (
              <div
                key={section.key}
                className="flex flex-col gap-1.5 rounded-xl border border-dashed border-border p-5"
              >
                <p className="flex items-center gap-2 text-base font-semibold text-muted-foreground">
                  <Icon className="size-4" aria-hidden />
                  {title}
                  <span className="rounded-full border border-border px-1.5 py-px text-[0.62rem] font-semibold uppercase tracking-wider">
                    {t('planned')}
                  </span>
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">{summary}</p>
              </div>
            )
          }

          return (
            <Link
              key={section.key}
              href={`/docs/${section.pages[0]}`}
              className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary hover:bg-primary/5"
            >
              <span className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Icon className="size-4 text-primary-ink" aria-hidden />
                {title}
                <ArrowRight className="size-4 text-primary-ink" aria-hidden />
              </span>
              <span className="text-sm leading-relaxed text-muted-foreground">{summary}</span>
              <span className="mt-1 font-mono text-xs text-muted-foreground">
                {section.pages.map((slug) => t(`pages.${docId(slug)}.title`)).join(' · ')}
              </span>
            </Link>
          )
        })}
      </div>
    </main>
  )
}

export default function DocsHubPage() {
  return <DocsHub />
}
```

- [x] **Step 4: Run the test to verify it passes**

```bash
cd app
/usr/local/bin/npm test -w web -- src/app/\[locale\]/docs/__tests__/docs-hub.test.tsx
```

Expected: PASS, 5 tests.

- [x] **Step 5: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/src/app/\[locale\]/docs
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): land the docs hub on /docs"
```

---

### Task 5: The footer's Reference column

**Files:**
- Modify: `app/web/src/components/layout/site-footer.tsx`
- Modify: `app/web/messages/en.json`, `app/web/messages/de.json`
- Modify: `app/web/src/components/layout/__tests__/site-footer.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks - only the `/docs` route they produced.
- Produces: no new exports.

- [x] **Step 1: Add the message keys**

In `app/web/messages/en.json`, inside the existing `"footer"` object, add:

```json
    "reference": "Reference",
    "documentation": "Documentation",
```

In `app/web/messages/de.json`, inside `"footer"`:

```json
    "reference": "Referenz",
    "documentation": "Dokumentation",
```

- [x] **Step 2: Write the failing test**

In `app/web/src/components/layout/__tests__/site-footer.test.tsx`, add these tests inside the existing `describe('SiteFooter', ...)` block:

```tsx
  // Docs are deliberately absent from the header nav, so this column is the
  // only standing route to them.
  it('links the documentation from its own Reference column', () => {
    renderFooter()
    const reference = screen.getByRole('navigation', { name: 'Reference' })
    expect(within(reference).getByRole('link', { name: 'Documentation' })).toHaveAttribute(
      'href',
      '/docs',
    )
  })

  // GitHub is reference material and moved out of About, which would otherwise
  // leave Reference holding a single link.
  it('carries GitHub in the Reference column, not About', () => {
    renderFooter('https://github.com/P4PER/revelio')
    const reference = screen.getByRole('navigation', { name: 'Reference' })
    expect(within(reference).getByRole('link', { name: /GitHub/ })).toBeInTheDocument()

    const about = screen.getByRole('navigation', { name: 'About' })
    expect(within(about).queryByRole('link', { name: /GitHub/ })).toBeNull()
  })

  it('keeps the Reference column when no repository is configured', () => {
    renderFooter(null)
    const reference = screen.getByRole('navigation', { name: 'Reference' })
    expect(within(reference).getByRole('link', { name: 'Documentation' })).toBeInTheDocument()
    expect(within(reference).queryByRole('link', { name: /GitHub/ })).toBeNull()
  })
```

Also update the existing `renders the three navigation columns with internal links` test name and body: rename it to `renders the four navigation columns with internal links`, and delete from it the two assertions that look for GitHub inside the About column, if present.

- [x] **Step 3: Run it to make sure it fails**

```bash
cd app
/usr/local/bin/npm test -w web -- src/components/layout/__tests__/site-footer.test.tsx
```

Expected: FAIL - no navigation landmark named "Reference".

- [x] **Step 4: Add the column**

In `app/web/src/components/layout/site-footer.tsx`, change the grid class on the columns wrapper from:

```tsx
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
```

to:

```tsx
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
```

Then move the GitHub link out of the About column into a new column placed immediately after it:

```tsx
          <FooterColumn label={t('about')}>
            <FooterLink href="/about">{t('aboutLink')}</FooterLink>
            <FooterLink href="/contact">{t('contact')}</FooterLink>
            <FooterLink href="/discord">{t('discordBot')}</FooterLink>
          </FooterColumn>

          {/* Docs are deliberately absent from the header nav - a destination
              you go looking for, not one of five things every visitor needs -
              so this column is their only standing route in. Named Reference
              rather than Developers because /docs/discord is written for a
              player looking for bot help, not for a developer. */}
          <FooterColumn label={t('reference')}>
            <FooterLink href="/docs">{t('documentation')}</FooterLink>
            {githubUrl && (
              <Button variant="link" size="sm" asChild className={linkClass}>
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${t('github')} (opens in a new tab)`}
                >
                  {t('github')}
                  <ArrowUpRight className="size-3.5" aria-hidden />
                </a>
              </Button>
            )}
          </FooterColumn>
```

- [x] **Step 5: Run the test to verify it passes**

```bash
cd app
/usr/local/bin/npm test -w web -- src/components/layout/__tests__/site-footer.test.tsx
```

Expected: PASS, including the three new tests.

- [x] **Step 6: Verify the whole workspace and build**

```bash
cd app
/usr/local/bin/npm test -w web && /usr/local/bin/npm run typecheck \
  && /usr/local/bin/npm run lint && /usr/local/bin/npm run build -w web
```

Expected: all pass.

- [x] **Step 7: Check both themes and the responsive collapse by eye**

Take screenshots with the repo's bundled chromium (no Chrome is installed on this machine); import Playwright by absolute path from `app/web/node_modules`. Capture `/docs` and `/docs/discord/commands` at widths 1280, 1100 and 800, in both themes, and confirm: at 1280 three columns; at 1100 the right rail is gone; at 800 the sidebar is a band above the content; and the reading column never scrolls sideways.

- [x] **Step 8: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/src/components/layout app/web/messages
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): give the footer a Reference column for the docs"
```

---

## Phase exit criteria

- `/docs`, `/docs/discord` and all four subpages render in both locales; an unknown slug 404s.
- Deleting a locale from any registry entry fails `npm run typecheck` - proven in Task 1, Step 9.
- The left rail marks the active page; the right rail lists that page's headings and disappears below 1180px; the sidebar becomes a band below 860px.
- The footer has a Reference column linking `/docs`.
- `npm test -w web`, `npm run typecheck`, `npm run lint` and `npm run build -w web` all pass.

## What this phase deliberately does not do

The content is placeholder prose - one heading per page. `<CommandTable>` and `<Callout>`,
the real reference text, and the `/llms.txt` and sitemap entries are all phase 4. Nothing here
reads `BOT_COMMANDS`, so phase 2 can land before or after this phase.

## Execution notes

Executed on branch `feat/docs-shell`, one commit per task.

- Task 1's `types.ts` imports `routing` as `import type` - the snippet's value
  import is only ever used in `typeof routing.locales`, which
  `@typescript-eslint/consistent-type-imports` rejects.
- Task 4 replaces the `DocsOverview` export that phase 1's
  `docs/__tests__/docs-page.test.tsx` imported. Its page-level describe is
  superseded by the registry and route tests, so that block was removed and the
  file renamed to `docs-content.test.tsx`, which is what it now covers.
- Task 3, Step 9 ran against the dev server already up on port 3000 rather than
  a second one on 3100: Next 16 refuses to start a second dev server for the
  same directory.
