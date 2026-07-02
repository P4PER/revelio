'use client'
import { useRouter } from '@/../i18n/navigation'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function HomeSearch({ placeholder }: { placeholder: string }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  return (
    <form
      role="search"
      onSubmit={(e) => { e.preventDefault(); router.push(`/search?q=${encodeURIComponent(q)}`) }}
      className="mx-auto mt-8 flex max-w-xl gap-2"
    >
      <Input type="search" aria-label={placeholder} placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} className="flex-1" />
      <Button type="submit">Search</Button>
    </form>
  )
}
