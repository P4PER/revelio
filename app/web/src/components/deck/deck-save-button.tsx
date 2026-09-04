'use client'
import { useTranslations } from 'next-intl'
import { Link } from '@/../i18n/navigation'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Save deck, or Log in to save for a guest. The builder renders this twice and
 * lets CSS pick: `hidden md:inline-flex` in the command bar, which is where the
 * action belongs on the workbench, and `w-full md:hidden` at the foot of the
 * mobile sheet, next to the deck it commits.
 *
 * Two elements rather than one, because the two live in different parents and
 * no amount of grid placement moves a node between them. Only ever one of them
 * is perceivable - display:none takes the other out of the accessibility tree
 * and the tab order both - so this stays one control from the reader's side.
 * They share this component so the logged-in branch cannot drift between them.
 *
 * The mobile copy is full width on purpose: "Zum Speichern anmelden" is the
 * longest string in the builder, and a full-width button is the shape where its
 * length costs nothing.
 */
export function DeckSaveButton({
  loggedIn,
  saving,
  onSave,
  className,
  size,
}: {
  loggedIn: boolean
  saving: boolean
  onSave: () => void
  className?: string
  size?: 'sm'
}) {
  const t = useTranslations('decks')

  if (!loggedIn) {
    return (
      <Button type="button" size={size} variant="outline" asChild className={cn('shrink-0', className)}>
        <Link href="/login">{t('loginToSave')}</Link>
      </Button>
    )
  }

  return (
    <Button
      type="button"
      size={size}
      disabled={saving}
      onClick={onSave}
      className={cn('shrink-0', className)}
    >
      {t('save')}
    </Button>
  )
}
