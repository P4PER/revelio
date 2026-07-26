'use client'
import { useState } from 'react'
import {
  Menu,
  Layers,
  Compass,
  Wand2,
  Library,
  LibraryBig,
  Dices,
  Globe,
  Shield,
  LogOut,
} from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { Link, usePathname, useRouter } from '@/../i18n/navigation'
import { routing } from '@/../i18n/routing'
import { signOut } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet'
import type { AccountUser } from './account-menu'

// Autonyms, mirroring LanguageSwitcher.
const LOCALE_NAMES: Record<string, string> = { en: 'English', de: 'Deutsch' }

const rowClass =
  'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-left hover:bg-accent hover:text-accent-foreground'

// Mobile counterpart to the inline header nav: a hamburger that opens a drawer
// listing every destination as a flat row (dropdowns don't nest cleanly inside
// a sheet). Shown below 1024px; the inline nav takes over at/above it.
export function MobileNav({
  isEditor,
  user,
}: {
  isEditor: boolean
  user: AccountUser | null
}) {
  const t = useTranslations('nav')
  const tAuth = useTranslations('auth')
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  const isLoggedIn = !!user

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('menu')}>
          <Menu className="size-5 opacity-70" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72 gap-0 overflow-y-auto p-4">
        <SheetTitle className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('menu')}
        </SheetTitle>

        <nav className="flex flex-col">
          <Link href="/sets" onClick={close} className={rowClass}>
            <Layers className="size-4 opacity-70" />
            {t('sets')}
          </Link>
          <Link href="/decks" onClick={close} className={rowClass}>
            <Compass className="size-4 opacity-70" />
            {t('browse')}
          </Link>
          <Link href="/decks/new" onClick={close} className={rowClass}>
            <Wand2 className="size-4 opacity-70" />
            {t('deckBuilder')}
          </Link>
          {isLoggedIn && (
            <Link href="/decks/mine" onClick={close} className={rowClass}>
              <Library className="size-4 opacity-70" />
              {t('myDecks')}
            </Link>
          )}
          {isLoggedIn && (
            <Link href="/collection" onClick={close} className={rowClass}>
              <LibraryBig className="size-4 opacity-70" />
              {t('collection')}
            </Link>
          )}
          {/* Home has its own hero random button, mirroring RandomNavButton. */}
          {pathname !== '/' && (
            <Link href="/random" onClick={close} className={rowClass}>
              <Dices className="size-4 opacity-70" />
              {t('random')}
            </Link>
          )}
        </nav>

        <div className="my-2 border-t border-border/60" />

        <div className="flex flex-col">
          {routing.locales.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => {
                router.replace(pathname, { locale: l })
                close()
              }}
              className={`${rowClass}${l === locale ? ' text-primary' : ''}`}
            >
              <Globe className="size-4 opacity-70" />
              {LOCALE_NAMES[l] ?? l.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="my-2 border-t border-border/60" />

        {user ? (
          <div className="flex flex-col">
            <span className="truncate px-3 py-1 text-xs text-muted-foreground">
              {user.email}
            </span>
            {isEditor && (
              <Link href="/admin" onClick={close} className={rowClass}>
                <Shield className="size-4 opacity-70" />
                {t('admin')}
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                signOut({
                  fetchOptions: {
                    onSuccess: () => {
                      router.push('/')
                      router.refresh()
                    },
                  },
                })
                close()
              }}
              className={`${rowClass} text-destructive hover:bg-destructive/20 hover:text-destructive`}
            >
              <LogOut className="size-4" />
              {tAuth('signOut')}
            </button>
          </div>
        ) : (
          <Link href="/login" onClick={close} className={rowClass}>
            {tAuth('signIn')}
          </Link>
        )}
      </SheetContent>
    </Sheet>
  )
}
