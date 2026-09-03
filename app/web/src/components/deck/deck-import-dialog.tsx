'use client'
import { Fragment, useId, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ClipboardPaste, Upload } from 'lucide-react'
import { parseJson, parseText } from '@revelio/core'
import type { ParsedTextLine } from '@revelio/core'
import { getCardViewsAction, resolveImportNames } from '@/lib/actions/deck-actions'
import { jsonToEntries, textLinesToEntries } from '@/lib/deck-import'
import type { BuilderState } from '@/lib/deck-model'
import { Button } from '@/components/ui/button'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { FieldError } from '@/components/ui/field-error'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

function lineLabel(l: ParsedTextLine): string {
  const ref = l.setCode ? ` (${l.setCode}${l.number ? ` ${l.number}` : ''})` : ''
  return `${l.quantity}x ${l.name}${ref}`
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

// The example deck list, held as tokens rather than one string so the sample can
// show which part of a line the parser cares about. Headings are load-bearing:
// they are the only thing that assigns a zone, and without "// Character" a bare
// character line has no quantity and is rejected outright. Only the (SET NUMBER)
// is truly optional.
// Deliberately not translated - parseText only recognises the English headings,
// so a localised sample would not import. Card references are real rows from
// card-data, so pasting the sample verbatim actually resolves.
type ExampleLine =
  | { kind: 'blank' }
  | { kind: 'heading'; text: string }
  | { kind: 'card'; quantity?: string; name: string; ref: string }

const EXAMPLE_LINES: ExampleLine[] = [
  { kind: 'heading', text: '// Character' },
  { kind: 'card', name: 'Harry Potter', ref: '(BS 8)' },
  { kind: 'blank' },
  { kind: 'heading', text: '// Main deck' },
  { kind: 'card', quantity: '4x', name: 'Accio', ref: '(BS 73)' },
  { kind: 'card', quantity: '2x', name: 'Nimbus Two Thousand', ref: '(QC 16)' },
  { kind: 'blank' },
  { kind: 'heading', text: '// Sideboard' },
  { kind: 'card', quantity: '3x', name: 'Lumos!', ref: '(POA 71)' },
]

// The plain text the rendered sample spells out. Exported so a test can feed it
// back through parseText and catch the sample drifting away from the format.
export const EXAMPLE_LIST = EXAMPLE_LINES.map((line) =>
  line.kind === 'blank'
    ? ''
    : line.kind === 'heading'
      ? line.text
      : [line.quantity, line.name, line.ref].filter(Boolean).join(' '),
).join('\n')

// Import Sheet for the deck builder's command bar. Auto-detects JSON vs the
// plain-text list format, resolves card ids/names against the DB, and
// replaces the builder state on success. Unresolved/unparsed lines are always
// surfaced to the user (never silently dropped) so partial imports are visible.
export function DeckImportDialog({ state, onImport }: { state: BuilderState; onImport: (next: BuilderState) => void }) {
  const t = useTranslations('decks')
  const textareaId = useId()
  const fileId = useId()
  const errorId = useId()
  const [open, setOpen] = useState(false)
  const [raw, setRaw] = useState('')
  const [busy, setBusy] = useState(false)
  const [unresolved, setUnresolved] = useState<string[]>([])
  const [unparsed, setUnparsed] = useState<string[]>([])
  const [inputError, setInputError] = useState('')

  function reset() {
    setRaw('')
    setUnresolved([])
    setUnparsed([])
    setInputError('')
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  // Every path that rewrites the box clears the error with it: the message and
  // the aria-invalid it drives describe the text that was submitted, so leaving
  // them up once that text is gone marks valid input as invalid.
  function updateRaw(value: string) {
    setRaw(value)
    setInputError('')
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    updateRaw(await file.text())
  }

  async function importJson(value: unknown) {
    let deck
    try {
      deck = parseJson(value)
    } catch {
      setInputError(t('import.invalidJson'))
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
      setInputError(t('import.noLines'))
      return
    }
    const resolved = await resolveImportNames(lines.map((l) => ({ name: l.name, setCode: l.setCode, number: l.number })))
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
    setInputError('')
    const text = raw.trim()
    if (!text) {
      setInputError(t('import.emptyInput'))
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
        {/* Label folds away below sm, where this shares a row with the format
            switch and Export. aria-label carries the name either way. */}
        <Button type="button" variant="outline" size="sm" aria-label={t('import.button')}>
          <ClipboardPaste className="size-4" />
          <span className="max-sm:hidden">{t('import.button')}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t('import.title')}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={textareaId} className="text-sm font-medium text-muted-foreground">
              {t('import.pasteLabel')}
            </label>
            {/*
              Every failure describes this box: choosing a file loads its text in
              here rather than importing separately, so there is one field to point
              at. aria-invalid also lights the destructive border AutoTextarea
              already styles for.
            */}
            <AutoTextarea
              id={textareaId}
              value={raw}
              onChange={(e) => updateRaw(e.target.value)}
              placeholder={t('import.pastePlaceholder')}
              className="max-h-96 min-h-40 font-mono"
              aria-invalid={inputError ? true : undefined}
              aria-describedby={inputError ? errorId : undefined}
            />
            <FieldError id={errorId}>{inputError}</FieldError>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted-foreground">
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

          <Separator className="my-1" />

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted-foreground">{t('import.exampleLabel')}</span>
            {/*
              Weight and colour track what the parser needs. Headings are not
              decoration: they are the only thing that assigns a zone, so they carry
              the brand ink rather than being dimmed. Quantity and name are required.
              The (SET NUMBER) is the one genuinely optional token, so it is the one
              that recedes. The ink is brightened on dark, where the flat token sits
              at 3.8:1 against the card - short of AA for 12px text.
            */}
            <pre className="overflow-x-auto rounded-md border border-input bg-card/60 px-3 py-2.5 font-mono text-sm leading-relaxed">
              {EXAMPLE_LINES.map((line, i) => (
                <Fragment key={i}>
                  {i > 0 && '\n'}
                  {line.kind === 'heading' && (
                    <span className="font-medium text-secondary-ink dark:text-[color-mix(in_srgb,var(--secondary-ink)_60%,var(--foreground))]">
                      {line.text}
                    </span>
                  )}
                  {line.kind === 'card' && (
                    <span className="text-foreground">
                      {line.quantity && <span className="font-semibold">{line.quantity} </span>}
                      {line.name} <span className="text-muted-foreground">{line.ref}</span>
                    </span>
                  )}
                </Fragment>
              ))}
            </pre>
            <p className="text-sm text-muted-foreground">{t('import.exampleHint')}</p>
          </div>

          {unparsed.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-sm" role="alert">
              <p className="font-medium text-destructive">{t('import.unparsedTitle')}</p>
              <ul className="mt-1 list-disc pl-4">
                {unparsed.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          {unresolved.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-sm" role="alert">
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
