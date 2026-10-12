import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { AuthCard } from '@/components/auth/auth-card'
import { safeRedirectPath } from '@/lib/redirect-path'
import { getSession } from '@/lib/server/session'
import { redirect } from '@/../i18n/navigation'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth')
  // Publicly reachable but thin — no SEO value, keep out of the index.
  return { title: t('title'), robots: { index: false } }
}

export default async function LoginPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale } = await params
  // Validated here, on the server, so an untrusted value never reaches the client.
  const redirectTo = safeRedirectPath((await searchParams).redirect)
  // Already signed in: the form would only sign them in again, so send them on.
  if (await getSession()) redirect({ href: redirectTo ?? '/', locale })
  return <AuthCard mode="login" redirectTo={redirectTo} />
}
