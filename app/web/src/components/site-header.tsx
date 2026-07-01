import { Link } from '@/../i18n/navigation'
import { BrandMark } from './brand-mark'
import { LanguageSwitcher } from './language-switcher'

export function SiteHeader() {
  return (
    <header className="border-b border-border/60">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" aria-label="revelio.cards home">
          <BrandMark />
        </Link>
        <LanguageSwitcher />
      </div>
    </header>
  )
}
