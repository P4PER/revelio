import { Compass, Wand2, Library, type LucideIcon } from 'lucide-react'

// Deck destinations shared by DecksMenu (desktop dropdown) and MobileNav
// (drawer), so both stay in sync when a route or label changes. `labelKey` is a
// key in the `nav` message namespace; `requiresAuth` links only show when signed
// in. Each consumer applies its own icon sizing.
export type DeckLink = {
  href: string
  labelKey: 'browse' | 'deckBuilder' | 'myDecks'
  Icon: LucideIcon
  requiresAuth?: boolean
}

export const DECK_LINKS: readonly DeckLink[] = [
  { href: '/decks', labelKey: 'browse', Icon: Compass },
  { href: '/decks/new', labelKey: 'deckBuilder', Icon: Wand2 },
  { href: '/decks/mine', labelKey: 'myDecks', Icon: Library, requiresAuth: true },
]
