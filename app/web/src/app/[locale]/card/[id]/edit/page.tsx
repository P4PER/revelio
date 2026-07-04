import { notFound } from 'next/navigation'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { Plus, ChevronLeft } from 'lucide-react'
import { Link } from '@/../i18n/navigation'
import { routing } from '@/../i18n/routing'
import { getSession } from '@/lib/session'
import { hasRequiredRole } from '@/lib/roles'
import { getDb } from '@/lib/db'
import { getCardById } from '@revelio/db'
import { LocalizationForm } from '@/components/localization-form'
import { Button } from '@/components/ui/button'

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
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link
          href={`/card/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          {t('back')}
        </Link>
        <div
          role="group"
          aria-label={t('language')}
          className="inline-flex gap-1 rounded-md border p-1"
        >
          {routing.locales.map((l) => (
            <Button
              key={l}
              asChild
              size="sm"
              variant={l === lang ? 'secondary' : 'ghost'}
              className="h-7 gap-1.5"
            >
              <Link
                href={`/card/${id}/edit?lang=${l}`}
                title={!card.localizations[l] ? t('addLanguage') : undefined}
              >
                {l.toUpperCase()}
                {!card.localizations[l] && <Plus className="size-3 opacity-60" />}
              </Link>
            </Button>
          ))}
        </div>
      </div>
      <h1 className="text-2xl font-semibold text-primary">{t('title')}</h1>
      <p className="mb-8 text-sm text-muted-foreground">{card.name} · {id}</p>
      <LocalizationForm key={lang} cardId={id} lang={lang} initial={initial} />
    </main>
  )
}
