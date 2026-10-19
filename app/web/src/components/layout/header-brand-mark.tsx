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
      {/* Both icons ship and CSS picks one for the theme, as BrandMark does for the
          wordmark (its comment says why neither is preloaded). The breakpoint sits on
          the wrapper so it never competes with the theme variant for display. */}
      <span className="flex min-[640px]:hidden">
        <Image
          src="/revelio-icon-on-light.svg"
          alt={BRAND_NAME}
          width={68}
          height={68}
          className="h-9 w-auto dark:hidden"
        />
        <Image
          src="/revelio-icon-on-dark.svg"
          alt={BRAND_NAME}
          width={68}
          height={68}
          className="hidden h-9 w-auto dark:block"
        />
      </span>
      <div className="hidden min-[640px]:block">
        <BrandMark />
      </div>
    </>
  )
}
