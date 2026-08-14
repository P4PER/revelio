import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['en', 'de'],
  defaultLocale: 'en',
  // English (default) has clean, prefix-free URLs (/card/x); German is /de/card/x.
  localePrefix: 'as-needed',
  // Match the revelio. cookie prefix used by auth and the UI preferences.
  localeCookie: { name: 'revelio.locale' },
})
