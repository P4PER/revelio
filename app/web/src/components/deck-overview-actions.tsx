'use client'
import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ChevronDown, Copy, Globe, Link2, Lock, Pencil } from 'lucide-react'
import type { DeckCardView, DeckFormat } from '@revelio/core'
import { Link, useRouter } from '@/../i18n/navigation'
import { duplicateDeckAction, updateDeckMetaAction } from '@/lib/deck-actions'
import { saveDraft, type BuilderState } from '@/lib/deck-model'
import { DeckExportMenu } from '@/components/deck-export-menu'
import { DeckLikeButton } from '@/components/deck-like-button'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

export function DeckOverviewActions({
  deckId,
  name,
  format,
  visibility,
  views,
  isOwner,
  loggedIn,
  likeCount,
  liked,
}: {
  deckId: string
  name: string
  format: DeckFormat
  visibility: 'private' | 'public'
  views: DeckCardView[]
  isOwner: boolean
  loggedIn: boolean
  likeCount: number
  liked: boolean
}) {
  const t = useTranslations('decks')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const state: BuilderState = { name, format, visibility, entries: views }

  function setVisibility(next: 'private' | 'public') {
    startTransition(async () => {
      const res = await updateDeckMetaAction(deckId, { name, visibility: next })
      if (!res.ok) toast.error(t('list.visibilityError'))
    })
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success(t('overview.linkCopied'))
    } catch {
      toast.error(t('export.copyError'))
    }
  }

  function duplicate() {
    if (loggedIn) {
      startTransition(async () => {
        const res = await duplicateDeckAction(deckId)
        if (res.ok) router.push(`/decks/${res.id}/edit`)
        else toast.error(t('list.duplicateError'))
      })
    } else {
      saveDraft({ name: `${name} (copy)`, format, visibility: 'private', entries: views })
      router.push('/decks/new')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DeckLikeButton deckId={deckId} initialLiked={liked} initialCount={likeCount} loggedIn={loggedIn} />

      {isOwner && (
        <Button asChild>
          <Link href={`/decks/${deckId}/edit`}>
            <Pencil className="size-4" />
            {t('overview.edit')}
          </Link>
        </Button>
      )}

      {isOwner &&
        (visibility === 'private' ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={pending}>
                <Globe className="size-4" />
                {t('overview.publish')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('overview.publishDialog.title')}</AlertDialogTitle>
                <AlertDialogDescription>{t('overview.publishDialog.description')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('overview.publishDialog.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={() => setVisibility('public')}>
                  {t('overview.publishDialog.confirm')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={pending}>
                <Globe className="size-4" />
                {t('overview.published')}
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={copyLink}>
                <Link2 />
                {t('overview.copyLink')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setVisibility('private')}>
                <Lock />
                {t('overview.unpublish')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ))}

      <DeckExportMenu state={state} align="start" variant="outline" size="default" />

      <Button variant="outline" disabled={pending} onClick={duplicate}>
        <Copy className="size-4" />
        {t('overview.duplicate')}
      </Button>
    </div>
  )
}
