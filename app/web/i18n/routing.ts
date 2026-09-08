import { defineRouting } from 'next-intl/routing'

// Matches the revelio. cookie prefix used by auth and the other UI preferences.
export const LOCALE_COOKIE = 'revelio.locale'

// next-intl defaults the locale cookie to a session cookie; a year keeps the
// choice across sessions, like revelio.theme does.
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export const routing = defineRouting({
  locales: ['en', 'de'],
  defaultLocale: 'en',
  // English (default) has clean, prefix-free URLs (/card/x); German is /de/card/x.
  localePrefix: 'as-needed',
  localeCookie: { name: LOCALE_COOKIE, maxAge: LOCALE_COOKIE_MAX_AGE },
})
