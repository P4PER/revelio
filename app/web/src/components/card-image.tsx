import Image from 'next/image'
import { cn } from '@/lib/utils'

export function isHorizontal(orientation?: string | null): boolean {
  return orientation === 'horizontal'
}

// Card faces are stored as portrait 745×1040 files; a "horizontal" card is a
// landscape card rotated 90° to fit that canvas. When `upright` is requested for
// such a card we render a landscape frame and rotate the image back to fill it.
// The inner box is the portrait footprint (5:7): sized to 71.43% × 140% of the
// landscape frame so a 90° rotation lands exactly on the frame's edges.
export function CardImage({
  src, alt, orientation, upright = false, sizes, priority = false, frameClassName,
}: {
  src: string
  alt: string
  orientation?: string | null
  upright?: boolean
  sizes?: string
  priority?: boolean
  frameClassName?: string
}) {
  if (upright && isHorizontal(orientation)) {
    return (
      <div className={cn('relative aspect-[7/5] overflow-hidden', frameClassName)}>
        <div className="absolute top-1/2 left-1/2 h-[140%] w-[71.4286%] -translate-x-1/2 -translate-y-1/2 rotate-90">
          <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" />
        </div>
      </div>
    )
  }
  return (
    <div className={cn('relative aspect-[5/7] overflow-hidden', frameClassName)}>
      <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className="object-cover" />
    </div>
  )
}
