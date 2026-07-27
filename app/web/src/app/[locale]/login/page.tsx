import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { AuthForm } from '@/components/auth-form'

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

export default function LoginPage() {
  return <AuthForm mode="login" />
}
