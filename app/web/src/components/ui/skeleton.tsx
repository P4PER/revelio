import { cn } from '@/lib/utils'

// shadcn's Skeleton, with bg-muted in place of upstream's bg-accent: this
// theme's accent is a vivid violet rather than a neutral surface, so the
// default would read as glowing blocks instead of placeholder shapes.
// The pulse is dropped under prefers-reduced-motion (upstream animates
// unconditionally); the muted blocks still read as placeholders standing still,
// and the rest of the app already honours that preference.
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)}
      {...props}
    />
  )
}

export { Skeleton }
