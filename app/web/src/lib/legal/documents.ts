import type { MDXContent } from 'mdx/types'
import type { routing } from '@/../i18n/routing'

type LegalLocale = (typeof routing.locales)[number]

type LegalDocumentLoader = () => Promise<{ default: MDXContent }>

/**
 * Every legal document body, by name and locale. The `satisfies` clause is the
 * point, as in lib/docs/registry.ts: adding a locale to routing.locales fails
 * the typecheck until each document is translated, instead of silently serving
 * English. Literal import paths keep each file statically analyzable.
 */
export const LEGAL_DOCUMENTS = {
  terms: {
    en: () => import('@/../content/legal/terms.en.mdx'),
    de: () => import('@/../content/legal/terms.de.mdx'),
  },
  privacy: {
    en: () => import('@/../content/legal/privacy.en.mdx'),
    de: () => import('@/../content/legal/privacy.de.mdx'),
  },
} satisfies Record<string, Record<LegalLocale, LegalDocumentLoader>>
