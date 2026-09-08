import { Compass, Wand2, Library, type LucideIcon } from 'lucide-react'

// Deck destinations shared by DecksMenu (desktop dropdown) and MobileNav
// (drawer), so both stay in sync when a route or label changes. `labelKey` is a
// key in the `nav` message namespace. Every link shows to every visitor: signed
// out, /decks/mine renders its own teaser rather than a dead end. Each consumer
// applies its own icon sizing.
export type DeckLink = {
  href: string
  labelKey: 'browse' | 'deckBuilder' | 'myDecks'
  Icon: LucideIcon
}

export const DECK_LINKS: readonly DeckLink[] = [
  { href: '/decks', labelKey: 'browse', Icon: Compass },
  { href: '/decks/new', labelKey: 'deckBuilder', Icon: Wand2 },
  { href: '/decks/mine', labelKey: 'myDecks', Icon: Library },
]
