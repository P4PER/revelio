import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { Pencil } from 'lucide-react'
import { Link } from '@/../i18n/navigation'
import { Button } from '@/components/ui/button'
import type { CardDetailDTO } from '@revelio/core'
import { imageKey, imageUrl, LESSONS } from '@revelio/core'
import { attrLabel } from '@/lib/attribute-labels'
import { pickLocalization } from '@/lib/card-view'
import { Badge } from '@/components/ui/badge'

// Sub-types have no i18n label group; humanize the slug (death_eater -> Death Eater).
const humanize = (code: string) =>
  code.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export function CardDetail({
  card, locale, imageBase, canEdit = false,
}: {
  card: CardDetailDTO
  locale: string
  imageBase: string
  canEdit?: boolean
}) {
  const t = useTranslations('card')
  const tEdit = useTranslations('edit')
  const { loc, isFallback } = pickLocalization(card, locale)
  if (!loc) return null
  const lessonColor = LESSONS.find((l) => l.code === card.lesson)?.color ?? undefined
  const rulingText = (r: { text: Record<string, string> }) =>
    r.text[locale] ?? r.text[card.defaultLanguage] ?? Object.values(r.text)[0] ?? ''

  return (
    <article className="mx-auto grid max-w-5xl gap-8 px-6 py-8 md:grid-cols-[minmax(0,340px)_1fr]">
      <div className="relative aspect-[5/7] overflow-hidden rounded-xl border border-border/60 bg-card">
        <Image
          src={imageUrl(imageBase, imageKey(card.id))}
          alt={loc.name}
          fill
          sizes="340px"
          className="object-cover"
          priority
        />
      </div>
      <div>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl font-semibold text-primary">{loc.name}</h1>
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

        {card.lesson && (
          <div className="mt-4">
            <Badge variant="outline" className="text-sm px-2.5 py-1" style={{ borderColor: lessonColor, color: lessonColor }}>
              {card.cost != null
                ? `${card.cost} ${attrLabel('lessons', card.lesson, locale)}`
                : attrLabel('lessons', card.lesson, locale)}
            </Badge>
          </div>
        )}

        {card.types.length > 0 && (
          <p className="mt-3 text-base">
            <span className="font-medium">
              {card.types.map((ty) => attrLabel('types', ty, locale)).join(', ')}
            </span>
            {card.subTypes.length > 0 && (
              <span className="text-sm text-muted-foreground">
                {' — '}
                {card.subTypes.map((st) => humanize(st)).join(', ')}
              </span>
            )}
          </p>
        )}

        {loc.text && <p className="mt-6 whitespace-pre-line leading-relaxed">{loc.text}</p>}
        {loc.adventure && (
          <dl className="mt-6 space-y-3">
            {(['effect', 'reward', 'toSolve'] as const).map((k) =>
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
          <p className="mt-4 border-l-2 border-border pl-4 italic text-muted-foreground">{loc.flavorText}</p>
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
              <dd>{card.legality}</dd>
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
