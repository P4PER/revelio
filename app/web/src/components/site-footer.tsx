import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowUpRight } from 'lucide-react'
import { Link } from '@/../i18n/navigation'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { BrandMark } from './brand-mark'
import { LanguageSwitcher } from './language-switcher'
import { BackToTopButton } from './back-to-top-button'
import { BRAND_NAME } from '@/lib/brand'

const linkClass = 'h-auto justify-start p-0 text-muted-foreground hover:text-foreground'

function FooterColumn({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav aria-label={label} className="flex flex-col items-start gap-1">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground">
        {label}
      </h2>
      {children}
    </nav>
  )
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button variant="link" size="sm" asChild className={linkClass}>
      <Link href={href}>{children}</Link>
    </Button>
  )
}

export function SiteFooter() {
  const t = useTranslations('footer')
  const year = new Date().getFullYear()
  const githubUrl = process.env.GITHUB_URL

  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto max-w-[76rem] px-6 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="sm:col-span-2 lg:col-span-1">
            <BrandMark />
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">{t('tagline')}</p>
          </div>

          <FooterColumn label={t('browse')}>
            <FooterLink href="/sets">{t('sets')}</FooterLink>
            <FooterLink href="/decks">{t('discoverDecks')}</FooterLink>
            <FooterLink href="/random">{t('randomCard')}</FooterLink>
          </FooterColumn>

          <FooterColumn label={t('build')}>
            <FooterLink href="/decks/new">{t('deckBuilder')}</FooterLink>
            <FooterLink href="/decks/mine">{t('myDecks')}</FooterLink>
            <FooterLink href="/collection">{t('collection')}</FooterLink>
          </FooterColumn>

          <FooterColumn label={t('about')}>
            <FooterLink href="/about">{t('aboutLink')}</FooterLink>
            <FooterLink href="/contact">{t('contact')}</FooterLink>
            {githubUrl && (
              <Button variant="link" size="sm" asChild className={linkClass}>
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${t('github')} (opens in a new tab)`}
                >
                  {t('github')}
                  <ArrowUpRight className="size-3.5" aria-hidden />
                </a>
              </Button>
            )}
          </FooterColumn>
        </div>

        <Separator className="my-8" />

        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('disclaimer', { brand: BRAND_NAME })}
        </p>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {t('copyright', { year, brand: BRAND_NAME })}
          </p>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <BackToTopButton label={t('backToTop')} />
          </div>
        </div>
      </div>
    </footer>
  )
}
