'use client'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Copy, Download, FileJson, FileText, Image as ImageIcon } from 'lucide-react'
import { toJson, toText } from '@revelio/core'
import type { DeckDTO } from '@revelio/core'
import type { BuilderState } from '@/lib/deck-model'
import { renderDeckPng } from '@/lib/deck-png'
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
// pure toText/toJson — no server round-trip needed. PNG renders a deck sheet
// client-side onto a canvas (see deck-png.ts) and downloads the resulting blob.
export function DeckExportMenu({ state }: { state: BuilderState }) {
  const t = useTranslations('decks')

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

  async function exportPng() {
    try {
      const name = state.name.trim() || t('namePlaceholder')
      const blob = await renderDeckPng({ name, format: state.format }, state.entries)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${slugify(state.name)}.png`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error(t('export.pngError'))
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          {t('export.button')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex items-center gap-2">
          <FileText className="size-4" />
          {t('export.text')}
        </DropdownMenuLabel>
        <div className="flex gap-1 px-1.5 pb-1.5">
          <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => copy(buildText())}>
            <Copy />
            {t('export.copy')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => download(`${slugify(state.name)}.txt`, buildText(), 'text/plain')}
          >
            <Download />
            {t('export.download')}
          </Button>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-2">
          <FileJson className="size-4" />
          {t('export.json')}
        </DropdownMenuLabel>
        <div className="flex gap-1 px-1.5 pb-1.5">
          <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => copy(buildJson())}>
            <Copy />
            {t('export.copy')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => download(`${slugify(state.name)}.json`, buildJson(), 'application/json')}
          >
            <Download />
            {t('export.download')}
          </Button>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => exportPng()}>
          <ImageIcon />
          {t('export.png')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
