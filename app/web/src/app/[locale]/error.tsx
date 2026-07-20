'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Home, RotateCw } from 'lucide-react'
import { Link } from '@/../i18n/navigation'
import { Button } from '@/components/ui/button'
import { ErrorCardState } from '@/components/error-card-state'

export function RuntimeError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('errors')

  useEffect(() => {
    // Surface runtime errors in logs (Next.js convention).
    console.error(error)
  }, [error])

  return (
    <ErrorCardState
      variant="dissolving"
      heading={t('runtime.heading')}
      description={t('runtime.description')}
      digest={error.digest}
      digestLabel={t('digestLabel')}
    >
      <Button onClick={reset}>
        <RotateCw className="size-4" />
        {t('runtime.retryCta')}
      </Button>
      <Button asChild variant="outline">
        <Link href="/">
          <Home className="size-4" />
          {t('runtime.homeCta')}
        </Link>
      </Button>
    </ErrorCardState>
  )
}

export default RuntimeError
