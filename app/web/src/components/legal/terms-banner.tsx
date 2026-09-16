import { getSession } from '@/lib/server/session'
import { needsTermsAcceptance } from '@/lib/terms'
import { TermsBannerView } from './terms-banner-view'

/** Async server wrapper: shows the banner only to a signed-in account on a stale or missing version. */
export async function TermsBanner() {
  const session = await getSession()
  if (!session?.user || !needsTermsAcceptance(session.user.termsVersion)) return null
  return <TermsBannerView />
}
