// Cookie that persists the deck overview's view preference. Defined in a plain
// (non-'use client') module so a Server Component can import the literal string:
// exports of a 'use client' module become client references on the server, not
// their values, which silently breaks `cookies().get(DECK_VIEW_COOKIE)`.
export const DECK_VIEW_COOKIE = 'revelio.deck-view'

export type DeckView = 'list' | 'gallery'
