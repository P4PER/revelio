import { cn } from '@/lib/utils'

// Standalone inline error line for inputs that are NOT backed by react-hook-form
// (uploaders, deck import, filter range, inline rename). Matches <FormMessage>
// styling so field errors look identical everywhere. Renders nothing when empty.
export function FieldError({
  id,
  className,
  children,
}: {
  id?: string
  className?: string
  children?: React.ReactNode
}) {
  if (!children) return null
  return (
    <p id={id} role="alert" className={cn('text-destructive text-sm', className)}>
      {children}
    </p>
  )
}
