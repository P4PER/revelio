import { symbolKey, imageUrl } from '@revelio/core'
import { cn } from '@/lib/utils'

// Renders a set symbol as a single-color silhouette (CSS mask + currentColor),
// so every set logo shares one theme color and adapts to dark/light mode.
export function SetSymbol({
  code,
  base,
  className,
}: {
  code: string
  base: string
  className?: string
}) {
  const url = imageUrl(base, symbolKey(code))
  return (
    <span
      aria-hidden
      className={cn('inline-block bg-current', className)}
      style={{
        maskImage: `url("${url}")`,
        WebkitMaskImage: `url("${url}")`,
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
      }}
    />
  )
}
