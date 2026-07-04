import { notFound } from 'next/navigation'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/../i18n/navigation'
import { routing } from '@/../i18n/routing'
import { getSession } from '@/lib/session'
import { hasRequiredRole } from '@/lib/roles'
import { getDb } from '@/lib/db'
import { getCardById } from '@revelio/db'
import { LocalizationForm } from '@/components/localization-form'

export const dynamic = 'force-dynamic'

export default async function EditCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>
  searchParams: Promise<{ lang?: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const session = await getSession()
  if (!hasRequiredRole(session?.user?.role, 'editor')) notFound()

  const card = await getCardById(getDb(), id)
  if (!card) notFound()
  const t = await getTranslations('edit')

  const sp = await searchParams
  const lang = sp.lang && routing.locales.includes(sp.lang as (typeof routing.locales)[number]) ? sp.lang : locale
  const loc = card.localizations[lang]
  const initial = {
    name: loc?.name ?? '',
    text: loc?.text ?? '',
    flavorText: loc?.flavorText ?? '',
    status: (loc?.status === 'official' ? 'official' : 'machine') as 'machine' | 'official',
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-2 text-2xl font-semibold text-primary">{t('title')}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{card.name} · {id}</p>
      <nav className="mb-6 flex gap-2 text-sm">
        <span className="text-muted-foreground">{t('language')}:</span>
        {routing.locales.map((l) => (
          <Link
            key={l}
            href={`/card/${id}/edit?lang=${l}`}
            className={l === lang ? 'font-semibold underline' : 'text-muted-foreground underline'}
          >
            {l.toUpperCase()}
            {!card.localizations[l] ? ` (${t('addLanguage')})` : ''}
          </Link>
        ))}
      </nav>
      <LocalizationForm key={lang} cardId={id} lang={lang} initial={initial} />
    </main>
  )
}
