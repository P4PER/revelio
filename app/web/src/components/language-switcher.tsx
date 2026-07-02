'use client'
import { useLocale } from 'next-intl'
import { Link, usePathname } from '@/../i18n/navigation'
import { routing } from '@/../i18n/routing'
import { Button } from '@/components/ui/button'

export function LanguageSwitcher() {
  const locale = useLocale()
  const pathname = usePathname()
  return (
    <nav aria-label="Language" className="flex gap-1">
      {routing.locales.map((l) => (
        <Button key={l} variant={l === locale ? 'secondary' : 'ghost'} size="sm" asChild>
          <Link href={pathname} locale={l}>{l.toUpperCase()}</Link>
        </Button>
      ))}
    </nav>
  )
}
