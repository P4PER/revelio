import { cn } from '@/lib/utils'

// The card chrome only applies from `sm` up. On a phone a box costs width - a
// second gutter inside the page's - and frames a form that already fills the
// screen, so below `sm` the form sits directly on the page. z-10 keeps it above
// the fan cards that run behind its top edge. Login and contact both use it, so
// the two form pages cannot drift apart; it lives apart from auth-form.tsx so the
// contact page does not ship the login flow to get a class string.
export const FORM_CARD =
  'relative z-10 sm:rounded-xl sm:border sm:border-border sm:bg-card sm:p-8 sm:shadow-[0_-10px_28px_rgb(19_18_42/0.22)]'

export function FormCard({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn(FORM_CARD, className)} {...props} />
}
