'use client'
import { useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil, SquarePen, Copy, Trash2, Eye, EyeOff, Check, X } from 'lucide-react'
import { Link } from '@/../i18n/navigation'
import type { DeckSummary } from '@revelio/db'
import { duplicateDeckAction, deleteDeckAction, updateDeckMetaAction } from '@/lib/deck-actions'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { FieldError } from '@/components/ui/field-error'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

// Row actions (rename/duplicate/delete/visibility) run through server actions
// wrapped in a React transition. Next.js resolves the `revalidatePath('/decks/mine')`
// each action issues into an automatic router refresh as long as the action is
// invoked inside a transition — no manual router.refresh() needed.
export function DeckList({ decks }: { decks: DeckSummary[] }) {
  const t = useTranslations('decks')
  const locale = useLocale()
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [renameError, setRenameError] = useState('')
  const [deckToDelete, setDeckToDelete] = useState<DeckSummary | null>(null)

  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' })

  function startRename(deck: DeckSummary) {
    setRenamingId(deck.id)
    setDraftName(deck.name)
    setRenameError('')
  }

  function cancelRename() {
    setRenamingId(null)
    setDraftName('')
    setRenameError('')
  }

  function saveRename(deck: DeckSummary) {
    const name = draftName.trim()
    if (!name || name === deck.name) {
      cancelRename()
      return
    }
    setRenameError('')
    setPendingId(deck.id)
    startTransition(async () => {
      const res = await updateDeckMetaAction(deck.id, { name })
      setPendingId(null)
      if (res.ok) {
        toast.success(t('list.renamed'))
        cancelRename()
      } else {
        // keep the inline editor open so the error shows where the user typed
        setRenameError(t('list.renameError'))
      }
    })
  }

  function toggleVisibility(deck: DeckSummary) {
    const next = deck.visibility === 'private' ? 'public' : 'private'
    setPendingId(deck.id)
    startTransition(async () => {
      const res = await updateDeckMetaAction(deck.id, { visibility: next })
      setPendingId(null)
      if (res.ok) toast.success(t('list.visibilityUpdated'))
      else toast.error(t('list.visibilityError'))
    })
  }

  function handleDuplicate(deck: DeckSummary) {
    setPendingId(deck.id)
    startTransition(async () => {
      const res = await duplicateDeckAction(deck.id)
      setPendingId(null)
      if (res.ok) toast.success(t('list.duplicated'))
      else toast.error(t('list.duplicateError'))
    })
  }

  function confirmDelete() {
    const deck = deckToDelete
    if (!deck) return
    setDeckToDelete(null)
    setPendingId(deck.id)
    startTransition(async () => {
      const res = await deleteDeckAction(deck.id)
      setPendingId(null)
      if (res.ok) toast.success(t('list.deleted'))
      else toast.error(t('list.deleteError'))
    })
  }

  if (decks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 px-6 py-16 text-center">
        <h2 className="text-lg font-medium">{t('list.empty.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('list.empty.desc')}</p>
        <Button asChild className="mt-4">
          <Link href="/decks/new">{t('list.empty.cta')}</Link>
        </Button>
      </div>
    )
  }

  return (
    <>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {decks.map((deck) => {
        const busy = isPending && pendingId === deck.id
        const isRenaming = renamingId === deck.id
        return (
          <div
            key={deck.id}
            className="group relative flex flex-col gap-3 rounded-xl border border-border/60 bg-card/40 p-4 transition-colors hover:border-accent/60 hover:bg-card/70"
          >
            <div className="flex items-start justify-between gap-2">
              {isRenaming ? (
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <Input
                      autoFocus
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveRename(deck)
                        if (e.key === 'Escape') cancelRename()
                      }}
                      aria-label={t('list.actions.rename')}
                      aria-invalid={!!renameError}
                      className="h-8"
                      disabled={busy}
                    />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => saveRename(deck)}
                      aria-label={t('list.actions.renameSave')}
                    >
                      <Check className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={cancelRename}
                      aria-label={t('list.actions.renameCancel')}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                  <FieldError>{renameError}</FieldError>
                </div>
              ) : (
                <Link
                  href={`/decks/${deck.id}`}
                  className="line-clamp-2 flex-1 font-semibold text-foreground transition-colors group-hover:text-primary after:absolute after:inset-0 after:rounded-xl"
                >
                  {deck.name}
                </Link>
              )}
              {!isRenaming && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={busy}
                      aria-label={t('list.actions.menuLabel', { name: deck.name })}
                      className="relative z-10"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/decks/${deck.id}`}>{t('list.actions.open')}</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/decks/${deck.id}/edit`}>
                        <SquarePen />
                        {t('list.actions.edit')}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => startRename(deck)}>
                      <Pencil />
                      {t('list.actions.rename')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleDuplicate(deck)}>
                      <Copy />
                      {t('list.actions.duplicate')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => toggleVisibility(deck)}>
                      {deck.visibility === 'private' ? <Eye /> : <EyeOff />}
                      {deck.visibility === 'private'
                        ? t('list.actions.makePublic')
                        : t('list.actions.makePrivate')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => setDeckToDelete(deck)}
                      className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                    >
                      <Trash2 />
                      {t('list.actions.delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{t(`format.${deck.format}`)}</Badge>
              <Badge variant={deck.visibility === 'public' ? 'secondary' : 'outline'}>
                {t(`list.visibility.${deck.visibility}`)}
              </Badge>
            </div>

            <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
              <span>{t('list.cardCount', { count: deck.cardCount })}</span>
              <span>{t('list.updatedAt', { date: dateFormatter.format(new Date(deck.updatedAt)) })}</span>
            </div>
          </div>
        )
      })}
    </div>

      <AlertDialog
        open={deckToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setDeckToDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('list.deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('list.deleteDialog.description', { name: deckToDelete?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('list.deleteDialog.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              onClick={confirmDelete}
            >
              {t('list.deleteDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
