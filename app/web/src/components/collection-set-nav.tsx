'use client'

import { useTranslations } from 'next-intl'
import { ResponsiveSidebar } from '@/components/responsive-sidebar'
import { CollectionSidebar, type SetNavProps } from '@/components/collection-sidebar'

export function CollectionSetNav(props: SetNavProps) {
  const t = useTranslations('collection')
  return (
    <ResponsiveSidebar
      title={t('setsNav')}
      railClassName="w-64 min-[1024px]:max-h-[calc(100vh-3rem)] min-[1024px]:overflow-y-auto"
      drawerClassName="w-72 overflow-y-auto"
      rail={<CollectionSidebar {...props} />}
      drawer={(close) => <CollectionSidebar {...props} onSelect={close} />}
    />
  )
}
