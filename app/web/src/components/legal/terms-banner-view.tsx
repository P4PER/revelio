'use client'
import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Link, useRouter } from '@/../i18n/navigation'
import { acceptTermsAction } from '@/lib/actions/terms-actions'
import { Button } from '@/components/ui/button'

/**
 * Asks a signed-in account to accept the current Terms of Service. No dismiss
 * control on purpose: closing a banner is not agreeing to anything, and the
 * terms only bind an existing account once it accepts (terms section 12).
 * Not blocking either - the site stays fully usable while it shows.
 */
export function TermsBannerView() {
  const t = useTranslations('termsBanner')
  const router = useRouter()
  const [pending, start] = useTransition()

  function accept() {
    start(async () => {
      try {
        const result = await acceptTermsAction()
        if (result.ok) {
          router.refresh()
          return
        }
      } catch {
        // Falls through to the same message as a refused save.
      }
      toast.error(t('error'))
    })
  }

  return (
    <div role="region" aria-label={t('label')} className="border-b border-border/60 bg-muted/40">
      <div className="mx-auto flex max-w-[76rem] flex-col gap-3 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {t.rich('body', {
            terms: (chunks) => (
              <Link href="/terms" className="text-foreground underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
        <Button size="sm" onClick={accept} disabled={pending} className="shrink-0 self-start sm:self-auto">
          {t('accept')}
        </Button>
      </div>
    </div>
  )
}
