import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['en', 'de'],
  defaultLocale: 'en',
  // English (default) has clean, prefix-free URLs (/card/x); German is /de/card/x.
  localePrefix: 'as-needed',
})
