'use client'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { setTheme } from '@/lib/theme-actions'
import type { ThemeChoice } from '@/lib/theme'

const CHOICES: ThemeChoice[] = ['system', 'light', 'dark']

export function AppearanceForm({ current }: { current: ThemeChoice }) {
  const t = useTranslations('settings.appearance')
  const [choice, setChoice] = useState<ThemeChoice>(current)
  const [, startTransition] = useTransition()

  function apply(next: string) {
    const value = next as ThemeChoice
    setChoice(value)
    // Mirror onto <html> first so the page repaints instantly; the cookie
    // write is what makes it survive a reload. Removing the attribute hands
    // control back to the prefers-color-scheme media query.
    if (value === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = value

    startTransition(async () => {
      const result = await setTheme(value)
      if (result.ok) toast.success(t('saved'))
      else toast.error(t('error'))
    })
  }

  return (
    <section>
      <h2 className="text-lg font-semibold">{t('title')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('lead')}</p>
      <RadioGroup
        value={choice}
        onValueChange={apply}
        aria-label={t('legend')}
        className="mt-6 gap-3"
      >
        {CHOICES.map((value) => (
          <div key={value} className="flex items-start gap-3 rounded-lg border p-3">
            <RadioGroupItem value={value} id={`theme-${value}`} className="mt-0.5" />
            <Label htmlFor={`theme-${value}`} className="flex flex-col items-start gap-0.5">
              <span className="font-medium">{t(value)}</span>
              <span className="text-sm font-normal text-muted-foreground">
                {t(`${value}Hint`)}
              </span>
            </Label>
          </div>
        ))}
      </RadioGroup>
    </section>
  )
}
