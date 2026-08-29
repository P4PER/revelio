// Cookie that persists the colour theme. Plain (non-'use client') module so a
// Server Component can import the literal string and read it - a 'use client'
// export becomes a client reference on the server, which silently breaks
// cookies().get(THEME_COOKIE).
export const THEME_COOKIE = 'revelio.theme'

// 'system' is represented by the ABSENCE of the cookie, so the CSS
// prefers-color-scheme fallback is the natural default.
export type ThemeChoice = 'system' | 'light' | 'dark'

export function parseTheme(value: string | undefined): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'system'
}
