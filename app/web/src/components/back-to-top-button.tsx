'use client'
import { ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function BackToTopButton({ label }: { label: string }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <ArrowUp className="size-4" aria-hidden />
    </Button>
  )
}
