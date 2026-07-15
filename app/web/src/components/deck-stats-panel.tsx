'use client'
import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { LESSONS } from '@revelio/core'
import type { DeckCardView } from '@revelio/core'
import { attrLabel } from '@/lib/attribute-labels'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LessonCurve } from '@/components/lesson-curve'

// The deck's stats block that sits above the card list: a collapsible box with
// Curve / Lessons / Numbers tabs, pinned to a fixed content height so switching
// tabs never shifts the list below. Hiding it hands the vertical space back to
// the card list. Takes the full entry list and derives everything it shows.
export function DeckStatsPanel({ entries }: { entries: DeckCardView[] }) {
  const t = useTranslations('decks')
  const locale = useLocale()
  const [open, setOpen] = useState(true)

  const mainEntries = entries.filter((e) => e.zone === 'main')
  const unique = new Set(mainEntries.map((e) => e.cardId)).size
  const lessonCards = mainEntries.filter((e) => e.isLesson).reduce((n, e) => n + e.quantity, 0)

  const spellEntries = mainEntries.filter((e) => e.cost != null && !e.isLesson)
  const spellQty = spellEntries.reduce((n, e) => n + e.quantity, 0)
  const avgCost = spellQty
    ? (spellEntries.reduce((s, e) => s + (e.cost as number) * e.quantity, 0) / spellQty).toFixed(1)
    : '0.0'

  // "Damage sources" = total copies of cards that deal damage; "avg. damage" is
  // the quantity-weighted mean damage across just those cards.
  const damageEntries = mainEntries.filter((e) => e.damage != null && e.damage > 0)
  const damageSources = damageEntries.reduce((n, e) => n + e.quantity, 0)
  const avgDamage = damageSources
    ? (damageEntries.reduce((s, e) => s + (e.damage as number) * e.quantity, 0) / damageSources).toFixed(1)
    : '0.0'

  const lessonRows = LESSONS.map((l) => ({
    code: l.code,
    color: l.color,
    count: mainEntries.filter((e) => e.lesson === l.code).reduce((n, e) => n + e.quantity, 0),
  }))
  const lessonMax = Math.max(1, ...lessonRows.map((l) => l.count))

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('stats.show')}
        className="flex w-full cursor-pointer items-center gap-2 border-b border-border/60 px-4 py-2.5 text-xs font-semibold tracking-widest text-foreground/80 uppercase transition-colors hover:text-foreground"
      >
        {t('stats.title')}
        <ChevronDown className="ml-auto size-4 opacity-70" />
      </button>
    )
  }

  return (
    <Tabs defaultValue="curve" className="gap-0 border-b border-border/60">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2.5">
        <TabsList>
          <TabsTrigger value="curve">{t('stats.curve')}</TabsTrigger>
          <TabsTrigger value="lessons">{t('stats.lessons')}</TabsTrigger>
          <TabsTrigger value="overview">{t('stats.overview')}</TabsTrigger>
        </TabsList>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t('stats.hide')}
          className="ml-auto grid size-7 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <ChevronUp className="size-4" />
        </button>
      </div>

      <div className="h-36 px-4 pb-3">
        <TabsContent value="curve" className="flex h-full flex-col justify-center">
          <LessonCurve entries={mainEntries} />
        </TabsContent>

        <TabsContent value="lessons" className="flex h-full flex-col justify-center gap-1.5">
          {lessonRows.map((l) => (
            <div key={l.code} className="flex items-center gap-2">
              <span className="w-24 truncate text-xs text-foreground">{attrLabel('lessons', l.code, locale)}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.round((l.count / lessonMax) * 100)}%`, backgroundColor: l.color }}
                />
              </div>
              <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">{l.count}</span>
            </div>
          ))}
          <p className="mt-0.5 text-[0.65rem] text-muted-foreground">{t('stats.lessonCards', { count: lessonCards })}</p>
        </TabsContent>

        <TabsContent value="overview" className="grid h-full grid-cols-2 content-center gap-2">
          <Stat label={t('stats.unique')} value={unique} />
          <Stat label={t('stats.avgCost')} value={avgCost} />
          <Stat label={t('stats.avgDamage')} value={avgDamage} />
          <Stat label={t('stats.damageSources')} value={damageSources} />
        </TabsContent>
      </div>
    </Tabs>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-input bg-card/50 px-2.5 py-1.5">
      <div className="text-[0.6rem] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="text-base font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  )
}
