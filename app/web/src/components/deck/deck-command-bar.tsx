'use client'
import { useTranslations } from 'next-intl'
import type { DeckFormat } from '@revelio/core'
import type { BuilderState } from '@/lib/deck-model'
import { DeckFormatSwitch } from '@/components/deck/deck-format-switch'
import { DeckImportDialog } from '@/components/deck/deck-import-dialog'
import { DeckExportMenu } from '@/components/deck/deck-export-menu'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * The deck's name, format and the two transfer actions. Rendered once, inside
 * DeckSheet: on a phone it is the top of the sheet, and from md up the sheet is
 * display:contents so this becomes the row that spans the whole workbench.
 *
 * Below md it stacks - name on its own row, then format plus the two icon
 * buttons. It used to be a `grid-cols-[1fr_auto_auto]` squeezing all four
 * controls plus Save into a 322px box, which is what clipped the German name to
 * "Unbenanntes D" and pushed Export off the card's edge: an `auto` column let
 * the longest label decide the row. Inside the sheet the width is no longer
 * contested, so honest full-width rows are enough and no control has to yield.
 *
 * Presentational - DeckBuilder owns BuilderState and hands the pieces down.
 */
export function DeckCommandBar({
  state,
  onNameChange,
  onFormatChange,
  onImport,
  className,
}: {
  state: BuilderState
  onNameChange: (name: string) => void
  onFormatChange: (format: DeckFormat) => void
  onImport: (next: BuilderState) => void
  className?: string
}) {
  const t = useTranslations('decks')

  return (
    <div
      className={cn(
        'flex shrink-0 flex-col gap-2 border-b border-border/60 bg-card/60 px-4 py-3',
        'md:flex-row md:flex-wrap md:items-center md:gap-3',
        className,
      )}
    >
      <Input
        value={state.name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder={t('namePlaceholder')}
        aria-label={t('namePlaceholder')}
        className="h-9 w-full max-w-full min-w-0 rounded-md px-3 text-lg font-semibold shadow-none md:w-[40rem] md:text-lg"
      />
      <div className="hidden flex-1 md:block" />
      {/* md:contents dissolves this row from md up, so the switch and the two
          buttons land directly in the bar's own flex row - the one-row desktop
          bar, unchanged. */}
      <div className="flex items-center gap-2 md:contents">
        <DeckFormatSwitch value={state.format} onChange={onFormatChange} />
        <span className="flex-1 md:hidden" aria-hidden />
        <DeckImportDialog state={state} onImport={onImport} />
        <DeckExportMenu state={state} variant="outline" compactLabel />
      </div>
    </div>
  )
}
