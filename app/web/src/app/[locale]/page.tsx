import { useTranslations } from 'next-intl'

export default function Home() {
  const t = useTranslations('home')
  return (
    <main className="mx-auto max-w-3xl px-6 py-24 text-center">
      <h1 className="font-sans text-5xl font-semibold text-primary">{t('title')}</h1>
      <p className="mt-4 text-lg text-muted-foreground">{t('tagline')}</p>
    </main>
  )
}
