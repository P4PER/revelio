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
