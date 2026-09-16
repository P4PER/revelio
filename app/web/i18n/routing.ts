import { defineRouting } from 'next-intl/routing'

// Matches the revelio. cookie prefix used by auth and the other UI preferences.
export const LOCALE_COOKIE = 'revelio.locale'

// next-intl defaults the locale cookie to a session cookie; a year keeps the
// choice across sessions, like revelio.theme does.
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

// The one zone every date is formatted in, on the server and in the browser.
// Without it next-intl falls back to the server's own zone, so the same page
// could print a different day per host. Calendar days (the terms effective
// date, the privacy policy date, a ban's end) are stored at UTC midnight;
// Europe/Berlin, the operator's zone, is always ahead of UTC, so they print as
// the same day.
export const TIME_ZONE = 'Europe/Berlin'

export const routing = defineRouting({
  locales: ['en', 'de'],
  defaultLocale: 'en',
  // English (default) has clean, prefix-free URLs (/card/x); German is /de/card/x.
  localePrefix: 'as-needed',
  localeCookie: { name: LOCALE_COOKIE, maxAge: LOCALE_COOKIE_MAX_AGE },
})
