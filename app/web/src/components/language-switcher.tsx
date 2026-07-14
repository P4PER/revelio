'use client'
import { useLocale } from 'next-intl'
import { Globe } from 'lucide-react'
import { usePathname, useRouter } from '@/../i18n/navigation'
import { routing } from '@/../i18n/routing'
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select'

// Autonyms: each language written in its own language (i18n best practice).
const LOCALE_NAMES: Record<string, string> = { en: 'English', de: 'Deutsch' }

export function LanguageSwitcher() {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  return (
    <Select value={locale} onValueChange={(next) => router.replace(pathname, { locale: next })}>
      <SelectTrigger
        size="sm"
        aria-label={`Language: ${LOCALE_NAMES[locale] ?? locale}`}
        title={LOCALE_NAMES[locale] ?? locale}
        className="w-auto gap-1.5 border-0 bg-transparent px-2 text-sm shadow-none hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 focus-visible:ring-1 [&_svg]:text-foreground!"
      >
        <Globe className="size-4 opacity-70" />
        <span className="text-sm font-medium uppercase">{locale}</span>
      </SelectTrigger>
      <SelectContent align="end">
        {routing.locales.map((l) => (
          <SelectItem key={l} value={l}>{LOCALE_NAMES[l] ?? l.toUpperCase()}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
