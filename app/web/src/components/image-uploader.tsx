'use client'
import { useRef, useState } from 'react'
import { useRouter } from '@/../i18n/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ImagePlus, Trash2, Loader2 } from 'lucide-react'
import { uploadCardImage, removeCardImage } from '@/lib/image-actions'
import { FieldError } from '@/components/ui/field-error'
import { cn } from '@/lib/utils'

const MAX_BYTES = 5 * 1024 * 1024

// The card image itself is the upload control: drop a file on it, or hover +
// click to pick one — either way it uploads immediately. A hover ✕ removes this
// language's own image (only shown when the language has one, not a fallback).
export function ImageUploader({
  cardId, lang, imageSrc, fallbackLang,
}: {
  cardId: string
  lang: string
  imageSrc: string | null
  fallbackLang: string | null
}) {
  const t = useTranslations('edit')
  const tv = useTranslations('validation')
  const locale = useLocale()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [fieldError, setFieldError] = useState('')

  const fallbackLabel = fallbackLang
    ? (new Intl.DisplayNames([locale], { type: 'language' }).of(fallbackLang) ?? fallbackLang)
    : null
  const ownImage = !!imageSrc && !fallbackLang

  async function doUpload(file: File) {
    setFieldError('')
    if (!file.type.startsWith('image/')) return setFieldError(tv('fileType'))
    if (file.size > MAX_BYTES) return setFieldError(tv('fileSize'))
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('cardId', cardId)
      fd.append('lang', lang)
      fd.append('file', file)
      const res = await uploadCardImage(fd)
      if (!res.ok) {
        if (res.error === 'type') return setFieldError(tv('fileType'))
        if (res.error === 'size') return setFieldError(tv('fileSize'))
        return toast.error(t('imageFailed'))
      }
      if (res.warning) toast.warning(t('reindexWarning'))
      else toast.success(t('imageUploaded'))
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function onRemove(e: React.MouseEvent) {
    e.stopPropagation()
    setBusy(true)
    try {
      const res = await removeCardImage(cardId, lang)
      if (!res.ok) return toast.error(t('imageFailed'))
      toast.success(t('imageRemoved'))
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
        aria-label={t('changeImage')}
        aria-busy={busy}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !busy) {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!busy) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const f = e.dataTransfer.files?.[0]
          if (f && !busy) doUpload(f)
        }}
        className={cn(
          'group relative flex aspect-[5/7] cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring',
          dragOver && 'ring-2 ring-primary',
        )}
      >
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary S3 URL preview
          <img src={imageSrc} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="px-4 text-center text-sm text-muted-foreground">{t('noImage')}</span>
        )}

        <div
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100',
            dragOver && 'opacity-100',
          )}
        >
          <ImagePlus className="size-6" />
          <span className="text-sm font-medium">{t('changeImage')}</span>
        </div>

        {busy ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="size-6 animate-spin text-white" />
          </div>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        aria-label={t('chooseFile')}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) doUpload(f)
          e.target.value = ''
        }}
      />

      <FieldError>{fieldError}</FieldError>

      {fallbackLabel ? (
        <p className="text-xs text-muted-foreground">{t('usingFallback', { lang: fallbackLabel })}</p>
      ) : null}

      {ownImage ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="size-3.5" />
          {t('removeImage')}
        </button>
      ) : null}
    </div>
  )
}
