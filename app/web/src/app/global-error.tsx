'use client'

import { Poppins } from 'next/font/google'
import { RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ErrorCardState } from '@/components/error-card-state'
import './globals.css'

// global-error renders its own <html> without the [locale] layout, so it must
// load the brand font itself; otherwise font-sans (var(--font-poppins)) would
// fall back to system sans-serif.
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-poppins',
})

// English on purpose. This boundary replaces the root layout, so there is no
// next-intl provider and no request locale to read; detecting one client-side
// would still paint English first and would add a hydration seam plus both
// catalogues to the one component that has to survive a total failure. The
// <html lang="en"> below says the same thing, so markup and copy agree.
export function GlobalErrorContent({ error }: { error: Error & { digest?: string } }) {
  return (
    <ErrorCardState
      variant="dark"
      heading="Something went dark"
      description="The app hit an unexpected error. Reloading usually fixes it."
      digest={error.digest}
      digestLabel="reference"
    >
      <Button onClick={() => window.location.reload()}>
        <RotateCw className="size-4" />
        Reload
      </Button>
    </ErrorCardState>
  )
}

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    // No data-theme: this boundary replaces the root layout, so it cannot read
    // the cookie. Omitting the attribute falls through to prefers-color-scheme.
    <html lang="en" className={poppins.variable}>
      <body className="min-h-screen bg-background text-foreground font-sans antialiased">
        <GlobalErrorContent error={error} />
      </body>
    </html>
  )
}
