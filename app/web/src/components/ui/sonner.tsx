'use client'
import { useEffect, useState } from 'react'
import { Sparkle, Trash2 } from 'lucide-react'
import { toast, Toaster as Sonner, type ExternalToast } from 'sonner'
import { usePathname } from '@/../i18n/navigation'
import { parseTheme, type ThemeChoice } from '@/lib/theme'

// Clears the site header at the top of the page. The header is not sticky, so
// once the page scrolls this leaves a gap above the toast instead; following
// the scroll is not worth the machinery for a toast that lasts seconds.
// sonner swaps to `mobileOffset` below its own 600px breakpoint, so both props
// carry it.
const HEADER_OFFSET = { top: '4rem' }
// Module scope, so sonner's toasts do not see a new icons object, and
// re-render, on every navigation.
const TOAST_ICONS = { success: <Sparkle className="toast-star size-4" fill="currentColor" /> }

const REMOVED_ICON = <Trash2 className="size-4" />
// Sonner's 4s default is barely time to read the line, find Undo and reach it.
const UNDO_DURATION = 8000

// The admin pages and the card editor, on the locale-stripped path.
function isEditorPath(pathname: string): boolean {
  return /^\/admin(\/|$)/.test(pathname) || /^\/card\/[^/]+\/edit$/.test(pathname)
}

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
//
// Toasts sit top-centre, pushed below the header: at the very top they covered
// the header search; the bottom of a phone is where the deck builder docks its
// sheet handle, and a corner went unnoticed. richColors follows the route:
// admin and editor toasts keep sonner's stock look, and the brand style in
// globals.css applies wherever data-rich-colors is not "true". A new editor
// route outside /admin needs adding to isEditorPath.
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

  const pathname = usePathname()

  return (
    <Sonner
      theme={resolved}
      richColors={isEditorPath(pathname)}
      icons={TOAST_ICONS}
      position="top-center"
      offset={HEADER_OFFSET}
      mobileOffset={HEADER_OFFSET}
      {...props}
    />
  )
}

// Confirms that something is gone: a plain toast in the quiet removed style
// (toast-removed in globals.css), never a success, whose gold star would
// celebrate a loss. Every deletion goes through here; one that can be taken
// back passes its Undo as `action`.
export function toastRemoved(title: string, options: Pick<ExternalToast, 'description' | 'action'> = {}) {
  return toast(title, {
    ...options,
    ...(options.action && { duration: UNDO_DURATION }),
    icon: REMOVED_ICON,
    className: 'toast-removed',
  })
}
