import en from '@/../messages/en.json'
import de from '@/../messages/de.json'
import type { EmailLocale } from './types'

// Catalogs for templates that render per locale. Same pattern as
// LEGAL_DOCUMENTS: adding a locale to routing.locales fails the typecheck here
// until its catalog is wired in. The cast only unifies the inferred catalog
// types; the parity test keeps their translated keys in step.
export const EMAIL_MESSAGES = { en, de: de as typeof en } satisfies Record<EmailLocale, typeof en>
