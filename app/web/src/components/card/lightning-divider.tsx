import { cn } from '@/lib/utils'

// Ornamental divider echoing the lightning motif printed on the physical cards.
// Rendered as a CSS mask so it inherits the brand gold (--primary) and adapts to
// light/dark themes instead of shipping a fixed-colour image.
export function LightningDivider({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      role="presentation"
      className={cn('mx-auto my-1 h-6 w-full max-w-[260px] bg-primary/80', className)}
      style={{
        maskImage: "url('/lightning-divider.png')",
        WebkitMaskImage: "url('/lightning-divider.png')",
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
      }}
    />
  )
}
