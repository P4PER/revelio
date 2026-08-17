import Image from 'next/image'
import { BRAND_NAME } from '@/lib/brand'

// Both variants ship and CSS picks one, so the right logo shows under
// prefers-color-scheme without JS. The hidden copy is aria-hidden with an
// empty alt so screen readers announce the brand once.
export function BrandMark() {
  return (
    <>
      <Image
        src="/revelio-logo-primary.svg"
        alt={BRAND_NAME}
        width={426}
        height={78}
        priority
        className="h-9 w-auto dark:hidden"
      />
      <Image
        src="/revelio-logo-dark.svg"
        alt=""
        aria-hidden
        width={426}
        height={78}
        priority
        className="hidden h-9 w-auto dark:block"
      />
    </>
  )
}
