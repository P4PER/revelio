'use client'
import { Dices } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/../i18n/navigation'
import { Button } from '@/components/ui/button'

// Mirrors the start page's random-card button in the header nav. The start page
// already has its own in the hero, so hide this one there to avoid duplication.
export function RandomNavButton() {
  const pathname = usePathname()
  const t = useTranslations('nav')
  if (pathname === '/') return null
  return (
    <Button variant="ghost" size="sm" asChild>
      <Link href="/random"><Dices className="size-4 opacity-70" />{t('random')}</Link>
    </Button>
  )
}
