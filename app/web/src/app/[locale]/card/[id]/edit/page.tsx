import { notFound } from 'next/navigation'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { Plus, ChevronLeft } from 'lucide-react'
import { Link } from '@/../i18n/navigation'
import { routing } from '@/../i18n/routing'
import { getSession } from '@/lib/session'
import { hasRequiredRole } from '@/lib/roles'
import { getDb } from '@/lib/db'
import { getCardById, listRulingSources } from '@revelio/db'
import { imageKey, imageUrl, effectiveImageLang } from '@revelio/core'
import { CardEditForm } from '@/components/card-edit-form'
import { ImageUploader } from '@/components/image-uploader'
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

  const db = getDb()
  const card = await getCardById(db, id)
  if (!card) notFound()
  const t = await getTranslations('edit')

  const sp = await searchParams
  const lang = sp.lang && routing.locales.includes(sp.lang as (typeof routing.locales)[number]) ? sp.lang : locale
  const loc = card.localizations[lang]
  const kind: 'adventure' | 'match' | null = card.types.includes('adventure')
    ? 'adventure'
    : card.types.includes('match')
      ? 'match'
      : null
  const initial = {
    name: loc?.name ?? '',
    text: loc?.text ?? '',
    flavorText: loc?.flavorText ?? '',
    status: (loc?.status === 'official' ? 'official' : 'machine') as 'machine' | 'official',
    adventure: {
      effect: loc?.adventure?.effect ?? '',
      reward: loc?.adventure?.reward ?? '',
      toSolve: loc?.adventure?.toSolve ?? '',
    },
    match: {
      prize: loc?.match?.prize ?? '',
      toWin: loc?.match?.toWin ?? '',
    },
  }
  const rulingRows = card.rulings.map((r) => ({
    id: r.id,
    date: r.date ?? '',
    source: r.source ?? '',
    text: r.text[lang] ?? '',
  }))
  const sources = await listRulingSources(db)

  const imgLang = effectiveImageLang((l) => !!card.localizations[l]?.imageFile, lang, card.defaultLanguage)
  const imageBase = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''
  const imageSrc = imgLang && imageBase ? imageUrl(imageBase, imageKey(id, imgLang, card.defaultLanguage)) : null
  const fallbackLang = imgLang && imgLang !== lang ? imgLang : null

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
      <ImageUploader key={`img-${lang}`} cardId={id} lang={lang} imageSrc={imageSrc} fallbackLang={fallbackLang} />
      <CardEditForm
        key={lang}
        cardId={id}
        lang={lang}
        locInitial={initial}
        kind={kind}
        rulingsInitial={rulingRows}
        sources={sources}
      />
    </main>
  )
}
