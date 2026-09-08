import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import proxy from '@/proxy'

// The locale cookie must only follow real navigations. Next.js' router issues
// background RSC requests (prefetches, revalidations) for routes of the locale
// the user just left; letting those rewrite the cookie would undo the switch
// and bounce the user back on the next reload.
function requestFor(pathname: string, headers: Record<string, string>) {
  return new NextRequest(new URL(`https://revelio.cards${pathname}`), { headers })
}

const LOCALE_COOKIE = 'revelio.locale'

describe('proxy locale cookie', () => {
  it('does not rewrite the cookie for background router requests', () => {
    const response = proxy(
      requestFor('/de/sets', {
        cookie: `${LOCALE_COOKIE}=en`,
        // Next.js strips its own router headers before the proxy runs, so a
        // background request is recognised by `Sec-Fetch-Dest`.
        'sec-fetch-dest': 'empty',
        rsc: '1',
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
    expect(response.cookies.get(LOCALE_COOKIE)?.value).toBe('de')
  })
})
