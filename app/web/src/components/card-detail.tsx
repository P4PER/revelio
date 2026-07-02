import Image from 'next/image'
import { useTranslations } from 'next-intl'
import type { CardDetailDTO } from '@revelio/core'
import { imageKey, imageUrl, LESSONS } from '@revelio/core'
import { attrLabel } from '@/lib/attribute-labels'
import { pickLocalization } from '@/lib/card-view'

// Sub-types have no i18n label group; humanize the slug (death_eater -> Death Eater).
const humanize = (code: string) =>
  code.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export function CardDetail({
  card, locale, imageBase,
}: {
  card: CardDetailDTO
  locale: string
  imageBase: string
}) {
  const t = useTranslations('card')
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
        <h1 className="text-3xl font-semibold text-primary">{loc.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {card.set.name} · {t('number', { number: card.number })}
          {card.rarity ? ` · ${attrLabel('rarities', card.rarity, locale)}` : ''}
        </p>

        {loc.status === 'machine' && (
          <p data-testid="machine-badge" className="mt-3 inline-flex items-center justify-center rounded-full border border-accent/50 bg-accent/10 px-3 py-1 text-xs text-accent">
            {t('machineTranslation')}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {card.lesson && (
            <span className="inline-flex items-center justify-center rounded-full border px-3 py-1" style={{ borderColor: lessonColor, color: lessonColor }}>
              {attrLabel('lessons', card.lesson, locale)}
            </span>
          )}
          {card.types.map((ty) => (
            <span key={ty} className="inline-flex items-center justify-center rounded-full border border-border px-3 py-1 text-muted-foreground">
              {attrLabel('types', ty, locale)}
            </span>
          ))}
          {card.subTypes.map((st) => (
            <span key={st} className="inline-flex items-center justify-center rounded-full border border-border/50 px-3 py-1 text-xs text-muted-foreground">
              {humanize(st)}
            </span>
          ))}
          {card.cost != null && (
            <span className="inline-flex items-center justify-center rounded-full border border-border px-3 py-1 text-muted-foreground">
              {t('cost', { cost: card.cost })}
            </span>
          )}
        </div>

        {loc.text && <p className="mt-6 whitespace-pre-line leading-relaxed">{loc.text}</p>}
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
