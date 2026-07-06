'use client'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { Link } from '@/../i18n/navigation'
import type { SetDTO } from '@revelio/core'
import { SetSymbol } from '@/components/set-symbol'
import { formatReleaseMonth } from '@/lib/set-sort'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type SortKey = 'name' | 'code' | 'releaseDate' | 'cardCount'

function SortHeader({
  k,
  label,
  className,
  sortKey,
  dir,
  onSort,
}: {
  k: SortKey
  label: string
  className?: string
  sortKey: SortKey
  dir: 'asc' | 'desc'
  onSort: (k: SortKey) => void
}) {
  return (
    <th className={className}>
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => onSort(k)}
      >
        {label}
        {sortKey === k ? (
          dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
        ) : null}
      </button>
    </th>
  )
}

export function AdminSetsTable({ sets, imageBase }: { sets: SetDTO[]; imageBase: string }) {
  const t = useTranslations('admin')
  const [query, setQuery] = useState('')
  const [showOfficial, setShowOfficial] = useState(false)
  const [showFan, setShowFan] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('releaseDate')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')

  function toggleSort(key: SortKey) {
    if (key === sortKey) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setDir('asc')
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = sets
    if (q) {
      list = list.filter(
        (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q),
      )
    }
    if (showOfficial || showFan) {
      list = list.filter((s) => (showOfficial && s.isOfficial) || (showFan && !s.isOfficial))
    }
    return [...list].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'name':
          cmp = a.name.localeCompare(b.name)
          break
        case 'code':
          cmp = a.code.localeCompare(b.code)
          break
        case 'releaseDate':
          cmp = (a.releaseDate ?? '').localeCompare(b.releaseDate ?? '')
          break
        case 'cardCount':
          cmp = a.cardCount - b.cardCount
          break
      }
      return dir === 'asc' ? cmp : -cmp
    })
  }, [sets, query, showOfficial, showFan, sortKey, dir])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('sets.searchPlaceholder')}
            aria-label={t('sets.searchPlaceholder')}
            className="h-8 w-full pr-8"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t('clearSearch')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant={showOfficial ? 'secondary' : 'outline'}
          aria-pressed={showOfficial}
          onClick={() => setShowOfficial((v) => !v)}
        >
          {t('sets.official')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={showFan ? 'secondary' : 'outline'}
          aria-pressed={showFan}
          onClick={() => setShowFan((v) => !v)}
        >
          {t('sets.fan')}
        </Button>
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr className="text-left">
              <th className="w-10 px-3 py-2" />
              <SortHeader
                k="name"
                label={t('sets.name')}
                className="px-3 py-2 font-medium"
                sortKey={sortKey}
                dir={dir}
                onSort={toggleSort}
              />
              <SortHeader
                k="code"
                label={t('sets.code')}
                className="px-3 py-2 font-medium"
                sortKey={sortKey}
                dir={dir}
                onSort={toggleSort}
              />
              <SortHeader
                k="releaseDate"
                label={t('sets.releaseDate')}
                className="px-3 py-2 font-medium"
                sortKey={sortKey}
                dir={dir}
                onSort={toggleSort}
              />
              <SortHeader
                k="cardCount"
                label={t('sets.cardCount')}
                className="px-3 py-2 font-medium"
                sortKey={sortKey}
                dir={dir}
                onSort={toggleSort}
              />
              <th className="px-3 py-2 font-medium">{t('sets.official')}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => (
              <tr key={s.code} className="border-t hover:bg-muted/50">
                <td className="px-3 py-2">
                  <span className="flex h-6 w-6 items-center justify-center">
                    {s.symbol && imageBase ? (
                      <SetSymbol code={s.code} base={imageBase} className="h-5 w-5 text-foreground/80" />
                    ) : (
                      <span className="text-[10px] text-muted-foreground">{s.code}</span>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2 font-medium">
                  <Link href={`/admin/sets/${s.code}/edit`} className="hover:underline">
                    {s.name}
                  </Link>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{s.code}</td>
                <td className="px-3 py-2 text-muted-foreground">{formatReleaseMonth(s.releaseDate)}</td>
                <td className="px-3 py-2 text-muted-foreground">{s.cardCount}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {s.isOfficial ? t('sets.official') : t('sets.fan')}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  {t('noResults')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
