'use server'
import sharp from 'sharp'
import { revalidatePath } from 'next/cache'
import { imageKey, thumbKey } from '@revelio/core'
import { requireRole } from '@/lib/session'
import { getDb } from '@/lib/db'
import { getCardById, getCardIndexData, setLocalizationImage } from '@revelio/db'
import { getS3, putObject, deleteObject } from '@/lib/s3'
import { getWriteClient } from '@/lib/reindex'
import { reindexCard } from '@revelio/search'
import { routing } from '@/../i18n/routing'

export type ImageResult = { ok: true; warning?: string } | { ok: false; error: string }

const MAX_BYTES = 5 * 1024 * 1024

async function reindex(cardId: string): Promise<string | undefined> {
  try {
    const data = await getCardIndexData(getDb(), cardId)
    if (data) await reindexCard(getWriteClient(), data, [...routing.locales])
    return undefined
  } catch (err) {
    console.error('reindex failed for card', cardId, err)
    return 'reindex-failed'
  }
}

export async function uploadCardImage(formData: FormData): Promise<ImageResult> {
  await requireRole('editor')
  const cardId = String(formData.get('cardId') ?? '')
  const lang = String(formData.get('lang') ?? '')
  const file = formData.get('file')
  if (!cardId || !routing.locales.includes(lang as (typeof routing.locales)[number]) || !(file instanceof File)) {
    return { ok: false, error: 'invalid' }
  }
  if (!file.type.startsWith('image/')) return { ok: false, error: 'type' }
  if (file.size > MAX_BYTES) return { ok: false, error: 'size' }

  const db = getDb()
  const card = await getCardById(db, cardId)
  if (!card) return { ok: false, error: 'invalid' }

  const input = Buffer.from(await file.arrayBuffer())
  const full = await sharp(input).webp({ quality: 90 }).toBuffer()
  const thumb = await sharp(input).webp({ quality: 80 }).resize({ width: 300 }).toBuffer()

  const s3 = getS3()
  await putObject(s3, imageKey(cardId, lang, card.defaultLanguage), full, 'image/webp')
  await putObject(s3, thumbKey(cardId, lang, card.defaultLanguage), thumb, 'image/webp')
  await setLocalizationImage(db, cardId, lang, file.name)

  const warning = await reindex(cardId)
  revalidatePath(`/card/${cardId}`)
  revalidatePath(`/card/${cardId}/edit`)
  return warning ? { ok: true, warning } : { ok: true }
}

export async function removeCardImage(cardId: string, lang: string): Promise<ImageResult> {
  await requireRole('editor')
  if (!cardId || !routing.locales.includes(lang as (typeof routing.locales)[number])) {
    return { ok: false, error: 'invalid' }
  }
  const db = getDb()
  const card = await getCardById(db, cardId)
  if (!card) return { ok: false, error: 'invalid' }

  const s3 = getS3()
  await deleteObject(s3, imageKey(cardId, lang, card.defaultLanguage))
  await deleteObject(s3, thumbKey(cardId, lang, card.defaultLanguage))
  await setLocalizationImage(db, cardId, lang, null)

  const warning = await reindex(cardId)
  revalidatePath(`/card/${cardId}`)
  revalidatePath(`/card/${cardId}/edit`)
  return warning ? { ok: true, warning } : { ok: true }
}
