'use client'
import Image from 'next/image'
import { usePathname } from '@/../i18n/navigation'
import { BRAND_NAME } from '@/lib/brand'
import { BrandMark } from '@/components/layout/brand-mark'

// Header wordmark that adapts to the search field. Off the home page the header
// search shares the row, so on phones we drop to the square icon and restore the
// full wordmark at >=640px. On home there's no search, so the wordmark stays at
// every width. The footer uses BrandMark directly and is unaffected.
export function HeaderBrandMark() {
  if (usePathname() === '/') return <BrandMark />

  return (
    <>
      <Image
        src="/revelio-icon.svg"
        alt={BRAND_NAME}
        width={68}
        height={68}
        priority
        className="h-9 w-auto min-[640px]:hidden"
      />
      <div className="hidden min-[640px]:block">
        <BrandMark />
      </div>
    </>
  )
}
