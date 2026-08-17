'use client'
import { Toaster as Sonner } from 'sonner'
import type { ThemeChoice } from '@/lib/theme'

// sonner paints its own surface, so it needs the resolved choice rather than
// our CSS tokens. 'system' makes it follow prefers-color-scheme, which matches
// what globals.css does when no cookie is set.
export function Toaster({
  theme,
  ...props
}: React.ComponentProps<typeof Sonner> & { theme: ThemeChoice }) {
  return <Sonner theme={theme} richColors position="top-center" {...props} />
}
