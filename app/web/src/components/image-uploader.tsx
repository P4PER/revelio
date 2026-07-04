'use client'
import { useRef, useState } from 'react'
import { useRouter } from '@/../i18n/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { uploadCardImage, removeCardImage } from '@/lib/image-actions'
import { Button } from '@/components/ui/button'

export function ImageUploader({
  cardId, lang, imageSrc, fallbackLang,
}: {
  cardId: string
  lang: string
  imageSrc: string | null
  fallbackLang: string | null
}) {
  const t = useTranslations('edit')
  const locale = useLocale()
  // Spell out the fallback language ("English"/"Deutsch"), localized, from its code.
  const fallbackLabel = fallbackLang
    ? (new Intl.DisplayNames([locale], { type: 'language' }).of(fallbackLang) ?? fallbackLang)
    : null
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  async function onUpload() {
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('cardId', cardId)
      fd.append('lang', lang)
      fd.append('file', file)
      const res = await uploadCardImage(fd)
      if (!res.ok) return toast.error(t('imageFailed'))
      if (res.warning) toast.warning(t('reindexWarning'))
      else toast.success(t('imageUploaded'))
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function onRemove() {
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
    <section className="space-y-3 rounded-md border p-4">
      <h2 className="text-lg font-semibold">{t('image')}</h2>
      <div className="flex gap-4">
        <div className="relative aspect-[5/7] w-28 shrink-0 overflow-hidden rounded-md border bg-muted">
          {imageSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- preview of an arbitrary S3 URL
            <img src={imageSrc} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            aria-label={t('chooseFile')}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block text-sm"
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={busy || !file} onClick={onUpload}>{t('upload')}</Button>
            {imageSrc ? (
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onRemove}>
                {t('removeImage')}
              </Button>
            ) : null}
          </div>
          {fallbackLabel ? (
            <p className="text-xs text-muted-foreground">{t('usingFallback', { lang: fallbackLabel })}</p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
