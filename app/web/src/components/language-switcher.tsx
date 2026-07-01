'use client'

import { useLocale } from 'next-intl'
import { Link, usePathname } from '@/../i18n/navigation'
import { routing } from '@/../i18n/routing'

export function LanguageSwitcher() {
  const locale = useLocale()
  const pathname = usePathname()
  return (
    <nav aria-label="Language">
      <ul className="flex gap-3 text-sm list-none p-0 m-0">
        {routing.locales.map((l) => (
          <li key={l}>
            <Link
              href={pathname}
              locale={l}
              className={
                l === locale
                  ? 'font-semibold text-primary'
                  : 'text-muted-foreground hover:text-foreground transition-colors'
              }
            >
              {l.toUpperCase()}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
