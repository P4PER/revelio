'use client'
import { useState } from 'react'
import { useLocale } from 'next-intl'
import { Calendar as CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// Parse/format a YYYY-MM-DD string via LOCAL calendar fields — never via
// `new Date(isoString)`, which parses as UTC midnight and can render/round-trip
// as the previous day in negative-offset timezones.
export function parseYMD(s: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return undefined
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) // local midnight — no tz shift
}

export function toYMD(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` // reads LOCAL fields
}

export function DatePicker({
  value,
  onChange,
  id,
  ariaLabel,
  placeholder,
}: {
  value: string
  onChange: (next: string) => void
  id?: string
  ariaLabel?: string
  placeholder?: string
}) {
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const date = parseYMD(value)
  const label = date
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
    : ''

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label={ariaLabel}
          className={cn('h-9 w-full justify-start gap-2 font-normal', !date && 'text-muted-foreground')}
        >
          <CalendarIcon className="size-4 opacity-70" />
          {label || placeholder || ''}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          startMonth={new Date(1990, 0)}
          endMonth={new Date(new Date().getFullYear() + 1, 11)}
          selected={date}
          defaultMonth={date}
          onSelect={(d) => {
            onChange(d ? toYMD(d) : '')
            setOpen(false)
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
