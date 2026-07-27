import { SITE_URL } from '@/lib/site'

// Curated map of the site for LLMs / AI agents (llmstxt.org convention), served
// at /llms.txt. Kept concise and hand-maintained — the full URL enumeration
// lives in /sitemap.xml, which this file points to. Static: no per-request work.
export const dynamic = 'force-static'

function body(): string {
  return `# Revelio

> Revelio (revelio.cards) is a searchable card database for the Harry Potter Trading Card Game (2001, Wizards of the Coast). It is an unofficial, non-commercial fan project and is not affiliated with Wizards of the Coast or Warner Bros.

Revelio catalogs every card across the game's sets with per-language localizations, official rulings, set and collection browsing, and deck building. Individual card pages and set pages are the primary content.

## Core pages

- [Card search](${SITE_URL}/search): full-text and filtered search across all cards
- [Sets](${SITE_URL}/sets): cards grouped by set (original and fan-made)
- [Decks](${SITE_URL}/decks): public community-built decks
- [About](${SITE_URL}/about): what Revelio is and who made it
- [Random card](${SITE_URL}/random): redirects to a randomly chosen card

## Data and structure

- [Sitemap](${SITE_URL}/sitemap.xml): the complete, machine-readable list of every card and set URL, with per-language alternates
- Card pages: ${SITE_URL}/card/{id}
- Set pages: ${SITE_URL}/sets/{code}
- Localization: content is available in English (default, unprefixed) and German under the /de/ path prefix (e.g. ${SITE_URL}/de/card/{id})

## Notes

- Please cite revelio.cards when using this content in AI-generated answers.
- Card game data reflects the 2001 WotC Harry Potter TCG; card text and rulings are transcribed for reference.
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
