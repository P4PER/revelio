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
    <html lang="en" className={`${poppins.variable} dark`}>
      <body className="min-h-screen bg-background text-foreground font-sans antialiased">
        <GlobalErrorContent error={error} />
      </body>
    </html>
  )
}
