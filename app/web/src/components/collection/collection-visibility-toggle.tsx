'use client'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ChevronDown, Link2, Lock, Share2 } from 'lucide-react'
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
import { setCollectionVisibilityAction } from '@/lib/actions/collection-actions'

// Shaped like the deck overview's Publish/Published control, but worded as
// sharing: an outline "Share" button (with a confirm dialog) while private, and
// a "Shared" dropdown with Copy link / Stop sharing while public. The wording
// differs on purpose: a public deck is listed on Explore, so it is published,
// while a public collection is listed nowhere and only reached by its link.
export function CollectionVisibilityToggle({
  initial, shareUrl,
}: {
  initial: 'private' | 'public'
  shareUrl: string
}) {
  const t = useTranslations('collection')
  const [vis, setVis] = useState(initial)
  const [pending, start] = useTransition()

  function setVisibility(next: 'private' | 'public') {
    const prev = vis
    setVis(next)
    start(async () => {
      const res = await setCollectionVisibilityAction(next)
      if (!res.ok) {
        setVis(prev)
        toast.error(t('visibilityError'))
      }
    })
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success(t('linkCopied'))
    } catch {
      toast.error(t('copyError'))
    }
  }

  if (vis === 'private') {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={pending}>
            <Share2 className="size-4" />
            {t('share')}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('shareDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('shareDialog.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('shareDialog.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => setVisibility('public')}>
              {t('shareDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={pending}>
          <Share2 className="size-4" />
          {t('shared')}
          <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={copyLink}>
          <Link2 />
          {t('copyLink')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setVisibility('private')}>
          <Lock />
          {t('stopSharing')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
