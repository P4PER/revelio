import { useTranslations } from 'next-intl'
import { Pencil } from 'lucide-react'
import { Link } from '@/../i18n/navigation'
import { Button } from '@/components/ui/button'
import type { CardDetailDTO } from '@revelio/core'
import { effectiveImageLang, imageKey, imageUrl } from '@revelio/core'
import { CardImage } from '@/components/card-image'
import { attrLabel } from '@/lib/attribute-labels'
import { pickLocalization } from '@/lib/card-view'
import { Badge } from '@/components/ui/badge'
import { LessonCost } from '@/components/lesson-cost'
import { LightningDivider } from '@/components/lightning-divider'
import { humanize } from '@/lib/humanize'

export function CardDetail({
  card, locale, imageBase, canEdit = false, subTypeLabels = {},
}: {
  card: CardDetailDTO
  locale: string
  imageBase: string
  canEdit?: boolean
  subTypeLabels?: Record<string, string>
}) {
  const t = useTranslations('card')
  const tEdit = useTranslations('edit')
  const { loc, isFallback } = pickLocalization(card, locale)
  if (!loc) return null
  const rulingText = (r: { text: Record<string, string> }) =>
    r.text[locale] ?? r.text[card.defaultLanguage] ?? Object.values(r.text)[0] ?? ''
  const imgLang = effectiveImageLang(
    (l) => !!card.localizations[l]?.imageFile,
    locale,
    card.defaultLanguage,
  )

  return (
    <article className="mx-auto grid max-w-[76rem] gap-8 px-6 py-8 md:grid-cols-[minmax(0,340px)_1fr]">
      {imgLang ? (
        <CardImage
          src={imageUrl(imageBase, imageKey(card.id, imgLang, card.defaultLanguage))}
          alt={loc.name}
          orientation={card.orientation}
          upright
          sizes="340px"
          priority
          frameClassName="rounded-xl border border-border/60 bg-card"
        />
      ) : (
        <div className="relative flex aspect-[5/7] items-center justify-center rounded-xl border border-border/60 bg-card p-4 text-center text-sm text-muted-foreground">
          {loc.name}
        </div>
      )}
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold text-primary">{loc.name}</h1>
            {card.lesson && (
              <LessonCost
                lesson={card.lesson}
                cost={card.cost}
                label={attrLabel('lessons', card.lesson, locale)}
              />
            )}
          </div>
          {canEdit && (
            <Button asChild variant="outline" size="sm" className="shrink-0 gap-1.5">
              <Link href={`/card/${card.id}/edit`}>
                <Pencil className="size-3.5" />
                {tEdit('button')}
              </Link>
            </Button>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {card.set.name} · {t('number', { number: card.number })}
          {card.rarity ? ` · ${attrLabel('rarities', card.rarity, locale)}` : ''}
        </p>

        {loc.status === 'machine' && (
          <Badge data-testid="machine-badge" variant="secondary" className="mt-3">
            {t('machineTranslation')}
          </Badge>
        )}

        {card.types.length > 0 && (
          <p className="mt-3 text-base">
            <span className="font-medium">
              {card.types.map((ty) => attrLabel('types', ty, locale)).join(', ')}
            </span>
            {card.subTypes.length > 0 && (
              <span className="text-sm text-muted-foreground">
                {' — '}
                {card.subTypes.map((st) => subTypeLabels[st] ?? humanize(st)).join(', ')}
              </span>
            )}
          </p>
        )}

        {loc.text && <p className="mt-6 whitespace-pre-line leading-relaxed">{loc.text}</p>}
        {loc.adventure && (
          <dl className="mt-6 space-y-3">
            {(['effect', 'toSolve', 'reward'] as const).map((k) =>
              loc.adventure![k] ? (
                <div key={k}>
                  <dt className="text-sm font-semibold text-muted-foreground">{tEdit(k)}</dt>
                  <dd className="whitespace-pre-line leading-relaxed">{loc.adventure![k]}</dd>
                </div>
              ) : null,
            )}
          </dl>
        )}
        {loc.match && (
          <dl className="mt-6 space-y-3">
            {(['prize', 'toWin'] as const).map((k) =>
              loc.match![k] ? (
                <div key={k}>
                  <dt className="text-sm font-semibold text-muted-foreground">{tEdit(k)}</dt>
                  <dd className="whitespace-pre-line leading-relaxed">{loc.match![k]}</dd>
                </div>
              ) : null,
            )}
          </dl>
        )}
        {loc.flavorText && (
          <>
            <LightningDivider />
            <p className="whitespace-pre-line text-center italic text-muted-foreground">{loc.flavorText}</p>
          </>
        )}

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {card.health != null && (
            <>
              <dt className="text-muted-foreground">{t('health')}</dt>
              <dd>{card.health}</dd>
            </>
          )}
          {card.damagePerTurn != null && (
            <>
              <dt className="text-muted-foreground">{t('damage')}</dt>
              <dd>{card.damagePerTurn}</dd>
            </>
          )}
          {card.cost != null && !card.lesson && (
            <>
              <dt className="text-muted-foreground">{t('cost')}</dt>
              <dd>{card.cost}</dd>
            </>
          )}
          {card.legality && (
            <>
              <dt className="text-muted-foreground">{t('legality')}</dt>
              <dd>{attrLabel('legalities', card.legality, locale)}</dd>
            </>
          )}
          {card.artist.length > 0 && (
            <>
              <dt className="text-muted-foreground">{t('artist')}</dt>
              <dd>{card.artist.join(', ')}</dd>
            </>
          )}
        </dl>

        {card.rulings.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-semibold">{t('rulings')}</h2>
            <ul className="mt-2 space-y-2">
              {card.rulings.map((r) => (
                <li key={r.seq} className="text-sm">
                  <span className="text-muted-foreground">{r.date ? `${r.date} — ` : ''}</span>
                  {rulingText(r)}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </article>
  )
}
