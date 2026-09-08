import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from '@/../i18n/routing'
import proxy from '@/proxy'

// The locale cookie must only follow real navigations. Next.js' router issues
// background RSC requests (prefetches, revalidations) for routes of the locale
// the user just left; letting those rewrite the cookie would undo the switch
// and bounce the user back on the next reload. Next.js strips its own router
// headers before the proxy runs, so `Sec-Fetch-Dest` is what distinguishes a
// background request from a document navigation.
function requestFor(pathname: string, headers: Record<string, string>) {
  return new NextRequest(new URL(`https://revelio.cards${pathname}`), { headers })
}

describe('proxy locale cookie', () => {
  it('does not rewrite the cookie for background router requests', () => {
    const response = proxy(
      requestFor('/de/sets', {
        cookie: `${LOCALE_COOKIE}=en`,
        'sec-fetch-dest': 'empty',
      }),
    )
    expect(response.cookies.get(LOCALE_COOKIE)).toBeUndefined()
  })

  it('persists the locale for a document navigation', () => {
    const response = proxy(
      requestFor('/de/sets', {
        cookie: `${LOCALE_COOKIE}=en`,
        'sec-fetch-dest': 'document',
      }),
    )
    const cookie = response.cookies.get(LOCALE_COOKIE)
    expect(cookie?.value).toBe('de')
    expect(cookie?.maxAge).toBe(LOCALE_COOKIE_MAX_AGE)
  })
})
