import type { ReactNode } from 'react'
import { Link } from '@/../i18n/navigation'
import { Button } from '@/components/ui/button'

type Cta = { label: string; href: string }

/**
 * Signed-out state for a page that has something worth showing: a teaser card
 * over a blurred, dimmed ghost of the real layout, so a visitor can see the
 * shape of what signing in gets them.
 *
 * The ghost is decoration. It is hidden from assistive tech, non-interactive,
 * and deliberately NOT animated - a pulsing skeleton promises data that is on
 * its way, and nothing is on its way until the visitor signs in. The teaser
 * title carries the page's h1, since the ghost's own heading is hidden.
 */
export function SignedOutTeaser({
  title,
  description,
  primary,
  secondary,
  children,
}: {
  title: string
  description: string
  primary: Cta
  secondary: Cta
  children: ReactNode
}) {
  return (
    <div className="relative isolate">
      <div
        aria-hidden="true"
        className="pointer-events-none max-h-[38rem] select-none overflow-hidden opacity-45 blur-[4px] [&_[data-slot=skeleton]]:animate-none"
      >
        {children}
      </div>
      <div className="absolute inset-0 grid place-items-center p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-7 shadow-2xl">
          <h1 className="text-balance text-xl font-semibold text-foreground">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild>
              <Link href={primary.href}>{primary.label}</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={secondary.href}>{secondary.label}</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
