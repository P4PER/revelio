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
