import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { AuthCard } from '@/components/auth/auth-card'
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
  return { title: t('registerTitle'), robots: { index: false } }
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Validated here, on the server, so an untrusted value never reaches the client.
  const redirectTo = safeRedirectPath((await searchParams).redirect)
  return <AuthCard mode="register" redirectTo={redirectTo} />
}
