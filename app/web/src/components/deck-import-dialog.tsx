'use client'
import { useId, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Upload } from 'lucide-react'
import { parseJson, parseText } from '@revelio/core'
import type { ParsedTextLine } from '@revelio/core'
import { getCardViewsAction, resolveImportNames } from '@/lib/deck-actions'
import { jsonToEntries, textLinesToEntries } from '@/lib/deck-import'
import type { BuilderState } from '@/lib/deck-model'
import { Button } from '@/components/ui/button'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

function lineLabel(l: ParsedTextLine): string {
  return `${l.quantity}x ${l.name}${l.setCode ? ` (${l.setCode})` : ''}`
}

// Returns the parsed JSON value only when it looks like a deck object (as
// opposed to a bare number/string/array that also happens to be valid JSON) —
// otherwise the caller falls back to the text format.
function tryParseJsonObject(text: string): unknown {
  try {
    const v: unknown = JSON.parse(text)
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : undefined
  } catch {
    return undefined
  }
}

// Import Sheet for the deck builder's command bar. Auto-detects JSON vs the
// plain-text list format, resolves card ids/names against the DB, and
// replaces the builder state on success. Unresolved/unparsed lines are always
// surfaced to the user (never silently dropped) so partial imports are visible.
export function DeckImportDialog({ state, onImport }: { state: BuilderState; onImport: (next: BuilderState) => void }) {
  const t = useTranslations('decks')
  const textareaId = useId()
  const fileId = useId()
  const [open, setOpen] = useState(false)
  const [raw, setRaw] = useState('')
  const [busy, setBusy] = useState(false)
  const [unresolved, setUnresolved] = useState<string[]>([])
  const [unparsed, setUnparsed] = useState<string[]>([])

  function reset() {
    setRaw('')
    setUnresolved([])
    setUnparsed([])
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setRaw(await file.text())
  }

  async function importJson(value: unknown) {
    let deck
    try {
      deck = parseJson(value)
    } catch {
      toast.error(t('import.invalidJson'))
      return
    }
    const ids = [
      ...(deck.character ? [deck.character] : []),
      ...deck.main.map((c) => c.cardId),
      ...deck.sideboard.map((c) => c.cardId),
    ]
    const views = await getCardViewsAction(ids)
    const { entries, missingIds } = jsonToEntries(deck, views)
    setUnresolved(missingIds)
    onImport({ name: deck.name, format: deck.format, visibility: state.visibility, entries })
    toast.success(t('import.success'))
    if (missingIds.length === 0) {
      setOpen(false)
      reset()
    }
  }

  async function importTextList(text: string) {
    const { lines, unparsed: badLines } = parseText(text)
    setUnparsed(badLines)
    if (lines.length === 0) {
      setUnresolved([])
      toast.error(t('import.noLines'))
      return
    }
    const resolved = await resolveImportNames(lines.map((l) => ({ name: l.name, setCode: l.setCode })))
    const ids = [...new Set(Object.values(resolved).filter((id): id is string => id !== null))]
    const views = await getCardViewsAction(ids)
    const { entries, unresolved: badLines2 } = textLinesToEntries(lines, resolved, views)
    setUnresolved(badLines2.map(lineLabel))
    onImport({ ...state, entries })
    toast.success(t('import.success'))
    if (badLines.length === 0 && badLines2.length === 0) {
      setOpen(false)
      reset()
    }
  }

  async function handleImport() {
    const text = raw.trim()
    if (!text) {
      toast.error(t('import.emptyInput'))
      return
    }
    setBusy(true)
    setUnresolved([])
    setUnparsed([])
    try {
      const asJson = tryParseJsonObject(text)
      if (asJson !== undefined) await importJson(asJson)
      else await importTextList(text)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          {t('import.button')}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t('import.title')}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={textareaId} className="text-xs font-medium text-muted-foreground">
              {t('import.pasteLabel')}
            </label>
            <AutoTextarea
              id={textareaId}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={t('import.pastePlaceholder')}
              className="max-h-64 font-mono text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t('import.fileLabel')}
            </span>
            <label
              htmlFor={fileId}
              className="group inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 bg-card px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-accent hover:bg-muted/50 hover:text-foreground focus-within:ring-2 focus-within:ring-ring"
            >
              <Upload className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{t('import.fileChoose')}</span>
              <input
                id={fileId}
                type="file"
                accept=".txt,.json,text/plain,application/json"
                onChange={handleFile}
                className="sr-only"
              />
            </label>
          </div>

          {unparsed.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs" role="alert">
              <p className="font-medium text-destructive">{t('import.unparsedTitle')}</p>
              <ul className="mt-1 list-disc pl-4">
                {unparsed.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          {unresolved.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs" role="alert">
              <p className="font-medium text-destructive">{t('import.unresolvedTitle')}</p>
              <ul className="mt-1 list-disc pl-4">
                {unresolved.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <SheetFooter>
          <Button type="button" disabled={busy} onClick={handleImport}>
            {t('import.submit')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
