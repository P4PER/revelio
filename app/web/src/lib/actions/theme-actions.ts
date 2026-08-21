'use server'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { THEME_COOKIE } from '@/lib/theme'

const schema = z.enum(['system', 'light', 'dark'])

export type SetThemeResult = { ok: true } | { ok: false; error: string }

// The cookie is deliberately readable by JS (httpOnly: false): it is a display
// preference, not a credential, and the form mirrors it onto <html> for instant
// feedback. A year keeps the choice across sessions.
export async function setTheme(choice: unknown): Promise<SetThemeResult> {
  const parsed = schema.safeParse(choice)
  if (!parsed.success) return { ok: false, error: 'invalid_theme' }

  const store = await cookies()
  if (parsed.data === 'system') {
    store.delete(THEME_COOKIE)
  } else {
    store.set(THEME_COOKIE, parsed.data, {
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 365,
    })
  }
  return { ok: true }
}
