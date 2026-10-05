import 'server-only'
import { RateLimiterMemory } from 'rate-limiter-flexible'

// Layered anti-spam, tier 3: a per-IP sliding budget. In-memory only — suits the
// single-node VPS deploy. Documented limitation: state resets on restart and is
// not shared across instances (acceptable now; revisit if scaled out). Chosen over
// an external captcha to avoid adding a third-party subprocessor / privacy entry.
export const CONTACT_RATE = { points: 5, duration: 3600 } as const

const limiter = new RateLimiterMemory({
  points: CONTACT_RATE.points,
  duration: CONTACT_RATE.duration,
})

/** True if the request is within budget; false once the per-IP window is spent. */
export async function consumeContactRateLimit(ip: string): Promise<boolean> {
  try {
    await limiter.consume(ip)
    return true
  } catch {
    // rate-limiter-flexible rejects with a RateLimiterRes when the budget is spent.
    return false
  }
}

// The PNG export's per-IP budget. Each render is a bounded but real CPU cost on
// the render service, and the route is reachable without a session because a
// public deck's overview offers the export to anyone. Ten a minute is far above
// any human clicking Export and far below anything worth queueing.
export const SHEET_RATE = { points: 10, duration: 60 } as const

const sheetLimiter = new RateLimiterMemory({
  points: SHEET_RATE.points,
  duration: SHEET_RATE.duration,
})

/** True if the request is within budget; false once the per-IP window is spent. */
export async function consumeSheetRateLimit(ip: string): Promise<boolean> {
  try {
    await sheetLimiter.consume(ip)
    return true
  } catch {
    return false
  }
}

/**
 * The address a per-IP budget is counted against.
 *
 * The leftmost x-forwarded-for entry is CLIENT-CONTROLLED (a bot can send its own
 * header and rotate it to dodge the limit), so it is never trusted. Behind our
 * single reverse proxy the trustworthy value is x-real-ip (the proxy overwrites any
 * client-supplied one); failing that, the LAST x-forwarded-for entry is the hop our
 * proxy appended. Falls back to a constant so unknown-IP traffic still shares a bucket.
 */
export function clientIp(h: Headers): string {
  const realIp = h.get('x-real-ip')?.trim()
  if (realIp) return realIp
  const fwd = h.get('x-forwarded-for')
  if (fwd) {
    const parts = fwd.split(',')
    return parts[parts.length - 1].trim()
  }
  return 'unknown'
}
