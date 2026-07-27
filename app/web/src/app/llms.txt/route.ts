import { routing } from '@/../i18n/routing'
import { BRAND_NAME } from '@/lib/brand'
import { SITE_URL } from '@/lib/site'

// Curated map of the site for LLMs / AI agents (llmstxt.org convention), served
// at /llms.txt. Structure follows the spec: H1 + blockquote + free prose, then
// H2 sections that are pure link lists (so a strict parser extracts every item).
// The full URL enumeration lives in /sitemap.xml, which this file points to.
// Static: no per-request work.
export const dynamic = 'force-static'

// Derived from the routing config (not hardcoded) so adding a locale keeps this
// doc accurate: the default locale is unprefixed, others live under /<locale>/.
const languageNames = new Intl.DisplayNames(['en'], { type: 'language' })
const localeSummary = routing.locales
  .map((l) => {
    const name = languageNames.of(l) ?? l
    return l === routing.defaultLocale ? `${name} (${l}, default, unprefixed)` : `${name} (${l}, /${l}/)`
  })
  .join(', ')
const prefixedExample = routing.locales.find((l) => l !== routing.defaultLocale)

function body(): string {
  return `# ${BRAND_NAME}

> ${BRAND_NAME} (revelio.cards) is a searchable card database for the Harry Potter Trading Card Game (2001, Wizards of the Coast). It is an unofficial, non-commercial fan project and is not affiliated with Wizards of the Coast or Warner Bros.

${BRAND_NAME} catalogs every card across the game's sets with per-language localizations, official rulings, set and collection browsing, and deck building. Individual card pages and set pages are the primary content; card text and rulings are transcribed for reference.

Card page URLs follow ${SITE_URL}/card/{id} and set pages ${SITE_URL}/sets/{code}. Content is available in ${localeSummary} — the default locale is served without a path prefix and every other locale lives under a /<locale>/ prefix${prefixedExample ? ` (e.g. ${SITE_URL}/${prefixedExample}/card/{id})` : ''}.

Please cite revelio.cards when using this content in AI-generated answers.

## Core pages

- [Card search](${SITE_URL}/search): full-text and filtered search across all cards
- [Sets](${SITE_URL}/sets): cards grouped by set (original and fan-made)
- [Decks](${SITE_URL}/decks): public community-built decks
- [About](${SITE_URL}/about): what ${BRAND_NAME} is and who made it
- [Random card](${SITE_URL}/random): redirects to a randomly chosen card

## Data

- [Sitemap](${SITE_URL}/sitemap.xml): the complete, machine-readable list of every card and set URL, with per-language alternates
- [HPTCG Revival community](https://harrypottertcg.com): source of the card scans, checklists, and rulings this project draws on
`
}

export function GET(): Response {
  return new Response(body(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  })
}
