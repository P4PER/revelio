'use client'
import { useEffect, useState } from 'react'
import { Toaster as Sonner } from 'sonner'
import { parseTheme, type ThemeChoice } from '@/lib/theme'

// sonner paints its own surface, so it needs the resolved choice rather than
// our CSS tokens. 'system' makes it follow prefers-color-scheme, which matches
// what globals.css does when no cookie is set.
//
// The prop is the cookie read on the server: right for the first paint, but it
// goes stale the moment the appearance form switches theme, because setTheme
// neither revalidates nor refreshes and layouts do not re-render on a soft
// navigation. The form mirrors the choice onto <html data-theme>, so follow
// that attribute for the rest of the session - including the "saved" toast
// fired by the very click that changed it.
export function Toaster({
  theme,
  ...props
}: React.ComponentProps<typeof Sonner> & { theme: ThemeChoice }) {
  const [resolved, setResolved] = useState<ThemeChoice>(theme)

  useEffect(() => {
    const read = () => setResolved(parseTheme(document.documentElement.dataset.theme))
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])

  return <Sonner theme={resolved} richColors position="top-center" {...props} />
}
