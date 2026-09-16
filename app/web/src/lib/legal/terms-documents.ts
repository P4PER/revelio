import type { MDXContent } from 'mdx/types'
import type { routing } from '@/../i18n/routing'

type TermsLocale = (typeof routing.locales)[number]

type TermsDocumentLoader = () => Promise<{ default: MDXContent }>

/**
 * The terms body per locale. The `satisfies` clause is the point, as in
 * lib/docs/registry.ts: adding a locale to routing.locales fails the typecheck
 * until the terms are translated, instead of silently serving English. Literal
 * import paths keep each file statically analyzable.
 */
export const TERMS_DOCUMENTS = {
  en: () => import('@/../content/legal/terms.en.mdx'),
  de: () => import('@/../content/legal/terms.de.mdx'),
} satisfies Record<TermsLocale, TermsDocumentLoader>
