import { ArrowRight, BookText } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/../i18n/navigation'

/**
 * The reference tile. Deliberately not a command: a dashed border, a document
 * glyph and a sans-face title, so nobody reads it as something they can type.
 * It carries the card surface and spends its accent on the gold primary
 * rather than a blue wash, which stayed legible in neither theme. It spans the
 * section below the menu and the steps, the place a visitor lands once they
 * know what the bot does and want the detail.
 *
 * The whole tile is the one link; the gold call to action at its end is a
 * span styled as a button, so a keyboard user passes it in a single tab stop.
 * It sits beside the text from sm up and spans the tile under it on a phone:
 * it never wraps, so inside the text column it would overflow a narrow one.
 */
export function ReferenceTile({ href }: { href: string }) {
  const t = useTranslations('discord')
  return (
    <Link
      href={href}
      className="mt-12 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5 gap-y-4 rounded-2xl border border-dashed border-primary/50 bg-card p-6 transition-colors hover:border-solid hover:border-primary sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-8"
    >
      <span className="flex size-14 items-center justify-center rounded-xl bg-foreground/10">
        <BookText className="size-7 text-primary-ink" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-xl font-semibold text-foreground sm:text-2xl">{t('reference.title')}</span>
        <span className="text-sm leading-relaxed text-muted-foreground">{t('reference.description')}</span>
      </span>
      <span className="col-span-full inline-flex items-center gap-2 justify-self-start rounded-lg bg-primary px-4 py-2 font-semibold whitespace-nowrap text-primary-foreground sm:col-span-1">
        {t('reference.action')}
        <ArrowRight className="size-4" aria-hidden />
      </span>
    </Link>
  )
}
