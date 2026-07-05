import Image from 'next/image'
import { BRAND_NAME } from '@/lib/brand'

export function BrandMark() {
  return (
    <Image
      src="/revelio-logo-dark.svg"
      alt={BRAND_NAME}
      width={426}
      height={78}
      priority
      className="h-9 w-auto"
    />
  )
}
