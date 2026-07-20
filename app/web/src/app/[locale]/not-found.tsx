import { getTranslations } from 'next-intl/server'
import { Home, Search } from 'lucide-react'
import { Link } from '@/../i18n/navigation'
import { Button } from '@/components/ui/button'
import { ErrorCardState } from '@/components/error-card-state'

export async function NotFound() {
  const t = await getTranslations('errors')
  return (
    <ErrorCardState
      variant="missing"
      heading={t('notFound.heading')}
      description={t('notFound.description')}
    >
      <Button asChild>
        <Link href="/search">
          <Search className="size-4" />
          {t('notFound.searchCta')}
        </Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/">
          <Home className="size-4" />
          {t('notFound.homeCta')}
        </Link>
      </Button>
    </ErrorCardState>
  )
}

export default NotFound
