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
