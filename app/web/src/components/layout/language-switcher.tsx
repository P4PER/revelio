'use client'
import { useRef } from 'react'
import { useLocale } from 'next-intl'
import { Globe } from 'lucide-react'
import { routing } from '@/../i18n/routing'
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select'
import { LOCALE_NAMES, useSwitchLocale } from '@/components/layout/locale-switch'

export function LanguageSwitcher() {
  const locale = useLocale()
  const switchLocale = useSwitchLocale()
  // Radix hands focus back to the trigger on close, and because focus was
  // inside the list the browser keeps :focus-visible on it, so a mouse close
  // left the ring lit. Skip that hand-back only when a pointer closed the list:
  // a keyboard close (Escape, Enter) must still land on the trigger.
  const closedByPointer = useRef(false)
  return (
    <Select value={locale} onValueChange={switchLocale}>
      <SelectTrigger
        size="sm"
        aria-label={`Language: ${LOCALE_NAMES[locale] ?? locale}`}
        title={LOCALE_NAMES[locale] ?? locale}
        className="w-auto gap-1.5 border-0 bg-transparent px-2 text-sm shadow-none hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 [&_svg]:text-foreground!"
      >
        <Globe className="size-4 opacity-70" />
        <span className="text-sm font-medium uppercase">{locale}</span>
      </SelectTrigger>
      <SelectContent
        align="end"
        onPointerDown={() => { closedByPointer.current = true }}
        onPointerDownOutside={() => { closedByPointer.current = true }}
        onKeyDown={() => { closedByPointer.current = false }}
        onCloseAutoFocus={(e) => {
          if (closedByPointer.current) e.preventDefault()
          closedByPointer.current = false
        }}
      >
        {routing.locales.map((l) => (
          <SelectItem key={l} value={l}>{LOCALE_NAMES[l] ?? l.toUpperCase()}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
