import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { HeaderSearch } from './header-search'
import { Link } from '@/../i18n/navigation'
import { Button } from '@/components/ui/button'
import { BrandMark } from './brand-mark'
import { LanguageSwitcher } from './language-switcher'
import { AccountMenu } from './account-menu'

export async function SiteHeader() {
  const t = await getTranslations('nav')
  const ts = await getTranslations('search')
  const ta = await getTranslations('auth')
  return (
    <header className="border-b border-border/60">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-2">
        <Link href="/" aria-label="Revelio home" className="shrink-0"><BrandMark /></Link>
        <Suspense fallback={<div className="mx-auto w-full max-w-md" />}>
          <HeaderSearch placeholder={ts('placeholder')} />
        </Suspense>
        <nav className="ml-auto flex shrink-0 items-center gap-3">
          <Button variant="ghost" size="sm" asChild><Link href="/sets">{t('sets')}</Link></Button>
          <span className="h-5 w-px bg-border/70" aria-hidden />
          <LanguageSwitcher />
          <span className="h-5 w-px bg-border/70" aria-hidden />
          <AccountMenu signInLabel={ta('signIn')} signOutLabel={ta('signOut')} />
        </nav>
      </div>
    </header>
  )
}
