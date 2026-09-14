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
