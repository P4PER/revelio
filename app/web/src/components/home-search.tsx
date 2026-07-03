'use client'
import { useRouter } from '@/../i18n/navigation'
import { useState } from 'react'
import { Input } from '@/components/ui/input'

export function HomeSearch({ placeholder }: { placeholder: string }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        router.push(`/search?q=${encodeURIComponent(q)}`)
      }}
      className="relative mx-auto mt-8 w-full max-w-3xl"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/revelio-icon.svg"
        alt=""
        className="pointer-events-none absolute left-4 top-1/2 size-9 -translate-y-1/2"
      />
      <Input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="h-16 pl-16 text-[1.5rem] md:text-[1.5rem]"
      />
    </form>
  )
}
