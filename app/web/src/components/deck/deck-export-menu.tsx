'use client'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Copy, Download, FileBraces, FileText, Image as ImageIcon, Upload } from 'lucide-react'
import { toJson, toText } from '@revelio/core'
import type { DeckDTO } from '@revelio/core'
import type { BuilderState } from '@/lib/deck-model'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

function slugify(name: string): string {
  const s = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return s || 'deck'
}

function download(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Export menu for the deck builder's command bar. Text/JSON each build their
// serialized form from the current (unsaved) builder state via @revelio/core's
// pure toText/toJson — no server round-trip needed. PNG is drawn server-side by
// @revelio/sheet, through /api/deck-sheet, and downloaded as the blob it returns.
export function DeckExportMenu({
  state,
  align = 'end',
  variant = 'ghost',
  size = 'sm',
  compactLabel = false,
}: {
  state: BuilderState
  align?: 'start' | 'end'
  variant?: 'ghost' | 'outline'
  size?: 'sm' | 'default'
  compactLabel?: boolean
}) {
  const t = useTranslations('decks')
  const locale = useLocale()

  function buildText(): string {
    const name = state.name.trim() || t('namePlaceholder')
    return toText({ name, format: state.format }, state.entries)
  }

  function buildJson(): string {
    const dto: DeckDTO = {
      id: '',
      name: state.name.trim() || t('namePlaceholder'),
      format: state.format,
      visibility: state.visibility,
      cards: state.entries.map((e) => ({ cardId: e.cardId, zone: e.zone, quantity: e.quantity })),
      createdAt: '',
      updatedAt: '',
    }
    return JSON.stringify(toJson(dto), null, 2)
  }

  async function copy(content: string) {
    try {
      await navigator.clipboard.writeText(content)
      toast.success(t('export.copied'))
    } catch {
      toast.error(t('export.copyError'))
    }
  }

  // The sheet is drawn by @revelio/sheet, through this app's own route handler:
  // only card ids, zones and quantities go up, and the route resolves the names
  // and image versions the picture is painted from. The builder's unsaved state
  // works the same as a saved deck - the request carries the deck, not an id.
  async function exportPng() {
    const pending = toast.loading(t('export.pngPending'))
    try {
      const res = await fetch('/api/deck-sheet', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: state.name.trim() || t('namePlaceholder'),
          format: state.format,
          locale,
          cards: state.entries.map((e) => ({ cardId: e.cardId, zone: e.zone, quantity: e.quantity })),
        }),
      })
      if (!res.ok) throw new Error(`sheet route answered ${res.status}`)
      const blob = await res.blob()
      // The service answers WebP instead of PNG only when a byte ceiling forced
      // it to, which this path never sends - but name the file for what it is
      // rather than for what was asked for.
      const ext = blob.type === 'image/webp' ? 'webp' : 'png'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${slugify(state.name)}.${ext}`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error(t('export.pngError'))
    } finally {
      toast.dismiss(pending)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* compactLabel folds the label away below sm, leaving the icon, and
            aria-label carries the name - see DeckImportDialog. Opt-in, and only
            the builder's command bar opts in: the deck overview sits this menu
            in a row of labelled buttons, which it has to match. */}
        <Button
          type="button"
          variant={variant}
          size={size}
          aria-label={compactLabel ? t('export.button') : undefined}
        >
          {variant === 'outline' && <Upload className="size-4" />}
          <span className={cn(compactLabel && 'max-sm:hidden')}>{t('export.button')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-fit min-w-56">
        <DropdownMenuLabel className="flex items-center gap-2">
          <FileText className="size-4" />
          {t('export.text')}
        </DropdownMenuLabel>
        <div className="grid grid-cols-2 gap-1 px-1.5 pb-1.5">
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => copy(buildText())}>
            <Copy />
            {t('export.copy')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => download(`${slugify(state.name)}.txt`, buildText(), 'text/plain')}
          >
            <Download />
            {t('export.download')}
          </Button>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-2">
          <FileBraces className="size-4" />
          {t('export.json')}
        </DropdownMenuLabel>
        <div className="grid grid-cols-2 gap-1 px-1.5 pb-1.5">
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => copy(buildJson())}>
            <Copy />
            {t('export.copy')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => download(`${slugify(state.name)}.json`, buildJson(), 'application/json')}
          >
            <Download />
            {t('export.download')}
          </Button>
        </div>
        <DropdownMenuSeparator />
        {/* The service draws a deck, not a title card: it refuses an empty one,
            so offering the item would only ever answer with the error toast. */}
        <DropdownMenuItem disabled={state.entries.length === 0} onSelect={() => exportPng()}>
          <ImageIcon />
          {t('export.png')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
