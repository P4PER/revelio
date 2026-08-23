import Image from 'next/image'
import { BRAND_NAME } from '@/lib/brand'

// Both variants ship and CSS picks one, so the right logo shows under
// prefers-color-scheme without JS. Both carry the brand as alt text: the hidden
// copy is display:none, which already removes it from the accessibility tree,
// so the name is announced once without depending on a wrapping aria-label.
//
// Neither is preloaded. Marking both `priority` spends a preload on the copy
// that is never painted, and marking only one moves that cost onto the other
// theme - whose visible wordmark then has no preload at all. These are small
// SVGs in the initial HTML, and the header renders them at h-9, so this is not
// the LCP element that `priority` exists for.
export function BrandMark() {
  return (
    <>
      <Image
        src="/revelio-logo-primary.svg"
        alt={BRAND_NAME}
        width={426}
        height={78}
        className="h-9 w-auto dark:hidden"
      />
      <Image
        src="/revelio-logo-dark.svg"
        alt={BRAND_NAME}
        width={426}
        height={78}
        className="hidden h-9 w-auto dark:block"
      />
    </>
  )
}
