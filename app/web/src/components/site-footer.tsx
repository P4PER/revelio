import { useTranslations } from 'next-intl'
import { BRAND_NAME } from '@/lib/brand'

export function SiteFooter() {
  const t = useTranslations('footer')
  return (
    <footer className="mt-16 border-t border-border/60">
      <div className="mx-auto max-w-5xl px-6 py-8 text-xs leading-relaxed text-muted-foreground">
        {t('disclaimer', { brand: BRAND_NAME })}
      </div>
    </footer>
  )
}
