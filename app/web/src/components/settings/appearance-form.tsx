'use client'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { setTheme } from '@/lib/theme-actions'
import type { ThemeChoice } from '@/lib/theme'
import { ThemePreview } from './theme-preview'

const CHOICES: ThemeChoice[] = ['system', 'light', 'dark']

export function AppearanceForm({ current }: { current: ThemeChoice }) {
  const t = useTranslations('settings.appearance')
  const [choice, setChoice] = useState<ThemeChoice>(current)
  const [, startTransition] = useTransition()

  // Mirror onto <html> so the page repaints instantly; the cookie write is what
  // makes it survive a reload. Removing the attribute hands control back to the
  // prefers-color-scheme media query.
  function paint(value: ThemeChoice) {
    if (value === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = value
  }

  function apply(next: string) {
    const value = next as ThemeChoice
    const previous = choice
    setChoice(value)
    paint(value)

    startTransition(async () => {
      const result = await setTheme(value)
      if (result.ok) {
        toast.success(t('saved'))
        return
      }
      // The cookie was never written, so roll the optimistic paint back rather
      // than leaving a switched-looking page that reverts on the next load.
      setChoice(previous)
      paint(previous)
      toast.error(t('error'))
    })
  }

  return (
    <section aria-labelledby="s-appearance" className="rounded-xl border border-border bg-card p-5">
      <h2 id="s-appearance" className="text-lg font-semibold">{t('title')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('lead')}</p>
      <RadioGroup
        value={choice}
        onValueChange={apply}
        aria-label={t('legend')}
        className="mt-6 sm:grid-cols-3"
      >
        {/* The whole tile is the label, so the pointer and the click target
            cover the swatch rather than just the dot and its caption. */}
        {CHOICES.map((value) => (
          <Label
            key={value}
            htmlFor={`theme-${value}`}
            data-state={value === choice ? 'checked' : undefined}
            className="flex cursor-pointer flex-col items-stretch gap-2.5 rounded-xl border p-2.5 transition-colors hover:bg-(--hover-bg) data-[state=checked]:border-primary data-[state=checked]:ring-2 data-[state=checked]:ring-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
          >
            {/* The dot is hidden, not dropped: it stays the focusable radio, so
                arrow keys and the accessible name still work. The gold border
                carries the selection, and the focus ring moves to the tile as
                an outline - a ring here would fight the selected ring. */}
            <RadioGroupItem value={value} id={`theme-${value}`} className="sr-only" />
            <ThemePreview choice={value} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">{t(value)}</span>
              <span className="text-sm font-normal text-muted-foreground">
                {t(`${value}Hint`)}
              </span>
            </span>
          </Label>
        ))}
      </RadioGroup>
    </section>
  )
}
