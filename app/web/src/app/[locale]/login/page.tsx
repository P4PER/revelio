import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { AuthCard } from '@/components/auth/auth-card'
import { safeRedirectPath } from '@/lib/redirect-path'
import { getAuthFanImages } from '@/lib/server/auth-fan'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth')
  // Publicly reachable but thin — no SEO value, keep out of the index.
  return { title: t('title'), robots: { index: false } }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Validated here, on the server, so an untrusted value never reaches the client.
  const [params, fanImages] = await Promise.all([searchParams, getAuthFanImages()])
  const redirectTo = safeRedirectPath(params.redirect)
  return <AuthCard mode="login" redirectTo={redirectTo} fanImages={fanImages} />
}
