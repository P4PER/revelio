'use client'
import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ChevronDown, Globe, Link2, Lock } from 'lucide-react'
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
import { setCollectionVisibilityAction } from '@/lib/collection-actions'

// Mirrors the deck overview's Publish/Published control: an outline "Publish"
// button (with a confirm dialog) while private, and a "Published" dropdown with
// Copy link / Unpublish while public.
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
          <Button variant="outline" disabled={pending}>
            <Globe className="size-4" />
            {t('publish')}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('publishDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('publishDialog.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('publishDialog.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => setVisibility('public')}>
              {t('publishDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={pending}>
          <Globe className="size-4" />
          {t('published')}
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
          {t('unpublish')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
