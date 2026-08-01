'use client'
import { useState } from 'react'
import {
  Menu,
  Layers,
  LibraryBig,
  Dices,
  Globe,
  Shield,
  Settings,
  LogOut,
} from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { Link, usePathname } from '@/../i18n/navigation'
import { routing } from '@/../i18n/routing'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet'
import { DECK_LINKS } from './nav-links'
import { LOCALE_NAMES, useSwitchLocale } from './locale-switch'
import { useSignOut } from './use-sign-out'
import type { AccountUser } from './types'

const rowClass =
  'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm text-left hover:bg-accent hover:text-accent-foreground'

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
  const switchLocale = useSwitchLocale()
  const signOut = useSignOut()
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
          {DECK_LINKS.filter((l) => !l.requiresAuth || isLoggedIn).map((l) => (
            <Link key={l.href} href={l.href} onClick={close} className={rowClass}>
              <l.Icon className="size-4 opacity-70" />
              {t(l.labelKey)}
            </Link>
          ))}
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
                switchLocale(l)
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
            <Link href="/settings" onClick={close} className={rowClass}>
              <Settings className="size-4 opacity-70" />
              {t('settings')}
            </Link>
            <button
              type="button"
              onClick={() => {
                signOut()
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
