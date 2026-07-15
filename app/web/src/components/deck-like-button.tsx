'use client'
import { useState, useTransition } from 'react'
import { Heart } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useRouter } from '@/../i18n/navigation'
import { toggleLikeAction } from '@/lib/deck-actions'
import { cn } from '@/lib/utils'

export function DeckLikeButton({
  deckId,
  initialLiked,
  initialCount,
  loggedIn,
}: {
  deckId: string
  initialLiked: boolean
  initialCount: number
  loggedIn: boolean
}) {
  const t = useTranslations('decks')
  const router = useRouter()
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const [pending, startTransition] = useTransition()

  function onClick(e: React.MouseEvent) {
    e.preventDefault() // entry is wrapped in a link — don't navigate
    e.stopPropagation()
    if (!loggedIn) {
      router.push('/login')
      return
    }
    // Optimistic flip, rolled back on failure.
    const nextLiked = !liked
    setLiked(nextLiked)
    setCount((c) => c + (nextLiked ? 1 : -1))
    startTransition(async () => {
      const res = await toggleLikeAction(deckId)
      if (!res.ok) {
        setLiked(!nextLiked)
        setCount((c) => c + (nextLiked ? -1 : 1))
        toast.error(t('like.error'))
      } else {
        setLiked(res.liked)
        setCount(res.likeCount)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={liked}
      aria-label={t('like.label')}
      className="inline-flex cursor-pointer items-center gap-1 text-base text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-60"
    >
      <Heart className={cn('size-5', liked && 'fill-current text-primary')} />
      {count}
    </button>
  )
}
