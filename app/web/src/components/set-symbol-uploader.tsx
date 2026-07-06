'use client'
import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ImagePlus, Trash2, Loader2 } from 'lucide-react'
import { useRouter } from '@/../i18n/navigation'
import { uploadSetSymbol, removeSetSymbol } from '@/lib/set-actions'
import { SetSymbol } from '@/components/set-symbol'
import { cn } from '@/lib/utils'

export function SetSymbolUploader({
  code,
  hasSymbol,
  imageBase,
}: {
  code: string
  hasSymbol: boolean
  imageBase: string
}) {
  const t = useTranslations('admin.sets')
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function doUpload(file: File) {
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('code', code)
      fd.append('file', file)
      const res = await uploadSetSymbol(fd)
      if (!res.ok) return toast.error(t('saveError'))
      toast.success(t('symbolUpdated'))
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function onRemove() {
    setBusy(true)
    try {
      const res = await removeSetSymbol(code)
      if (!res.ok) return toast.error(t('saveError'))
      toast.success(t('symbolRemoved'))
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        aria-label={t('symbol')}
        aria-busy={busy}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !busy) {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        className={cn(
          'group relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        {hasSymbol && imageBase ? (
          <SetSymbol code={code} base={imageBase} className="h-12 w-12 text-foreground/80" />
        ) : (
          <span className="px-2 text-center text-xs text-muted-foreground">{t('noSymbol')}</span>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
          <ImagePlus className="size-5" />
        </div>
        {busy ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="size-5 animate-spin text-white" />
          </div>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        aria-label={t('uploadSymbol')}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) doUpload(f)
          e.target.value = ''
        }}
      />

      {hasSymbol ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="size-3.5" />
          {t('removeSymbol')}
        </button>
      ) : null}
    </div>
  )
}
