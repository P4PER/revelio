/**
 * Version of the Terms of Service currently published at /terms: the date
 * the text took effect. Isomorphic on purpose - the page renders it and the
 * acceptance record stores it, so the two can never disagree.
 *
 * Bump it only together with a change to content/legal/terms.*.mdx. A bump
 * makes every account whose stored version differs see the acceptance banner
 * again.
 */
export const TERMS_VERSION = '2026-09-16'

export const TERMS_EFFECTIVE_DATE = new Date(`${TERMS_VERSION}T00:00:00Z`)
