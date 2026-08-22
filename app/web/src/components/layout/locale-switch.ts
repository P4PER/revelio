'use client'
import { usePathname, useRouter } from '@/../i18n/navigation'

// Autonyms: each language written in its own language (i18n best practice).
// Shared by LanguageSwitcher (desktop) and MobileNav (drawer).
export const LOCALE_NAMES: Record<string, string> = { en: 'English', de: 'Deutsch' }

// Returns a `switch(locale)` that changes the active locale while preserving the
// current path AND query string (e.g. /search?q=… keeps q). Reads the query in
// the handler via window.location so callers don't need a Suspense boundary
// (useSearchParams would force one on every page that renders the header).
export function useSwitchLocale() {
  const pathname = usePathname()
  const router = useRouter()
  return (locale: string) => {
    const search = typeof window === 'undefined' ? '' : window.location.search
    const query = Object.fromEntries(new URLSearchParams(search))
    router.replace({ pathname, query }, { locale })
  }
}
