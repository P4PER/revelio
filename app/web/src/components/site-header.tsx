import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { HeaderSearch } from './header-search'
import { Link } from '@/../i18n/navigation'
import { BRAND_NAME } from '@/lib/brand'
import { Layers, Library } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BrandMark } from './brand-mark'
import { DecksMenu } from './decks-menu'
import { RandomNavButton } from './random-nav-button'
import { LanguageSwitcher } from './language-switcher'
import { AccountMenu } from './account-menu'
import { MobileNav } from './mobile-nav'
import { getSession } from '@/lib/session'
import { hasRequiredRole } from '@/lib/roles'

export async function SiteHeader() {
  const t = await getTranslations('nav')
  const ts = await getTranslations('search')
  const session = await getSession()
  const isEditor = hasRequiredRole(session?.user?.role, 'editor')
  const accountUser = session?.user
    ? {
        email: session.user.email,
        username: session.user.username,
        displayUsername: session.user.displayUsername,
      }
    : null
  return (
    <header className="border-b border-border/60">
      <div className="mx-auto flex max-w-[76rem] items-center gap-4 px-6 py-2">
        <Link href="/" aria-label={`${BRAND_NAME} home`} className="shrink-0"><BrandMark /></Link>
        <Suspense fallback={<div className="w-full max-w-md" />}>
          <HeaderSearch placeholder={ts('placeholder')} />
        </Suspense>
        {/* Inline nav at >=1024px; collapses into a drawer below that. */}
        <nav className="ml-auto hidden shrink-0 items-center gap-3 min-[1024px]:flex">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/sets"><Layers className="size-4 opacity-70" />{t('sets')}</Link>
          </Button>
          <DecksMenu isLoggedIn={!!session?.user} />
          {session?.user && (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/collection"><Library className="size-4 opacity-70" />{t('collection')}</Link>
            </Button>
          )}
          <RandomNavButton />
          <span className="h-5 w-px bg-foreground/20" aria-hidden />
          <LanguageSwitcher />
          <span className="h-5 w-px bg-foreground/20" aria-hidden />
          {/* Admin entry is editor-gated via the isEditor flag (server-side role
              check); the /admin route is independently enforced server-side too
              (layout requireRole). */}
          <AccountMenu isEditor={isEditor} user={accountUser} />
        </nav>
        <div className="ml-auto shrink-0 min-[1024px]:hidden">
          <MobileNav isEditor={isEditor} user={accountUser} />
        </div>
      </div>
    </header>
  )
}
