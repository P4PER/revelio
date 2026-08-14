import { cn } from '@/lib/utils'

// shadcn's Skeleton, with bg-muted in place of upstream's bg-accent: this
// theme's accent is a vivid violet rather than a neutral surface, so the
// default would read as glowing blocks instead of placeholder shapes.
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  )
}

export { Skeleton }
