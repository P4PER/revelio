import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { HeaderSearch } from './header-search'
import { Link } from '@/../i18n/navigation'
import { BRAND_NAME } from '@/lib/brand'
import { Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BrandMark } from './brand-mark'
import { LanguageSwitcher } from './language-switcher'
import { AccountMenu } from './account-menu'
import { getSession } from '@/lib/session'
import { hasRequiredRole } from '@/lib/roles'

export async function SiteHeader() {
  const t = await getTranslations('nav')
  const ts = await getTranslations('search')
  const session = await getSession()
  const isEditor = hasRequiredRole(session?.user?.role, 'editor')
  return (
    <header className="border-b border-border/60">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-2">
        <Link href="/" aria-label={`${BRAND_NAME} home`} className="shrink-0"><BrandMark /></Link>
        <Suspense fallback={<div className="mx-auto w-full max-w-md" />}>
          <HeaderSearch placeholder={ts('placeholder')} />
        </Suspense>
        <nav className="ml-auto flex shrink-0 items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/sets"><Layers className="size-4 opacity-70" />{t('sets')}</Link>
          </Button>
          <span className="h-5 w-px bg-border/70" aria-hidden />
          <LanguageSwitcher />
          <span className="h-5 w-px bg-border/70" aria-hidden />
          {/* Admin entry is editor-gated via the isEditor flag (server-side role
              check); the /admin route is independently enforced server-side too
              (layout requireRole). */}
          <AccountMenu isEditor={isEditor} />
        </nav>
      </div>
    </header>
  )
}
