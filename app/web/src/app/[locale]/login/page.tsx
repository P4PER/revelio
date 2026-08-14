import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { AuthCard } from '@/components/auth-card'
import { safeRedirectPath } from '@/lib/redirect-path'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
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
  const redirectTo = safeRedirectPath((await searchParams).redirect)
  return <AuthCard mode="login" redirectTo={redirectTo} />
}
