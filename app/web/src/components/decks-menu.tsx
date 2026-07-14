'use client'
import { ChevronDown, Compass, Library, LibraryBig, Wand2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/../i18n/navigation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

// Groups every deck-related destination under one "Decks" menu: discovering
// public decks, building a new one, and (when signed in) the user's own decks —
// which previously lived out of place in the account menu.
export function DecksMenu({ isLoggedIn }: { isLoggedIn: boolean }) {
  const t = useTranslations('nav')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <LibraryBig className="size-4 opacity-70" />
          {t('decks')}
          <ChevronDown className="size-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuItem asChild>
          <Link href="/decks"><Compass />{t('browse')}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/decks/new"><Wand2 />{t('deckBuilder')}</Link>
        </DropdownMenuItem>
        {isLoggedIn && (
          <DropdownMenuItem asChild>
            <Link href="/decks/mine"><Library />{t('myDecks')}</Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
