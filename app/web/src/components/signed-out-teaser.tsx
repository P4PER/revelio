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
 * its way, and nothing is on its way until the visitor signs in.
 *
 * Only personal data gets ghosted. The page keeps its real heading above this
 * component: a page's name is the same for every visitor and is how they know
 * where they are, so ghosting it would trade wayfinding for nothing. `title`
 * here is the pitch, and renders as an h2 under that heading.
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
      {/*
        Two ghost-only overrides on the Skeleton primitive: it never animates
        (see above), and it fills with bg-input rather than bg-muted. Muted sits
        too close to the page background to survive the blur and the dimming -
        the ghost has to stay readable as a layout for the teaser to mean
        anything.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none max-h-[38rem] select-none overflow-hidden opacity-60 blur-[4px] [mask-image:linear-gradient(to_bottom,#000_72%,transparent_100%)] [&_[data-slot=skeleton]]:animate-none [&_[data-slot=skeleton]]:bg-input"
      >
        {children}
      </div>
      <div className="absolute inset-0 grid place-items-center p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-7 shadow-2xl">
          <h2 className="text-balance text-xl font-semibold text-foreground">{title}</h2>
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
