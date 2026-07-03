import { getTranslations } from 'next-intl/server'
import { Link } from '@/../i18n/navigation'
import { Button } from '@/components/ui/button'
import { BrandMark } from './brand-mark'
import { LanguageSwitcher } from './language-switcher'

export async function SiteHeader() {
  const t = await getTranslations('nav')
  return (
    <header className="border-b border-border/60">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-2">
        <Link href="/" aria-label="revelio.cards home"><BrandMark /></Link>
        <nav className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild><Link href="/sets">{t('sets')}</Link></Button>
          <span className="h-5 w-px bg-border/70" aria-hidden />
          <LanguageSwitcher />
        </nav>
      </div>
    </header>
  )
}
